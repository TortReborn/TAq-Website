import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { normalizeHq } from '@/lib/snipe-constants';

export const dynamic = 'force-dynamic';

// GET — Fetch a single snipe with participants
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid snipe ID' }, { status: 400 });
    }

    const logResult = await pool.query(
      `SELECT id, hq, difficulty, sniped_at, guild_tag, conns, logged_by, season
       FROM snipe_logs WHERE id = $1`,
      [id]
    );

    if (logResult.rows.length === 0) {
      return NextResponse.json({ error: 'Snipe not found' }, { status: 404 });
    }

    const row = logResult.rows[0];
    const partResult = await pool.query(
      `SELECT ign, role FROM snipe_participants WHERE snipe_id = $1 ORDER BY role, ign`,
      [id]
    );

    return NextResponse.json({
      snipe: {
        id: row.id,
        hq: row.hq,
        difficulty: row.difficulty,
        snipedAt: row.sniped_at,
        guildTag: row.guild_tag,
        conns: row.conns,
        loggedBy: row.logged_by,
        season: row.season,
        participants: partResult.rows.map((r: any) => ({ ign: r.ign, role: r.role })),
      },
    });
  } catch (error) {
    console.error('Snipe fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch snipe' }, { status: 500 });
  }
}

// PATCH — Update a snipe log
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid snipe ID' }, { status: 400 });
    }

    // Check exists
    const existing = await pool.query(`SELECT id FROM snipe_logs WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Snipe not found' }, { status: 404 });
    }

    const body = await request.json();
    const { hq, difficulty, guildTag, conns, snipedAt, season, participants } = body;

    // Build SET clause dynamically
    const sets: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (hq !== undefined) {
      const normalizedHq = normalizeHq(hq);
      if (!normalizedHq) {
        return NextResponse.json({ error: `Invalid HQ territory: "${hq}"` }, { status: 400 });
      }
      sets.push(`hq = $${paramIdx++}`);
      values.push(normalizedHq);
    }
    if (difficulty !== undefined) {
      if (difficulty < 1) {
        return NextResponse.json({ error: 'Difficulty must be at least 1' }, { status: 400 });
      }
      sets.push(`difficulty = $${paramIdx++}`);
      values.push(difficulty);
    }
    if (guildTag !== undefined) {
      sets.push(`guild_tag = UPPER($${paramIdx++})`);
      values.push(guildTag);
    }
    if (conns !== undefined) {
      if (conns < 0 || conns > 6) {
        return NextResponse.json({ error: 'Connections must be between 0 and 6' }, { status: 400 });
      }
      sets.push(`conns = $${paramIdx++}`);
      values.push(conns);
    }
    if (snipedAt !== undefined) {
      sets.push(`sniped_at = $${paramIdx++}`);
      values.push(snipedAt);
    }
    if (season !== undefined) {
      sets.push(`season = $${paramIdx++}`);
      values.push(season);
    }

    // Update snipe_logs if any fields changed
    if (sets.length > 0) {
      values.push(id);
      await pool.query(
        `UPDATE snipe_logs SET ${sets.join(', ')} WHERE id = $${paramIdx}`,
        values
      );
    }

    // Replace participants if provided
    if (participants !== undefined) {
      if (!Array.isArray(participants) || participants.length === 0) {
        return NextResponse.json({ error: 'Participants must be a non-empty array' }, { status: 400 });
      }
      for (const p of participants) {
        if (!p.ign || !p.role || !['Tank', 'Healer', 'DPS'].includes(p.role)) {
          return NextResponse.json({ error: 'Each participant must have valid ign and role' }, { status: 400 });
        }
      }

      // Delete old and insert new (within implicit transaction per query)
      await pool.query(`DELETE FROM snipe_participants WHERE snipe_id = $1`, [id]);
      for (const p of participants) {
        await pool.query(
          `INSERT INTO snipe_participants (snipe_id, ign, role) VALUES ($1, $2, $3)`,
          [id, p.ign, p.role]
        );
      }
    }

    // Audit log
    const changes = [];
    if (hq !== undefined) changes.push(`hq=${hq}`);
    if (difficulty !== undefined) changes.push(`diff=${difficulty}k`);
    if (guildTag !== undefined) changes.push(`guild=${guildTag}`);
    if (conns !== undefined) changes.push(`conns=${conns}`);
    if (season !== undefined) changes.push(`season=${season}`);
    if (participants !== undefined) changes.push(`participants=${participants.length}`);

    await pool.query(
      `INSERT INTO audit_log (log_type, actor_name, actor_id, action)
       VALUES ('snipe', $1, $2, $3)`,
      [session.ign, session.discord_id, `Updated snipe #${id}: ${changes.join(', ')}`]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Snipe update error:', error);
    return NextResponse.json({ error: 'Failed to update snipe' }, { status: 500 });
  }
}

// DELETE — Delete a snipe log
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid snipe ID' }, { status: 400 });
    }

    // Get info for audit log before deleting
    const logResult = await pool.query(
      `SELECT hq, difficulty, guild_tag FROM snipe_logs WHERE id = $1`,
      [id]
    );
    if (logResult.rows.length === 0) {
      return NextResponse.json({ error: 'Snipe not found' }, { status: 404 });
    }

    const row = logResult.rows[0];

    // Delete participants first, then log
    await pool.query(`DELETE FROM snipe_participants WHERE snipe_id = $1`, [id]);
    await pool.query(`DELETE FROM snipe_logs WHERE id = $1`, [id]);

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (log_type, actor_name, actor_id, action)
       VALUES ('snipe', $1, $2, $3)`,
      [session.ign, session.discord_id, `Deleted snipe #${id}: ${row.hq} ${row.difficulty}k vs [${row.guild_tag}]`]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Snipe delete error:', error);
    return NextResponse.json({ error: 'Failed to delete snipe' }, { status: 500 });
  }
}
