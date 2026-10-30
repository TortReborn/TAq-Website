/**
 * Server side of bot panels: reads and the one write path (a new revision).
 * Tables: sql/create_bot_panels.sql. Every save is a revision and the bot
 * publishes it, so the revision log is the edit history; a revert is a new
 * revision carrying an old one's content.
 */

import { getPool } from '@/lib/db';
import type { PanelContent, PanelRegistry, PanelSummary, RevisionMeta } from '@/lib/bot-panels';

const ids = (arr: (string | number)[] | null): string[] => (arr ?? []).map(String);

export async function listPanels(): Promise<PanelSummary[]> {
  const { rows } = await getPool().query(`
    SELECT p.slug, p.name, p.channel_id::text, p.message_ids::text[] AS message_ids, p.published_rev, p.updated_at,
           r.rev_number AS latest_rev, r.status AS latest_status, r.author_name AS latest_author, r.created_at AS latest_at
    FROM bot_panels p
    LEFT JOIN LATERAL (
      SELECT rev_number, status, author_name, created_at FROM bot_panel_revisions
      WHERE panel_id = p.id ORDER BY rev_number DESC LIMIT 1
    ) r ON TRUE
    ORDER BY p.name
  `);
  return rows.map(r => ({ ...r, message_ids: ids(r.message_ids) }));
}

/** Another panel that already owns any of these Discord messages, if one does. */
export async function messageOwner(slug: string, messageIds: string[]): Promise<{ slug: string; name: string } | null> {
  const { rows } = await getPool().query(
    `SELECT slug, name FROM bot_panels WHERE slug <> $1 AND message_ids && $2::bigint[] LIMIT 1`,
    [slug, messageIds],
  );
  return rows[0] ?? null;
}

export interface PanelDetail {
  panel: PanelSummary;
  latest: { rev_number: number; content: PanelContent; channel_id: string | null } | null;
  revisions: RevisionMeta[];
}

export async function getPanel(slug: string): Promise<PanelDetail | null> {
  const pool = getPool();
  const all = await listPanels();
  const panel = all.find(p => p.slug === slug);
  if (!panel) return null;

  const { rows: revisions } = await pool.query(`
    SELECT r.rev_number, r.channel_id::text, r.note, r.restored_from, r.author_name, r.status, r.error,
           r.created_at, r.published_at, (r.adopt_message_ids IS NOT NULL) AS adopted
    FROM bot_panel_revisions r JOIN bot_panels p ON p.id = r.panel_id
    WHERE p.slug = $1
    ORDER BY r.rev_number DESC
    LIMIT 200
  `, [slug]);

  const latest = revisions.length ? await getRevision(slug, revisions[0].rev_number) : null;
  return { panel, latest, revisions };
}

export async function getRevision(
  slug: string, rev: number,
): Promise<{ rev_number: number; content: PanelContent; channel_id: string | null } | null> {
  const { rows } = await getPool().query(`
    SELECT r.rev_number, r.content, r.channel_id::text
    FROM bot_panel_revisions r JOIN bot_panels p ON p.id = r.panel_id
    WHERE p.slug = $1 AND r.rev_number = $2
  `, [slug, rev]);
  return rows[0] ?? null;
}

export async function createPanel(slug: string, name: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `INSERT INTO bot_panels (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`,
    [slug, name],
  );
  return (rowCount ?? 0) > 0;
}

export class RevisionConflict extends Error {
  constructor(public latestRev: number, public latestAuthor: string | null) {
    super(`Revision ${latestRev} was saved by ${latestAuthor ?? 'someone'} while you were editing.`);
  }
}

export interface NewRevision {
  content: PanelContent;
  channelId: string;
  adoptMessageIds: string[] | null;
  note: string;
  restoredFrom: number | null;
  /** The revision the editor started from; a newer one means a conflict */
  baseRev: number | null;
  force: boolean;
  authorId: string;
  authorName: string;
  name?: string;
}

/** Queue a revision for the bot. Numbered under a row lock on the panel. */
export async function createRevision(slug: string, r: NewRevision): Promise<number | null> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows: [panel] } = await client.query(
      `SELECT id FROM bot_panels WHERE slug = $1 FOR UPDATE`, [slug],
    );
    if (!panel) { await client.query('ROLLBACK'); return null; }

    const { rows: [latest] } = await client.query(
      `SELECT rev_number, author_name FROM bot_panel_revisions WHERE panel_id = $1 ORDER BY rev_number DESC LIMIT 1`,
      [panel.id],
    );
    const latestRev: number = latest?.rev_number ?? 0;
    if (!r.force && latestRev > (r.baseRev ?? 0)) {
      await client.query('ROLLBACK');
      throw new RevisionConflict(latestRev, latest?.author_name ?? null);
    }

    const next = latestRev + 1;
    await client.query(`
      INSERT INTO bot_panel_revisions
        (panel_id, rev_number, content, channel_id, adopt_message_ids, note, restored_from, author_id, author_name)
      VALUES ($1, $2, $3, $4, $5::bigint[], $6, $7, $8, $9)
    `, [panel.id, next, JSON.stringify(r.content), r.channelId, r.adoptMessageIds, r.note, r.restoredFrom, r.authorId, r.authorName]);
    if (r.name) {
      await client.query(`UPDATE bot_panels SET name = $2, updated_at = NOW() WHERE id = $1`, [panel.id, r.name]);
    }
    await client.query('COMMIT');
    return next;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function getRegistry(): Promise<PanelRegistry | null> {
  const { rows } = await getPool().query(
    `SELECT data FROM cache_entries WHERE cache_key = 'botPanelRegistry'`,
  );
  if (!rows.length) return null;
  const data = rows[0].data;
  return typeof data === 'string' ? JSON.parse(data) : data;
}

/** Ask the bot to rebuild the registry on its next tick (~10s). The request
 *  lapses after ten minutes so a click while the bot is down isn't kept. */
export async function requestRegistryRefresh(): Promise<void> {
  await getPool().query(`
    INSERT INTO cache_entries (cache_key, data, expires_at)
    VALUES ('botPanelRegistryRefresh', '{}', NOW() + INTERVAL '10 minutes')
    ON CONFLICT (cache_key) DO UPDATE SET expires_at = EXCLUDED.expires_at, created_at = NOW()
  `);
}

/**
 * Queue a fresh copy of the latest revision of every posted panel whose text
 * uses one of these values ({{key}}), so the bot redraws it with the new value.
 * Each copy is taken under the panel's row lock, so an edit saved at the same
 * moment is the one that gets copied. Returns the names of the panels queued.
 */
export async function republishPanelsUsing(
  keys: string[], note: string, author: { id: string | null; name: string },
): Promise<string[]> {
  const safe = keys.filter(k => /^[a-z_]+$/.test(k));
  if (!safe.length) return [];
  const pool = getPool();
  const { rows: panels } = await pool.query(`
    SELECT p.slug FROM bot_panels p
    JOIN LATERAL (
      SELECT content FROM bot_panel_revisions WHERE panel_id = p.id ORDER BY rev_number DESC LIMIT 1
    ) r ON TRUE
    WHERE cardinality(p.message_ids) > 0 AND r.content::text ~ $1
    ORDER BY p.name
  `, [`\{\{\s*(${safe.join('|')})\s*\}\}`]);

  const queued: string[] = [];
  for (const { slug } of panels) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [panel] } = await client.query(
        `SELECT id, name, channel_id FROM bot_panels WHERE slug = $1 FOR UPDATE`, [slug],
      );
      const { rows: [latest] } = await client.query(
        `SELECT rev_number, content, channel_id FROM bot_panel_revisions WHERE panel_id = $1 ORDER BY rev_number DESC LIMIT 1`,
        [panel.id],
      );
      await client.query(`
        INSERT INTO bot_panel_revisions (panel_id, rev_number, content, channel_id, note, author_id, author_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [panel.id, latest.rev_number + 1, JSON.stringify(latest.content), latest.channel_id ?? panel.channel_id, note, author.id, author.name]);
      await client.query('COMMIT');
      queued.push(panel.name);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  return queued;
}
