import { NextRequest, NextResponse } from 'next/server';
import { requireDolphinSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// TAQ-29: archive/restore a whole build or a single version of one.
//   { scope: 'definition', key, action: 'archive' | 'restore' }
//   { scope: 'version', key, major, minor, action: 'archive' | 'restore' }
//
// Only the flag moves. member_builds is never touched — assignments to
// archived builds persist as the record of who had them and feed the
// archived-builds table on the Builds tab. The Discord role change happens
// on the bot's next sync sweep (Tort-Reborn/Tasks/sync_war_builds.py).
//
// Idempotent: repeating an action is a 200 no-op. Restoring a version of a
// still-archived definition is allowed but inert until the definition is
// restored too (the UI communicates this).
export async function POST(request: NextRequest) {
  const session = await requireDolphinSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { scope, key, major, minor, action } = await request.json();

    if (scope !== 'definition' && scope !== 'version') {
      return NextResponse.json({ error: 'scope must be "definition" or "version"' }, { status: 400 });
    }
    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key is required' }, { status: 400 });
    }
    if (action !== 'archive' && action !== 'restore') {
      return NextResponse.json({ error: 'action must be "archive" or "restore"' }, { status: 400 });
    }
    if (scope === 'version' && (typeof major !== 'number' || typeof minor !== 'number')) {
      return NextResponse.json({ error: 'major and minor are required for version scope' }, { status: 400 });
    }

    const archived = action === 'archive';
    const pool = getPool();

    if (scope === 'definition') {
      // affectedMembers = assignments whose *effective* state flips: members
      // pinned to an already-archived version don't change either way.
      const affected = await pool.query(
        `SELECT COUNT(*)::int AS n
           FROM member_builds mb
           JOIN build_versions bv
             ON bv.build_key = mb.build_key
            AND bv.major = mb.version_major AND bv.minor = mb.version_minor
          WHERE mb.build_key = $1 AND NOT bv.archived`,
        [key]
      );

      const result = await pool.query(
        `UPDATE build_definitions
            SET archived = $2,
                archived_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
                archived_by = CASE WHEN $2 THEN $3 ELSE NULL END
          WHERE key = $1 AND archived = NOT $2`,
        [key, archived, session.ign]
      );

      if (result.rowCount === 0) {
        const exists = await pool.query('SELECT 1 FROM build_definitions WHERE key = $1', [key]);
        if (exists.rowCount === 0) {
          return NextResponse.json({ error: 'Build not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, noop: true, affectedMembers: 0 });
      }

      return NextResponse.json({ success: true, affectedMembers: affected.rows[0].n });
    }

    // scope === 'version'
    // Effective state only flips when the definition itself is active.
    const defState = await pool.query('SELECT archived FROM build_definitions WHERE key = $1', [key]);
    if (defState.rowCount === 0) {
      return NextResponse.json({ error: 'Build not found' }, { status: 404 });
    }

    const affected = defState.rows[0].archived
      ? { rows: [{ n: 0 }] }
      : await pool.query(
          `SELECT COUNT(*)::int AS n FROM member_builds
            WHERE build_key = $1 AND version_major = $2 AND version_minor = $3`,
          [key, major, minor]
        );

    const result = await pool.query(
      `UPDATE build_versions
          SET archived = $4,
              archived_at = CASE WHEN $4 THEN NOW() ELSE NULL END,
              archived_by = CASE WHEN $4 THEN $5 ELSE NULL END
        WHERE build_key = $1 AND major = $2 AND minor = $3 AND archived = NOT $4`,
      [key, major, minor, archived, session.ign]
    );

    if (result.rowCount === 0) {
      const exists = await pool.query(
        'SELECT 1 FROM build_versions WHERE build_key = $1 AND major = $2 AND minor = $3',
        [key, major, minor]
      );
      if (exists.rowCount === 0) {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, noop: true, affectedMembers: 0 });
    }

    return NextResponse.json({ success: true, affectedMembers: affected.rows[0].n });
  } catch (error) {
    console.error('Build archive error:', error);
    return NextResponse.json({ error: 'Failed to update archive state' }, { status: 500 });
  }
}
