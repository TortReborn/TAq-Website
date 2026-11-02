/**
 * Recruitment tracking on the exec Recruitment page (TAQ-140). Exec members
 * clock themselves in and out of pfinder recruiting (or log a past session),
 * and log each guild shout against the shared limit of 3 a UTC day. Every
 * change is one transaction with an audit_log line.
 */

import type { Pool, PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import {
  MAX_SESSION_HOURS, MESSAGE_LIMITS, SHOUTS_PER_DAY, cleanMessage, messageLength, utcDay, utcTime,
  type Application, type MessageKind, type PfinderSession, type RecruitmentMessage, type Shout,
} from '@/lib/recruitment';

export interface Actor { id: string; name: string }

/** A request the rules refuse; status is the HTTP status to answer with. */
export class RecruitmentError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

/** Clock skew allowed on times sent from the browser. */
const FUTURE_SLACK_MS = 2 * 60_000;
const MAX_SESSION_MS = MAX_SESSION_HOURS * 3_600_000;

async function tx<T>(db: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
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
  await c.query(`INSERT INTO audit_log (log_type, actor_name, actor_id, action) VALUES ('recruitment', $1, $2, $3)`, [actor.name, actor.id, action]);
}

const SESSION_COLS = `id, discord_id::text, ign, started_at, ended_at`;
const SHOUT_COLS = `id, discord_id::text, ign, shouted_at, slot`;

const toSession = (r: any): PfinderSession => ({
  id: r.id, discord_id: r.discord_id, ign: r.ign,
  started_at: r.started_at.toISOString(), ended_at: r.ended_at ? r.ended_at.toISOString() : null,
});
const toShout = (r: any): Shout => ({
  id: r.id, discord_id: r.discord_id, ign: r.ign, shouted_at: r.shouted_at.toISOString(), slot: r.slot,
});

const stamp = (d: Date) => `${utcDay(d)} ${utcTime(d)} UTC`;

function notFuture(at: Date, what: string) {
  if (at.getTime() > Date.now() + FUTURE_SLACK_MS) throw new RecruitmentError(`${what} can't be in the future.`, 400);
}

/**
 * Sessions overlapping [start, end) (open ones included), the shouts in it,
 * and the guild applications submitted in it: what the recruiting led to.
 */
export async function getRange(start: Date, end: Date, db: Pool = getPool()): Promise<{ sessions: PfinderSession[]; shouts: Shout[]; applications: Application[] }> {
  const [sessions, shouts, applications] = await Promise.all([
    db.query(`SELECT ${SESSION_COLS} FROM recruitment_pfinder_sessions
              WHERE started_at < $2 AND (ended_at IS NULL OR ended_at > $1) ORDER BY started_at`, [start, end]),
    db.query(`SELECT ${SHOUT_COLS} FROM recruitment_shouts
              WHERE shouted_at >= $1 AND shouted_at < $2 ORDER BY shouted_at`, [start, end]),
    db.query(`SELECT id, answers->>'ign' AS ign, status, submitted_at FROM applications
              WHERE application_type = 'guild' AND submitted_at >= $1 AND submitted_at < $2 ORDER BY submitted_at`, [start, end]),
  ]);
  return {
    sessions: sessions.rows.map(toSession),
    shouts: shouts.rows.map(toShout),
    applications: applications.rows.map(r => ({ id: r.id, ign: r.ign, status: r.status, submitted_at: r.submitted_at.toISOString() })),
  };
}

const toMessage = (r: any): RecruitmentMessage => ({ kind: r.kind, body: r.body, ign: r.ign, updated_at: r.updated_at.toISOString() });

/** How many of the latest shouts the history lists, whatever week the calendar is on. */
export const RECENT_SHOUTS = 60;

/** Who is clocked in right now, today's (UTC) shouts, the latest shouts newest first, and the saved messages. */
export async function getLive(db: Pool = getPool()): Promise<{ open: PfinderSession[]; today: Shout[]; recent: Shout[]; messages: RecruitmentMessage[] }> {
  const [open, today, recent, messages] = await Promise.all([
    db.query(`SELECT ${SESSION_COLS} FROM recruitment_pfinder_sessions WHERE ended_at IS NULL ORDER BY started_at`),
    db.query(`SELECT ${SHOUT_COLS} FROM recruitment_shouts
              WHERE shout_day = (NOW() AT TIME ZONE 'UTC')::date ORDER BY shouted_at`),
    db.query(`SELECT ${SHOUT_COLS} FROM recruitment_shouts ORDER BY shouted_at DESC LIMIT $1`, [RECENT_SHOUTS]),
    db.query(`SELECT kind, body, ign, updated_at FROM recruitment_messages ORDER BY kind`),
  ]);
  return {
    open: open.rows.map(toSession), today: today.rows.map(toShout), recent: recent.rows.map(toShout), messages: messages.rows.map(toMessage),
  };
}

/**
 * Replace the guild's pfinder or shout message. `seen` is the updated_at the
 * editor started from (null if there was none), so an edit made meanwhile by
 * someone else is refused rather than silently overwritten.
 */
export async function saveMessage(actor: Actor, kind: MessageKind, text: string, seen: string | null, db: Pool = getPool()): Promise<RecruitmentMessage> {
  const body = cleanMessage(text);
  const limit = MESSAGE_LIMITS[kind];
  if (messageLength(body) > limit) throw new RecruitmentError(`The ${kind} message can be at most ${limit} characters.`, 400);
  const changed = (ign: string, at: Date) =>
    new RecruitmentError(`${ign} changed the ${kind} message at ${stamp(at)}. Copy your text, then reload to see theirs.`);
  try {
    return await tx(db, async c => {
      const { rows: [cur] } = await c.query(`SELECT ign, updated_at FROM recruitment_messages WHERE kind = $1 FOR UPDATE`, [kind]);
      if ((cur?.updated_at.toISOString() ?? null) !== seen) {
        throw cur ? changed(cur.ign, cur.updated_at) : new RecruitmentError(`The ${kind} message isn't there any more. Reload and try again.`);
      }
      // The first save inserts; if two race, the primary key refuses the second
      const { rows: [r] } = await c.query(cur
        ? `UPDATE recruitment_messages SET body = $2, discord_id = $3, ign = $4, updated_at = NOW() WHERE kind = $1 RETURNING kind, body, ign, updated_at`
        : `INSERT INTO recruitment_messages (kind, body, discord_id, ign) VALUES ($1, $2, $3, $4) RETURNING kind, body, ign, updated_at`,
        [kind, body, actor.id, actor.name]);
      await audit(c, actor, `Set the ${kind} message: "${body}"`);
      return toMessage(r);
    });
  } catch (e: any) {
    if (e?.code === '23505') throw new RecruitmentError(`Someone saved the ${kind} message at the same moment. Copy your text, then reload to see theirs.`);
    throw e;
  }
}

/** Serializes one member's session writes, so two can't race past the overlap check. */
async function lockMember(c: PoolClient, discordId: string) {
  await c.query(`SELECT pg_advisory_xact_lock(hashtext('recruitment_pfinder:' || $1))`, [discordId]);
}

/** Refuse a session that would double-count time against one already recorded. */
async function assertNoOverlap(c: PoolClient, discordId: string, start: Date, end: Date | null, exceptId?: number) {
  const { rows: [clash] } = await c.query(
    `SELECT started_at, ended_at FROM recruitment_pfinder_sessions
     WHERE discord_id = $1 AND id <> $4
       AND started_at < COALESCE($3::timestamptz, 'infinity') AND COALESCE(ended_at, 'infinity') > $2
     ORDER BY started_at LIMIT 1`,
    [discordId, start, end, exceptId ?? 0]);
  if (clash) {
    throw new RecruitmentError(`That overlaps your session from ${stamp(clash.started_at)}${clash.ended_at ? ` to ${stamp(clash.ended_at)}` : ' (still open)'}.`);
  }
}

export async function clockIn(actor: Actor, at: Date, db: Pool = getPool()): Promise<PfinderSession> {
  notFuture(at, 'Clock-in time');
  if (Date.now() - at.getTime() > MAX_SESSION_MS) throw new RecruitmentError(`Clock in within the last ${MAX_SESSION_HOURS} hours, or log a past session instead.`, 400);
  return tx(db, async c => {
    await lockMember(c, actor.id);
    const { rows: [open] } = await c.query(`SELECT 1 FROM recruitment_pfinder_sessions WHERE discord_id = $1 AND ended_at IS NULL`, [actor.id]);
    if (open) throw new RecruitmentError("You're already clocked in.");
    await assertNoOverlap(c, actor.id, at, null);
    const { rows: [r] } = await c.query(
      `INSERT INTO recruitment_pfinder_sessions (discord_id, ign, started_at) VALUES ($1, $2, $3) RETURNING ${SESSION_COLS}`,
      [actor.id, actor.name, at]);
    await audit(c, actor, `Clocked in to pfinder at ${stamp(at)}`);
    return toSession(r);
  });
}

export async function clockOut(actor: Actor, at: Date, db: Pool = getPool()): Promise<PfinderSession> {
  notFuture(at, 'Clock-out time');
  return tx(db, async c => {
    await lockMember(c, actor.id);
    const { rows: [open] } = await c.query(
      `SELECT id, started_at FROM recruitment_pfinder_sessions WHERE discord_id = $1 AND ended_at IS NULL FOR UPDATE`, [actor.id]);
    if (!open) throw new RecruitmentError("You're not clocked in.");
    if (at <= open.started_at) throw new RecruitmentError(`Clock out after you clocked in (${stamp(open.started_at)}).`, 400);
    if (at.getTime() - open.started_at.getTime() > MAX_SESSION_MS) {
      throw new RecruitmentError(`That's over ${MAX_SESSION_HOURS} hours. Set the time you actually stopped.`, 400);
    }
    await assertNoOverlap(c, actor.id, open.started_at, at, open.id);
    const { rows: [r] } = await c.query(
      `UPDATE recruitment_pfinder_sessions SET ended_at = $2 WHERE id = $1 RETURNING ${SESSION_COLS}`, [open.id, at]);
    await audit(c, actor, `Clocked out of pfinder at ${stamp(at)} (session #${open.id})`);
    return toSession(r);
  });
}

/** A session that already happened, for someone who forgot to clock in. */
export async function logSession(actor: Actor, start: Date, end: Date, db: Pool = getPool()): Promise<PfinderSession> {
  notFuture(end, 'The end time');
  if (end <= start) throw new RecruitmentError('The end has to be after the start.', 400);
  if (end.getTime() - start.getTime() > MAX_SESSION_MS) throw new RecruitmentError(`A session can be at most ${MAX_SESSION_HOURS} hours.`, 400);
  return tx(db, async c => {
    await lockMember(c, actor.id);
    await assertNoOverlap(c, actor.id, start, end);
    const { rows: [r] } = await c.query(
      `INSERT INTO recruitment_pfinder_sessions (discord_id, ign, started_at, ended_at) VALUES ($1, $2, $3, $4) RETURNING ${SESSION_COLS}`,
      [actor.id, actor.name, start, end]);
    await audit(c, actor, `Logged a pfinder session from ${stamp(start)} to ${stamp(end)}`);
    return toSession(r);
  });
}

/** Your own session, or anyone's when canManage. */
export async function deleteSession(id: number, actor: Actor, canManage: boolean, db: Pool = getPool()): Promise<void> {
  await tx(db, async c => {
    const { rows: [s] } = await c.query(`SELECT ${SESSION_COLS} FROM recruitment_pfinder_sessions WHERE id = $1 FOR UPDATE`, [id]);
    if (!s) throw new RecruitmentError('That session is already gone.', 404);
    if (s.discord_id !== actor.id && !canManage) throw new RecruitmentError('You can only remove your own sessions.', 403);
    await c.query(`DELETE FROM recruitment_pfinder_sessions WHERE id = $1`, [id]);
    await audit(c, actor, `Removed ${s.ign}'s pfinder session #${id} from ${stamp(s.started_at)}${s.ended_at ? ` to ${stamp(s.ended_at)}` : ' (open)'}`);
  });
}

/**
 * Log a shout into the first free slot of its UTC day. With all slots taken
 * nothing is written; if someone takes the last slot at the same moment, the
 * unique key refuses the second insert.
 */
export async function logShout(actor: Actor, at: Date, db: Pool = getPool()): Promise<Shout> {
  notFuture(at, 'The shout time');
  try {
    return await tx(db, async c => {
      const { rows: [r] } = await c.query(
        `INSERT INTO recruitment_shouts (discord_id, ign, shouted_at, slot)
         SELECT $1::bigint, $2::text, $3::timestamptz, s FROM generate_series(1, $4::int) s
         WHERE s NOT IN (SELECT slot FROM recruitment_shouts WHERE shout_day = ($3::timestamptz AT TIME ZONE 'UTC')::date)
         ORDER BY s LIMIT 1
         RETURNING ${SHOUT_COLS}`,
        [actor.id, actor.name, at, SHOUTS_PER_DAY]);
      if (!r) throw new RecruitmentError(`All ${SHOUTS_PER_DAY} shouts for ${utcDay(at)} (UTC) are already logged.`);
      await audit(c, actor, `Logged a shout at ${stamp(at)}`);
      return toShout(r);
    });
  } catch (e: any) {
    if (e?.code === '23505') throw new RecruitmentError('Someone logged a shout at the same moment. Refresh and check the count.');
    throw e;
  }
}

export async function deleteShout(id: number, actor: Actor, canManage: boolean, db: Pool = getPool()): Promise<void> {
  await tx(db, async c => {
    const { rows: [s] } = await c.query(`SELECT ${SHOUT_COLS} FROM recruitment_shouts WHERE id = $1 FOR UPDATE`, [id]);
    if (!s) throw new RecruitmentError('That shout is already gone.', 404);
    if (s.discord_id !== actor.id && !canManage) throw new RecruitmentError('You can only remove shouts you logged.', 403);
    await c.query(`DELETE FROM recruitment_shouts WHERE id = $1`, [id]);
    await audit(c, actor, `Removed ${s.ign}'s shout at ${stamp(s.shouted_at)}`);
  });
}
