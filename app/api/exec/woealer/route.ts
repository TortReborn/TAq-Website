import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession, requireNarwhalSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { loadWoealer, slugifyPageName } from '@/lib/woealer';

export const dynamic = 'force-dynamic';

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function optionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return NextResponse.json(await loadWoealer(getPool()));
  } catch (error) {
    console.error('Woealer fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch Woealer pages.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireNarwhalSession(request);
  if (!session) return NextResponse.json({ error: 'Narwhal access required.' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const pool = getPool();
  try {
    if (body.action === 'createPage') {
      const name = nullableString(body.name);
      if (!name) {
        return NextResponse.json({ error: 'A page name is required.' }, { status: 400 });
      }
      const slug = slugifyPageName(name);
      if (!slug) {
        return NextResponse.json({ error: 'Page names need at least one letter or number.' }, { status: 400 });
      }
      const shared = body.shared === true;
      const sortResult = await pool.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order
         FROM woealer_pages WHERE shared = $1`,
        [shared]
      );
      await pool.query(
        `INSERT INTO woealer_pages (name, slug, shared, notes, sort_order, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [name, slug, shared, optionalText(body.notes), sortResult.rows[0].next_order, session.ign]
      );
    } else if (body.action === 'createSlot') {
      const pageId = positiveInteger(body.pageId);
      const label = nullableString(body.label);
      if (!pageId || !label) {
        return NextResponse.json({ error: 'A page and slot label are required.' }, { status: 400 });
      }
      const pageResult = await pool.query(`SELECT id FROM woealer_pages WHERE id = $1`, [pageId]);
      if (pageResult.rows.length === 0) {
        return NextResponse.json({ error: 'That Woealer page no longer exists.' }, { status: 404 });
      }
      const sortResult = await pool.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order
         FROM woealer_slots WHERE page_id = $1`,
        [pageId]
      );
      await pool.query(
        `INSERT INTO woealer_slots (page_id, label, contents, sort_order, updated_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [pageId, label, optionalText(body.contents), sortResult.rows[0].next_order, session.ign]
      );
    } else if (body.action === 'reorder') {
      const entity = String(body.entity);
      const ids = Array.isArray(body.ids)
        ? body.ids.map(Number).filter(id => Number.isInteger(id) && id > 0)
        : [];
      if (!['page', 'slot'].includes(entity) || ids.length === 0) {
        return NextResponse.json({ error: 'A reorder entity and ordered IDs are required.' }, { status: 400 });
      }
      const table = entity === 'page' ? 'woealer_pages' : 'woealer_slots';
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const [index, id] of ids.entries()) {
          await client.query(
            `UPDATE ${table} SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
            [(index + 1) * 10, id]
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } else {
      return NextResponse.json({ error: 'Unknown Woealer action.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...(await loadWoealer(pool)) });
  } catch (error) {
    console.error('Woealer update error:', error);
    const code = (error as { code?: string }).code;
    return NextResponse.json(
      { error: code === '23505' ? 'A Woealer page with that name already exists.' : 'Failed to update Woealer pages.' },
      { status: code === '23505' ? 409 : 500 }
    );
  }
}
