import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { countWarnings, type WarningEntry, type WarningProfile } from '@/lib/warnings';
import { threadUrl } from '@/lib/warnings-server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid } = await params;
    if (!UUID_RE.test(uuid)) {
      return NextResponse.json({ error: 'Invalid player id' }, { status: 400 });
    }

    const pool = getPool();
    const profileResult = await pool.query(
      `SELECT uuid::text AS uuid, ign, discord_id::text AS discord_id,
              forum_thread_id::text AS forum_thread_id, legacy_threads
       FROM warning_profiles WHERE uuid = $1`,
      [uuid]
    );
    if (profileResult.rows.length === 0) {
      return NextResponse.json({ error: 'No warnings on file for this player' }, { status: 404 });
    }
    const p = profileResult.rows[0];

    const [entriesResult, attachmentsResult] = await Promise.all([
      pool.query(
        `SELECT w.id, w.ign, w.kind, w.rule, w.notes,
                w.issued_by::text AS issued_by, ib.ign AS issued_by_ign, w.issued_at,
                w.revoked_at, w.revoked_by::text AS revoked_by, rb.ign AS revoked_by_ign, w.revoke_reason,
                w.source, w.source_url
         FROM player_warnings w
         LEFT JOIN discord_links ib ON ib.discord_id = w.issued_by
         LEFT JOIN discord_links rb ON rb.discord_id = w.revoked_by
         WHERE w.uuid = $1
         ORDER BY w.issued_at DESC, w.id DESC`,
        [uuid]
      ),
      pool.query(
        `SELECT a.id, a.warning_id, a.filename, a.content_type
         FROM player_warning_attachments a
         JOIN player_warnings w ON w.id = a.warning_id
         WHERE w.uuid = $1 AND a.s3_key <> ''
         ORDER BY a.id`,
        [uuid]
      ),
    ]);

    const attachmentsByWarning = new Map<number, WarningEntry['attachments']>();
    for (const a of attachmentsResult.rows) {
      const list = attachmentsByWarning.get(a.warning_id) ?? [];
      list.push({ id: a.id, filename: a.filename, contentType: a.content_type });
      attachmentsByWarning.set(a.warning_id, list);
    }

    const entries: WarningEntry[] = entriesResult.rows.map(row => ({
      id: row.id,
      ign: row.ign,
      kind: row.kind,
      rule: row.rule,
      notes: row.notes,
      issuedBy: row.issued_by,
      issuedByIgn: row.issued_by_ign,
      issuedAt: row.issued_at,
      revokedAt: row.revoked_at,
      revokedBy: row.revoked_by,
      revokedByIgn: row.revoked_by_ign,
      revokeReason: row.revoke_reason,
      source: row.source,
      sourceLink: row.source_url,
      attachments: attachmentsByWarning.get(row.id) ?? [],
    }));

    const profile: WarningProfile = {
      uuid: p.uuid,
      ign: p.ign,
      discordId: p.discord_id,
      threadUrl: threadUrl(p.forum_thread_id),
      legacyThreads: Array.isArray(p.legacy_threads) ? p.legacy_threads : [],
      counts: countWarnings(entries),
      entries,
    };

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Warning profile fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch warning profile' }, { status: 500 });
  }
}
