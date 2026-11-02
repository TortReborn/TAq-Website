/**
 * The aspect queue, read-only, for the Aspects tab of /exec/distribution.
 *
 * Aspects are given out in-game: the TAq management mod previews and commits
 * a distribution through TAq-Management-API (src/distribution.ts), which pays
 * owed aspects (uncollected_raids) to current members first and sends the
 * rest round the rotation in aspect_queue, starting at its marker. That API
 * rebuilds the rotation on every preview (linked, a week in the guild, 5h of
 * playtime that week, not blacklisted), so what is stored here is the
 * rotation as of the last preview.
 */

import { getPool } from '@/lib/db';

export interface AspectRecipient { ign: string; uuid: string; count: number; source: 'uncollected' | 'rotation' | string }

export interface AspectOverview {
  owed: { uuid: string; ign: string | null; count: number; in_guild: boolean }[];
  rotation: { position: number; uuid: string; ign: string | null }[];
  rotation_size: number;
  rotation_updated_at: string | null;
  recent: { id: number; created_at: string; by: string | null; total_aspects: number; recipients: AspectRecipient[] }[];
  blacklist: { uuid: string; ign: string | null; added_at: string }[];
}

const UPCOMING = 30;

export async function getAspectOverview(): Promise<AspectOverview> {
  const pool = getPool();
  const name = (alias: string) => `COALESCE((SELECT ign FROM discord_links WHERE uuid = ${alias}.uuid LIMIT 1), (SELECT ign FROM guild_roster WHERE uuid = ${alias}.uuid))`;
  const [owed, queue, recent, blacklist] = await Promise.all([
    pool.query(`
      SELECT ur.uuid::text, ${name('ur')} AS ign, ur.uncollected_aspects AS count,
             EXISTS (SELECT 1 FROM guild_roster g WHERE g.uuid = ur.uuid) AS in_guild
      FROM uncollected_raids ur WHERE ur.uncollected_aspects > 0
      ORDER BY in_guild DESC, ur.uncollected_aspects DESC`),
    pool.query(`SELECT queue, marker, updated_at::text FROM aspect_queue WHERE id = 1`),
    pool.query(`
      SELECT id, created_at::text, COALESCE(distributed_by_ign, distributed_by::text) AS by,
             total_aspects, distributions AS recipients
      FROM distribution_log ORDER BY created_at DESC LIMIT 15`),
    pool.query(`
      SELECT b.uuid::text, ${name('b')} AS ign, b.added_at::text
      FROM aspect_blacklist b ORDER BY b.added_at DESC`),
  ]);

  const q: string[] = queue.rows[0]?.queue ?? [];
  const marker: number = queue.rows[0]?.marker ?? 0;
  const upcoming = q.length ? Array.from({ length: Math.min(UPCOMING, q.length) }, (_, i) => q[(marker + i) % q.length]) : [];
  const { rows: names } = upcoming.length
    ? await pool.query(`
        SELECT u::text AS uuid, COALESCE((SELECT ign FROM discord_links WHERE uuid = u LIMIT 1), (SELECT ign FROM guild_roster WHERE uuid = u)) AS ign
        FROM unnest($1::uuid[]) AS u`, [[...new Set(upcoming)]])
    : { rows: [] as { uuid: string; ign: string | null }[] };
  const ign = new Map(names.map(r => [r.uuid, r.ign]));

  return {
    owed: owed.rows,
    rotation: upcoming.map((uuid, i) => ({ position: i + 1, uuid, ign: ign.get(uuid) ?? null })),
    rotation_size: q.length,
    rotation_updated_at: queue.rows[0]?.updated_at ?? null,
    recent: recent.rows.map(r => ({ ...r, recipients: Array.isArray(r.recipients) ? r.recipients : [] })),
    blacklist: blacklist.rows,
  };
}
