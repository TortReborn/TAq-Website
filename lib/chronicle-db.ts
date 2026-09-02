/**
 * Map Chronicle — server-side data access. See lib/chronicle.ts for the
 * client-safe types/validation and sql/create_chronicle_tables.sql for the
 * reference schema.
 */

import { Pool, PoolClient } from 'pg';
import {
  AlliancePayload,
  EventPayload,
  ChronicleAlliance,
  ChronicleEvent,
  ChronicleSubmission,
} from './chronicle';

let tablesReady = false;

/** Create the chronicle tables on first use (idempotent). */
export async function ensureChronicleTables(pool: Pool): Promise<void> {
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chronicle_alliances (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(60)  NOT NULL,
      tag         VARCHAR(8)   NOT NULL DEFAULT '',
      color       VARCHAR(7)   NOT NULL,
      description VARCHAR(1000) NOT NULL DEFAULT '',
      created_by  VARCHAR(30)  NOT NULL,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chronicle_memberships (
      id          SERIAL PRIMARY KEY,
      alliance_id INTEGER      NOT NULL REFERENCES chronicle_alliances(id) ON DELETE CASCADE,
      guild_name  VARCHAR(60)  NOT NULL,
      joined_at   TIMESTAMPTZ  NOT NULL,
      left_at     TIMESTAMPTZ  NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chronicle_memberships_alliance
      ON chronicle_memberships(alliance_id);
    CREATE TABLE IF NOT EXISTS chronicle_events (
      id          SERIAL PRIMARY KEY,
      event_type  VARCHAR(20)  NOT NULL,
      title       VARCHAR(80)  NOT NULL,
      description VARCHAR(1000) NOT NULL DEFAULT '',
      starts_at   TIMESTAMPTZ  NOT NULL,
      ends_at     TIMESTAMPTZ  NULL,
      guilds      JSONB        NOT NULL DEFAULT '[]',
      created_by  VARCHAR(30)  NOT NULL,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chronicle_submissions (
      id             SERIAL PRIMARY KEY,
      kind           VARCHAR(20)  NOT NULL,
      target_id      INTEGER      NULL,
      payload        JSONB        NOT NULL,
      note           VARCHAR(300) NOT NULL DEFAULT '',
      status         VARCHAR(10)  NOT NULL DEFAULT 'pending',
      submitted_by   VARCHAR(30)  NOT NULL,
      submitted_name VARCHAR(60)  NOT NULL DEFAULT '',
      submitted_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      reviewed_by    VARCHAR(60)  NULL,
      review_note    VARCHAR(300) NULL,
      reviewed_at    TIMESTAMPTZ  NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chronicle_submissions_status
      ON chronicle_submissions(status);
    ALTER TABLE chronicle_events
      ADD COLUMN IF NOT EXISTS alliances JSONB NOT NULL DEFAULT '[]';
  `);
  tablesReady = true;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function loadChronicleData(pool: Pool): Promise<{ alliances: ChronicleAlliance[]; events: ChronicleEvent[] }> {
  await ensureChronicleTables(pool);
  const [alliances, memberships, events] = await Promise.all([
    pool.query(`SELECT id, name, tag, color, description FROM chronicle_alliances ORDER BY LOWER(name)`),
    pool.query(`SELECT alliance_id, guild_name, joined_at, left_at FROM chronicle_memberships ORDER BY joined_at`),
    pool.query(`SELECT id, event_type, title, description, starts_at, ends_at, guilds, alliances FROM chronicle_events ORDER BY starts_at`),
  ]);

  const byAlliance = new Map<number, ChronicleAlliance>();
  for (const row of alliances.rows) {
    byAlliance.set(row.id, {
      id: row.id,
      name: row.name,
      tag: row.tag,
      color: row.color,
      description: row.description,
      memberships: [],
    });
  }
  for (const row of memberships.rows) {
    byAlliance.get(row.alliance_id)?.memberships.push({
      guild: row.guild_name,
      joinedAt: row.joined_at.toISOString(),
      leftAt: row.left_at ? row.left_at.toISOString() : null,
    });
  }

  return {
    alliances: [...byAlliance.values()],
    events: events.rows.map(row => ({
      id: row.id,
      eventType: row.event_type,
      title: row.title,
      description: row.description,
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at ? row.ends_at.toISOString() : null,
      guilds: Array.isArray(row.guilds) ? row.guilds : [],
      alliances: Array.isArray(row.alliances) ? row.alliances : [],
    })),
  };
}

function rowToSubmission(row: Record<string, unknown>): ChronicleSubmission {
  return {
    id: row.id as number,
    kind: row.kind as 'alliance' | 'event',
    targetId: (row.target_id as number | null) ?? null,
    payload: row.payload as AlliancePayload | EventPayload,
    note: row.note as string,
    status: row.status as 'pending' | 'approved' | 'rejected',
    submittedBy: row.submitted_by as string,
    submittedName: row.submitted_name as string,
    submittedAt: (row.submitted_at as Date).toISOString(),
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    reviewNote: (row.review_note as string | null) ?? null,
    reviewedAt: row.reviewed_at ? (row.reviewed_at as Date).toISOString() : null,
  };
}

export async function listSubmissions(pool: Pool, status?: string, limit = 50): Promise<ChronicleSubmission[]> {
  await ensureChronicleTables(pool);
  const result = status
    ? await pool.query(
        `SELECT * FROM chronicle_submissions WHERE status = $1 ORDER BY submitted_at DESC LIMIT $2`,
        [status, limit],
      )
    : await pool.query(`SELECT * FROM chronicle_submissions ORDER BY submitted_at DESC LIMIT $1`, [limit]);
  return result.rows.map(rowToSubmission);
}

export async function countPendingBy(pool: Pool, discordId: string): Promise<number> {
  await ensureChronicleTables(pool);
  const result = await pool.query(
    `SELECT COUNT(*) AS n FROM chronicle_submissions WHERE submitted_by = $1 AND status = 'pending'`,
    [discordId],
  );
  return Number(result.rows[0].n);
}

/** Names of all approved alliances (for validating event participants). */
export async function approvedAllianceNames(pool: Pool): Promise<Set<string>> {
  await ensureChronicleTables(pool);
  const result = await pool.query(`SELECT name FROM chronicle_alliances`);
  return new Set(result.rows.map(r => r.name));
}

/** Check that an edit's target entity actually exists. */
export async function targetExists(pool: Pool, kind: 'alliance' | 'event', id: number): Promise<boolean> {
  await ensureChronicleTables(pool);
  const table = kind === 'alliance' ? 'chronicle_alliances' : 'chronicle_events';
  const result = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  return result.rows.length > 0;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createSubmission(
  pool: Pool,
  args: {
    kind: 'alliance' | 'event';
    targetId: number | null;
    payload: AlliancePayload | EventPayload;
    note: string;
    submittedBy: string;
    submittedName: string;
  },
): Promise<number> {
  await ensureChronicleTables(pool);
  const result = await pool.query(
    `INSERT INTO chronicle_submissions (kind, target_id, payload, note, submitted_by, submitted_name)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [args.kind, args.targetId, JSON.stringify(args.payload), args.note, args.submittedBy, args.submittedName],
  );
  return result.rows[0].id;
}

async function applyAlliance(client: PoolClient, targetId: number | null, p: AlliancePayload, by: string): Promise<void> {
  let allianceId = targetId;
  if (allianceId === null) {
    const inserted = await client.query(
      `INSERT INTO chronicle_alliances (name, tag, color, description, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [p.name, p.tag, p.color, p.description, by],
    );
    allianceId = inserted.rows[0].id;
  } else {
    await client.query(
      `UPDATE chronicle_alliances SET name = $1, tag = $2, color = $3, description = $4, updated_at = NOW()
       WHERE id = $5`,
      [p.name, p.tag, p.color, p.description, allianceId],
    );
    // Memberships are replaced wholesale — the payload is the full new state
    await client.query(`DELETE FROM chronicle_memberships WHERE alliance_id = $1`, [allianceId]);
  }
  for (const m of p.memberships) {
    await client.query(
      `INSERT INTO chronicle_memberships (alliance_id, guild_name, joined_at, left_at)
       VALUES ($1, $2, $3, $4)`,
      [allianceId, m.guild, m.joinedAt, m.leftAt],
    );
  }
}

async function applyEvent(client: PoolClient, targetId: number | null, p: EventPayload, by: string): Promise<void> {
  if (targetId === null) {
    await client.query(
      `INSERT INTO chronicle_events (event_type, title, description, starts_at, ends_at, guilds, alliances, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [p.eventType, p.title, p.description, p.startsAt, p.endsAt, JSON.stringify(p.guilds), JSON.stringify(p.alliances ?? []), by],
    );
  } else {
    await client.query(
      `UPDATE chronicle_events SET event_type = $1, title = $2, description = $3, starts_at = $4,
              ends_at = $5, guilds = $6, alliances = $7, updated_at = NOW()
       WHERE id = $8`,
      [p.eventType, p.title, p.description, p.startsAt, p.endsAt, JSON.stringify(p.guilds), JSON.stringify(p.alliances ?? []), targetId],
    );
  }
}

/**
 * Exec-only: delete a published alliance or event. The entity's final state is
 * snapshotted into the submissions table (immediately approved, review note
 * "direct exec delete") so the audit trail records what was removed. Deleting
 * an alliance also cascades its memberships (FK) and strips its name from any
 * events that listed it as a participant.
 */
export async function deleteChronicleEntity(
  pool: Pool,
  args: { kind: 'alliance' | 'event'; id: number; deletedBy: string; deletedName: string },
): Promise<{ ok: boolean; error?: string }> {
  await ensureChronicleTables(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let payload: AlliancePayload | EventPayload;
    if (args.kind === 'alliance') {
      const found = await client.query(`SELECT * FROM chronicle_alliances WHERE id = $1 FOR UPDATE`, [args.id]);
      if (found.rows.length === 0) {
        await client.query('ROLLBACK');
        return { ok: false, error: 'Alliance not found' };
      }
      const row = found.rows[0];
      const members = await client.query(
        `SELECT guild_name, joined_at, left_at FROM chronicle_memberships WHERE alliance_id = $1 ORDER BY joined_at`,
        [args.id],
      );
      payload = {
        name: row.name,
        tag: row.tag,
        color: row.color,
        description: row.description,
        memberships: members.rows.map(m => ({
          guild: m.guild_name,
          joinedAt: m.joined_at.toISOString(),
          leftAt: m.left_at ? m.left_at.toISOString() : null,
        })),
      };
      await client.query(`DELETE FROM chronicle_alliances WHERE id = $1`, [args.id]);
      // Remove the alliance from events that listed it as a participant
      await client.query(
        `UPDATE chronicle_events SET alliances = alliances - $1, updated_at = NOW()
         WHERE alliances ? $1`,
        [row.name],
      );
    } else {
      const found = await client.query(`SELECT * FROM chronicle_events WHERE id = $1 FOR UPDATE`, [args.id]);
      if (found.rows.length === 0) {
        await client.query('ROLLBACK');
        return { ok: false, error: 'Event not found' };
      }
      const row = found.rows[0];
      payload = {
        eventType: row.event_type,
        title: row.title,
        description: row.description,
        startsAt: row.starts_at.toISOString(),
        endsAt: row.ends_at ? row.ends_at.toISOString() : null,
        guilds: Array.isArray(row.guilds) ? row.guilds : [],
        alliances: Array.isArray(row.alliances) ? row.alliances : [],
      };
      await client.query(`DELETE FROM chronicle_events WHERE id = $1`, [args.id]);
    }

    await client.query(
      `INSERT INTO chronicle_submissions
         (kind, target_id, payload, note, status, submitted_by, submitted_name, reviewed_by, review_note, reviewed_at)
       VALUES ($1, $2, $3, '', 'approved', $4, $5, $5, 'direct exec delete', NOW())`,
      [args.kind, args.id, JSON.stringify(payload), args.deletedBy, args.deletedName],
    );
    await client.query('COMMIT');
    return { ok: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Approve or reject a pending submission. Approval applies the payload to the
 * live tables and marks the submission, atomically. Returns false if the
 * submission was not found or already reviewed.
 */
export async function reviewSubmission(
  pool: Pool,
  args: { id: number; approve: boolean; reviewedBy: string; reviewNote: string },
): Promise<{ ok: boolean; error?: string }> {
  await ensureChronicleTables(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT * FROM chronicle_submissions WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [args.id],
    );
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Submission not found or already reviewed' };
    }
    const sub = rowToSubmission(found.rows[0]);

    if (args.approve) {
      // Edits of entities deleted since submission fail cleanly
      if (sub.targetId !== null) {
        const table = sub.kind === 'alliance' ? 'chronicle_alliances' : 'chronicle_events';
        const target = await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [sub.targetId]);
        if (target.rows.length === 0) {
          await client.query('ROLLBACK');
          return { ok: false, error: 'Target entity no longer exists' };
        }
      }
      if (sub.kind === 'alliance') {
        await applyAlliance(client, sub.targetId, sub.payload as AlliancePayload, sub.submittedBy);
      } else {
        await applyEvent(client, sub.targetId, sub.payload as EventPayload, sub.submittedBy);
      }
    }

    await client.query(
      `UPDATE chronicle_submissions
       SET status = $1, reviewed_by = $2, review_note = $3, reviewed_at = NOW()
       WHERE id = $4`,
      [args.approve ? 'approved' : 'rejected', args.reviewedBy, args.reviewNote, args.id],
    );
    await client.query('COMMIT');
    return { ok: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
