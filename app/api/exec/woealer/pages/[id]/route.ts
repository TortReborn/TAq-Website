import { NextRequest, NextResponse } from 'next/server';
import { requireNarwhalSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { slugifyPageName } from '@/lib/woealer';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireNarwhalSession(request);
  if (!session) return NextResponse.json({ error: 'Narwhal access required.' }, { status: 403 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid Woealer page.' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const pool = getPool();
  try {
    if (body.action === 'updateNotes') {
      const result = await pool.query(
        `UPDATE woealer_pages
         SET notes = $1, updated_at = NOW(), updated_by = $2
         WHERE id = $3`,
        [typeof body.notes === 'string' ? body.notes.trim() : '', session.ign, id]
      );
      if (result.rowCount === 0) {
        return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
    if (!name) {
      return NextResponse.json({ error: 'A page name is required.' }, { status: 400 });
    }
    const slug = slugifyPageName(name);
    if (!slug) {
      return NextResponse.json({ error: 'Page names need at least one letter or number.' }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE woealer_pages
       SET name = $1, slug = $2, shared = $3, archived = $4, updated_at = NOW(), updated_by = $5
       WHERE id = $6`,
      [name, slug, body.shared === true, body.archived === true, session.ign, id]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Woealer page update error:', error);
    const code = (error as { code?: string }).code;
    return NextResponse.json(
      { error: code === '23505' ? 'A Woealer page with that name already exists.' : 'Failed to update the page.' },
      { status: code === '23505' ? 409 : 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireNarwhalSession(request);
  if (!session) return NextResponse.json({ error: 'Narwhal access required.' }, { status: 403 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid Woealer page.' }, { status: 400 });
  }

  try {
    const result = await getPool().query(`DELETE FROM woealer_pages WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Woealer page delete error:', error);
    return NextResponse.json({ error: 'Failed to delete the page.' }, { status: 500 });
  }
}
