import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_ROLES = ['DPS', 'HEALER', 'TANK'];
const KEY_REGEX = /^[a-z0-9_]+$/;

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { key, name, role, color, connsUrl, hqUrl } = await request.json();

    if (!key || typeof key !== 'string' || !KEY_REGEX.test(key) || key.length > 32) {
      return NextResponse.json({ error: 'Key must be lowercase alphanumeric with underscores, max 32 chars' }, { status: 400 });
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Role must be DPS, HEALER, or TANK' }, { status: 400 });
    }
    if (!color || typeof color !== 'string') {
      return NextResponse.json({ error: 'Color is required' }, { status: 400 });
    }

    const seedConns = connsUrl?.trim() || '#';
    const seedHq = hqUrl?.trim() || '#';

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get next sort order
      const sortResult = await client.query('SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM build_definitions');
      const nextOrder = sortResult.rows[0].next_order;

      // build_definitions still carries conns_url/hq_url for backwards compat
      // (e.g. the python sync may read them as a fallback). They mirror the
      // initial v1.0 seed values.
      await client.query(
        `INSERT INTO build_definitions (key, name, role, color, conns_url, hq_url, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [key, name.trim(), role, color, seedConns, seedHq, nextOrder]
      );

      // Seed initial v1.0 in build_versions.
      await client.query(
        `INSERT INTO build_versions (build_key, major, minor, conns_url, hq_url, created_by)
         VALUES ($1, 1, 0, $2, $3, $4)`,
        [key, seedConns, seedHq, session.ign]
      );

      await client.query('COMMIT');
      return NextResponse.json({ success: true });
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error?.code === '23505') {
        return NextResponse.json({ error: 'A build with that key already exists' }, { status: 409 });
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Build definition create error:', error);
    return NextResponse.json({ error: 'Failed to create build definition' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Definition-level edit only covers display metadata. Conns/HQ links live
    // on build_versions and are edited via /api/exec/builds/versions.
    const { key, name, role, color } = await request.json();

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Role must be DPS, HEALER, or TANK' }, { status: 400 });
    }
    if (!color || typeof color !== 'string') {
      return NextResponse.json({ error: 'Color is required' }, { status: 400 });
    }

    const pool = getPool();
    const result = await pool.query(
      `UPDATE build_definitions SET name = $2, role = $3, color = $4 WHERE key = $1`,
      [key, name.trim(), role, color]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Build not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Build definition update error:', error);
    return NextResponse.json({ error: 'Failed to update build definition' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { key } = await request.json();
    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      // Remove all member assignments for this build (build_versions cascades
      // automatically via FK on build_definitions).
      await client.query('DELETE FROM member_builds WHERE build_key = $1', [key]);
      const result = await client.query('DELETE FROM build_definitions WHERE key = $1', [key]);
      await client.query('COMMIT');

      if (result.rowCount === 0) {
        return NextResponse.json({ error: 'Build not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Build definition delete error:', error);
    return NextResponse.json({ error: 'Failed to delete build definition' }, { status: 500 });
  }
}
