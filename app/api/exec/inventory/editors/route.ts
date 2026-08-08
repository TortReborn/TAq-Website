import { NextRequest, NextResponse } from 'next/server';
import { EXEC_RANKS, requireNarwhalSession } from '@/lib/exec-auth';
import { listInventoryEditors } from '@/lib/inventory-access';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Narwhal-only management of the inventory edit grant list (TAQ-62).
// Grantees cannot see or change this route, so a grant can't escalate itself.

function discordId(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  return /^\d{5,25}$/.test(text) ? text : null;
}

async function listCandidates() {
  const result = await getPool().query(
    `SELECT discord_id, ign, rank
     FROM discord_links
     WHERE rank = ANY($1::text[])
       AND discord_id NOT IN (SELECT discord_id FROM inventory_editors)
     ORDER BY ign`,
    [EXEC_RANKS]
  );
  return result.rows.map(row => ({
    discordId: String(row.discord_id),
    ign: row.ign,
    rank: row.rank,
  }));
}

export async function GET(request: NextRequest) {
  const session = await requireNarwhalSession(request);
  if (!session) return NextResponse.json({ error: 'Narwhal access required.' }, { status: 403 });

  try {
    const [editors, candidates] = await Promise.all([listInventoryEditors(getPool()), listCandidates()]);
    return NextResponse.json({ editors, candidates });
  } catch (error) {
    console.error('Inventory editors fetch error:', error);
    return NextResponse.json({ error: 'Failed to load inventory editors.' }, { status: 500 });
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

  const id = discordId(body.discordId);
  if (!id) return NextResponse.json({ error: 'A member is required.' }, { status: 400 });

  try {
    const pool = getPool();
    const link = await pool.query(
      `SELECT rank FROM discord_links WHERE discord_id = $1`,
      [id]
    );
    if (link.rows.length === 0) {
      return NextResponse.json({ error: 'That Discord account is not linked to a guild member.' }, { status: 400 });
    }
    if (!EXEC_RANKS.includes(link.rows[0].rank)) {
      return NextResponse.json(
        { error: 'Only members with exec access (Hammerhead or higher) can be granted inventory edit.' },
        { status: 400 }
      );
    }

    await pool.query(
      `INSERT INTO inventory_editors (discord_id, granted_by, granted_by_ign, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (discord_id) DO UPDATE
         SET granted_by = EXCLUDED.granted_by,
             granted_by_ign = EXCLUDED.granted_by_ign,
             note = EXCLUDED.note,
             granted_at = NOW()`,
      [id, session.discord_id, session.ign, typeof body.note === 'string' ? body.note.trim() : '']
    );

    const [editors, candidates] = await Promise.all([listInventoryEditors(pool), listCandidates()]);
    return NextResponse.json({ success: true, editors, candidates });
  } catch (error) {
    console.error('Inventory editor grant error:', error);
    return NextResponse.json({ error: 'Failed to grant inventory edit access.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireNarwhalSession(request);
  if (!session) return NextResponse.json({ error: 'Narwhal access required.' }, { status: 403 });

  const id = discordId(request.nextUrl.searchParams.get('discordId'));
  if (!id) return NextResponse.json({ error: 'A member is required.' }, { status: 400 });

  try {
    const pool = getPool();
    await pool.query(`DELETE FROM inventory_editors WHERE discord_id = $1`, [id]);
    const [editors, candidates] = await Promise.all([listInventoryEditors(pool), listCandidates()]);
    return NextResponse.json({ success: true, editors, candidates });
  } catch (error) {
    console.error('Inventory editor revoke error:', error);
    return NextResponse.json({ error: 'Failed to revoke inventory edit access.' }, { status: 500 });
  }
}
