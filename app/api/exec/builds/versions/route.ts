import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { computeNextVersion } from '@/lib/build-constants';

export const dynamic = 'force-dynamic';

// POST: bump to a new version (minor or major).
//   { buildKey, bump: 'minor' | 'major', connsUrl?, hqUrl?, notes? }
// Existing member_builds rows are intentionally NOT touched — they stay
// pinned to their current version until an exec moves them.
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { buildKey, bump, connsUrl, hqUrl, notes } = await request.json();

    if (!buildKey || typeof buildKey !== 'string') {
      return NextResponse.json({ error: 'buildKey is required' }, { status: 400 });
    }
    if (bump !== 'minor' && bump !== 'major') {
      return NextResponse.json({ error: 'bump must be "minor" or "major"' }, { status: 400 });
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      // Confirm the parent definition exists.
      const defCheck = await client.query('SELECT 1 FROM build_definitions WHERE key = $1', [buildKey]);
      if (defCheck.rowCount === 0) {
        return NextResponse.json({ error: 'Invalid build key' }, { status: 400 });
      }

      // Find the latest existing version (if any).
      const latestResult = await client.query(
        `SELECT major, minor, conns_url, hq_url
         FROM build_versions
         WHERE build_key = $1
         ORDER BY major DESC, minor DESC
         LIMIT 1`,
        [buildKey]
      );
      const latest = latestResult.rows[0]
        ? {
            major: latestResult.rows[0].major as number,
            minor: latestResult.rows[0].minor as number,
            connsUrl: latestResult.rows[0].conns_url as string,
            hqUrl: latestResult.rows[0].hq_url as string,
          }
        : null;

      const next = computeNextVersion(latest, bump);

      // Default to the previous version's links if the caller doesn't override.
      const newConns = (typeof connsUrl === 'string' && connsUrl.trim()) || latest?.connsUrl || '#';
      const newHq = (typeof hqUrl === 'string' && hqUrl.trim()) || latest?.hqUrl || '#';
      const newNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;

      await client.query(
        `INSERT INTO build_versions (build_key, major, minor, conns_url, hq_url, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [buildKey, next.major, next.minor, newConns, newHq, newNotes, session.ign]
      );

      return NextResponse.json({ success: true, version: next });
    } finally {
      client.release();
    }
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'That version already exists' }, { status: 409 });
    }
    console.error('Build version create error:', error);
    return NextResponse.json({ error: 'Failed to create build version' }, { status: 500 });
  }
}

// PATCH: edit metadata of an existing version.
//   { buildKey, major, minor, connsUrl?, hqUrl?, notes? }
export async function PATCH(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { buildKey, major, minor, connsUrl, hqUrl, notes } = await request.json();

    if (!buildKey || typeof buildKey !== 'string') {
      return NextResponse.json({ error: 'buildKey is required' }, { status: 400 });
    }
    if (typeof major !== 'number' || typeof minor !== 'number') {
      return NextResponse.json({ error: 'major and minor are required' }, { status: 400 });
    }

    const pool = getPool();
    const result = await pool.query(
      `UPDATE build_versions
         SET conns_url = COALESCE($4, conns_url),
             hq_url    = COALESCE($5, hq_url),
             notes     = COALESCE($6, notes)
       WHERE build_key = $1 AND major = $2 AND minor = $3`,
      [
        buildKey,
        major,
        minor,
        typeof connsUrl === 'string' ? connsUrl.trim() || '#' : null,
        typeof hqUrl === 'string' ? hqUrl.trim() || '#' : null,
        typeof notes === 'string' ? (notes.trim() || null) : null,
      ]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Build version update error:', error);
    return NextResponse.json({ error: 'Failed to update build version' }, { status: 500 });
  }
}

// DELETE: remove a single version. Disallowed if any member_builds row
// references it (the FK is ON DELETE CASCADE, but we don't want to silently
// drop members from a build by deleting their version).
export async function DELETE(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { buildKey, major, minor } = await request.json();

    if (!buildKey || typeof buildKey !== 'string') {
      return NextResponse.json({ error: 'buildKey is required' }, { status: 400 });
    }
    if (typeof major !== 'number' || typeof minor !== 'number') {
      return NextResponse.json({ error: 'major and minor are required' }, { status: 400 });
    }

    const pool = getPool();

    const inUse = await pool.query(
      `SELECT COUNT(*)::int AS n FROM member_builds
       WHERE build_key = $1 AND version_major = $2 AND version_minor = $3`,
      [buildKey, major, minor]
    );
    if ((inUse.rows[0]?.n ?? 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${inUse.rows[0].n} member(s) are still on this version` },
        { status: 409 }
      );
    }

    const result = await pool.query(
      `DELETE FROM build_versions WHERE build_key = $1 AND major = $2 AND minor = $3`,
      [buildKey, major, minor]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Build version delete error:', error);
    return NextResponse.json({ error: 'Failed to delete build version' }, { status: 500 });
  }
}
