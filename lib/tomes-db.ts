/**
 * Tome requests on the exec Tome Queue page (TAQ-116). Requests are made by
 * the bot's "Request tomes" button; here exec gives them out, moves them
 * between buckets, cancels them (refunding shells) and records debt and
 * adjustments. Every change is one transaction that writes a tome_events
 * row and an audit_log line; 'given' events are posted to Discord by the bot.
 */

import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import { allocate, raidRefund, type Allocation, type OpenRequest, type TomeBucket, type TomeKind } from '@/lib/tomes';

export interface Actor { id: string; name: string }

export class TomeConflict extends Error {}

export interface TomeEvent {
  id: number; ign: string | null; action: string; kind: TomeKind | null; count: number;
  actor_name: string | null; note: string | null; created_at: string;
}

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function audit(c: PoolClient, actor: Actor, action: string) {
  await c.query(`INSERT INTO audit_log (log_type, actor_name, actor_id, action) VALUES ('tome', $1, $2, $3)`, [actor.name, actor.id, action]);
}

const plural = (n: number, kind: TomeKind | null) => `${n} ${kind ? `${kind} ` : ''}tome${n === 1 ? '' : 's'}`;

export async function getOpenRequests(): Promise<(OpenRequest & { shells_spent: number; source: string; note: string | null; discord_id: string | null })[]> {
  const { rows } = await getPool().query(`
    SELECT r.id, r.uuid::text, r.ign, r.kind, r.count, r.given, r.priority, r.bucket, r.shells_spent, r.source, r.note,
           r.discord_id::text, r.created_at::text,
           EXISTS (SELECT 1 FROM guild_roster g WHERE g.uuid = r.uuid) AS in_guild
    FROM tome_requests r WHERE r.status = 'open'
  `);
  return rows;
}

export async function getRecentEvents(limit = 40): Promise<TomeEvent[]> {
  const { rows } = await getPool().query(`
    SELECT e.id, COALESCE(r.ign, l.ign, g.ign) AS ign, e.action, e.kind, e.count, e.actor_name, e.note, e.created_at::text
    FROM tome_events e
    LEFT JOIN tome_requests r ON r.id = e.request_id
    LEFT JOIN discord_links l ON l.uuid = e.uuid
    LEFT JOIN guild_roster g ON g.uuid = e.uuid
    ORDER BY e.created_at DESC, e.id DESC LIMIT $1
  `, [limit]);
  return rows;
}

/** What `tomes` tomes would go to, without writing anything. */
export async function previewDistribution(tomes: number): Promise<Allocation[]> {
  return allocate(await getOpenRequests(), tomes);
}

/**
 * Give out a plan from previewDistribution (or one request's tomes). Each
 * request is locked and re-checked: if someone changed it since the preview,
 * nothing is written and the caller previews again.
 */
export async function give(plan: { request_id: number; count: number }[], actor: Actor): Promise<number> {
  if (!plan.length) return 0;
  return tx(async c => {
    let total = 0;
    for (const item of plan) {
      const { rows: [r] } = await c.query(
        `SELECT id, uuid::text, ign, kind, count, given, status FROM tome_requests WHERE id = $1 FOR UPDATE`, [item.request_id]);
      if (!r || r.status !== 'open' || !Number.isInteger(item.count) || item.count < 1 || r.given + item.count > r.count) {
        throw new TomeConflict(`Request #${item.request_id} changed since the preview; preview again.`);
      }
      const given = r.given + item.count;
      await c.query(
        `UPDATE tome_requests SET given = $2, status = CASE WHEN $2 = count THEN 'done' ELSE 'open' END, updated_at = NOW() WHERE id = $1`,
        [r.id, given]);
      await c.query(
        `INSERT INTO tome_events (uuid, request_id, action, kind, count, actor_id, actor_name) VALUES ($1, $2, 'given', $3, $4, $5, $6)`,
        [r.uuid, r.id, r.kind, item.count, actor.id, actor.name]);
      await audit(c, actor, `Gave ${plural(item.count, r.kind)} to ${r.ign} (request #${r.id}, ${given}/${r.count})`);
      total += item.count;
    }
    return total;
  });
}

export async function moveRequest(id: number, bucket: TomeBucket, actor: Actor): Promise<void> {
  await tx(async c => {
    const { rows: [r] } = await c.query(`SELECT uuid::text, ign, bucket, status FROM tome_requests WHERE id = $1 FOR UPDATE`, [id]);
    if (!r || r.status !== 'open') throw new TomeConflict('That request is no longer open.');
    if (r.bucket === bucket) return;
    await c.query(`UPDATE tome_requests SET bucket = $2, updated_at = NOW() WHERE id = $1`, [id, bucket]);
    await c.query(
      `INSERT INTO tome_events (uuid, request_id, action, actor_id, actor_name, note) VALUES ($1, $2, 'moved', $3, $4, $5)`,
      [r.uuid, id, actor.id, actor.name, `${r.bucket} -> ${bucket}`]);
    await audit(c, actor, `Moved ${r.ign}'s request #${id} from ${r.bucket} to ${bucket}`);
  });
}

/** Cancel what hasn't been given yet; raid tomes' shells for it go back. */
export async function cancelRequest(id: number, actor: Actor, reason: string): Promise<{ refunded: number }> {
  return tx(async c => {
    const { rows: [r] } = await c.query(
      `SELECT uuid::text, ign, kind, count, given, status, shells_spent, discord_id::text FROM tome_requests WHERE id = $1 FOR UPDATE`, [id]);
    if (!r || r.status !== 'open') throw new TomeConflict('That request is no longer open.');
    const refund = r.kind === 'raid' ? raidRefund(r.count, r.given, r.shells_spent) : 0;
    if (refund > 0) {
      if (!r.discord_id) throw new TomeConflict('This request has no Discord account to refund; adjust shells by hand.');
      const { rows: [bal] } = await c.query(`
        UPDATE shells SET balance = balance + $2 WHERE "user" = $1 RETURNING balance, shells`, [r.discord_id, refund]);
      if (!bal) throw new TomeConflict('No shell balance found to refund into.');
      await c.query(`
        INSERT INTO shell_transactions ("user", delta_balance, delta_shells, balance_after, shells_after, source, reason, actor_id, actor_name)
        VALUES ($1, $2, 0, $3, $4, 'tome_refund', $5, $6, $7)
      `, [r.discord_id, refund, bal.balance, bal.shells, `Cancelled tome request #${id}`, actor.id, actor.name]);
    }
    await c.query(`UPDATE tome_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [id]);
    await c.query(
      `INSERT INTO tome_events (uuid, request_id, action, kind, count, actor_id, actor_name, note) VALUES ($1, $2, 'cancelled', $3, $4, $5, $6, $7)`,
      [r.uuid, id, r.kind, r.count - r.given, actor.id, actor.name, reason || null]);
    await audit(c, actor, `Cancelled ${plural(r.count - r.given, r.kind)} of ${r.ign}'s request #${id}`
      + (refund ? `, refunding ${refund} shells` : '') + (reason ? `: ${reason}` : ''));
    return { refunded: refund };
  });
}

export interface MemberTomes {
  uuid: string; ign: string; discord_id: string | null; in_guild: boolean; wars: number | null;
  received: { war: number; raid: number; any: number }; debt: number;
  requests: (OpenRequest & { status: string; shells_spent: number; note: string | null })[];
  events: TomeEvent[];
}

export async function findMember(name: string): Promise<MemberTomes | null> {
  const pool = getPool();
  const { rows: [m] } = await pool.query(`
    SELECT uuid::text, ign, discord_id::text FROM (
      SELECT uuid, ign, NULL::bigint AS discord_id, 0 AS o FROM guild_roster WHERE lower(ign) = lower($1)
      UNION ALL SELECT uuid, ign, discord_id, 1 FROM discord_links WHERE lower(ign) = lower($1) AND uuid IS NOT NULL
      UNION ALL SELECT uuid, ign, discord_id, 2 FROM tome_requests WHERE lower(ign) = lower($1)
    ) x ORDER BY o LIMIT 1
  `, [name.trim()]);
  if (!m) return null;
  const [{ rows: sums }, { rows: reqs }, { rows: events }, { rows: [extra] }] = await Promise.all([
    pool.query(`SELECT kind, action, COALESCE(SUM(count), 0)::int AS n FROM tome_events
                WHERE uuid = $1 AND action IN ('given', 'debt', 'adjusted') GROUP BY kind, action`, [m.uuid]),
    pool.query(`SELECT id, uuid::text, ign, kind, count, given, priority, bucket, status, shells_spent, note, created_at::text, TRUE AS in_guild
                FROM tome_requests WHERE uuid = $1 ORDER BY created_at DESC`, [m.uuid]),
    pool.query(`SELECT e.id, NULL AS ign, e.action, e.kind, e.count, e.actor_name, e.note, e.created_at::text
                FROM tome_events e WHERE e.uuid = $1 ORDER BY e.created_at DESC, e.id DESC LIMIT 100`, [m.uuid]),
    pool.query(`SELECT EXISTS (SELECT 1 FROM guild_roster WHERE uuid = $1) AS in_guild,
                       (SELECT discord_id::text FROM discord_links WHERE uuid = $1 LIMIT 1) AS discord_id,
                       (SELECT wars FROM player_activity WHERE uuid = $1 AND wars > 0 ORDER BY snapshot_date DESC LIMIT 1) AS wars`, [m.uuid]),
  ]);
  const received = { war: 0, raid: 0, any: 0 };
  let debt = 0;
  for (const s of sums) {
    received[(s.kind ?? 'any') as 'war' | 'raid' | 'any'] += s.n;
    if (s.action === 'debt') debt += s.n;
  }
  return {
    uuid: m.uuid, ign: m.ign, discord_id: m.discord_id ?? extra.discord_id, in_guild: extra.in_guild, wars: extra.wars,
    received, debt, requests: reqs.map(r => ({ ...r, in_guild: extra.in_guild })), events,
  };
}

/** Debt (tomes given before they were earned) or a signed adjustment, for one member. */
export async function recordForMember(uuid: string, action: 'debt' | 'adjusted', kind: TomeKind | null, count: number,
                                      note: string, actor: Actor, ign: string): Promise<void> {
  await tx(async c => {
    await c.query(
      `INSERT INTO tome_events (uuid, action, kind, count, actor_id, actor_name, note) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uuid, action, action === 'debt' ? 'war' : kind, count, actor.id, actor.name, note]);
    await audit(c, actor, action === 'debt'
      ? `Recorded ${plural(count, 'war')} of debt for ${ign}: ${note}`
      : `Adjusted ${ign}'s ${kind ?? 'unsorted'} tomes by ${count > 0 ? '+' : ''}${count}: ${note}`);
  });
}
