/**
 * Chronicles Wiki — server-side data access. Client-safe types/validation in
 * lib/wiki.ts; design in docs/chronicles-wiki-plan.md.
 *
 * Conventions follow lib/chronicle-db.ts: lazy table creation, every content
 * change stored as a full revision (the revision log doubles as the audit
 * trail), exec direct edits recorded with author + note.
 */

import { Pool, PoolClient } from 'pg';
import {
  WikiPage,
  WikiPagePayload,
  WikiPageSummary,
  WikiPageType,
  WikiRevision,
  extractWikiLinks,
} from './wiki';

let tablesReady = false;

export async function ensureWikiTables(pool: Pool): Promise<void> {
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wiki_pages (
      id          SERIAL PRIMARY KEY,
      slug        VARCHAR(80)  UNIQUE NOT NULL,
      title       VARCHAR(120) NOT NULL,
      page_type   VARCHAR(16)  NOT NULL,
      summary     VARCHAR(500) NOT NULL DEFAULT '',
      infobox     JSONB        NOT NULL DEFAULT '[]',
      body        TEXT         NOT NULL DEFAULT '',
      status      VARCHAR(12)  NOT NULL DEFAULT 'published',
      created_by  VARCHAR(30)  NOT NULL,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_wiki_pages_type ON wiki_pages(page_type);
    CREATE INDEX IF NOT EXISTS idx_wiki_pages_updated ON wiki_pages(updated_at DESC);

    CREATE TABLE IF NOT EXISTS wiki_page_revisions (
      id          SERIAL PRIMARY KEY,
      page_id     INTEGER      NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      rev_number  INTEGER      NOT NULL,
      title       VARCHAR(120) NOT NULL,
      summary     VARCHAR(500) NOT NULL DEFAULT '',
      infobox     JSONB        NOT NULL DEFAULT '[]',
      body        TEXT         NOT NULL DEFAULT '',
      author_id   VARCHAR(30)  NOT NULL,
      author_name VARCHAR(60)  NOT NULL DEFAULT '',
      note        VARCHAR(300) NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (page_id, rev_number)
    );
    CREATE INDEX IF NOT EXISTS idx_wiki_revisions_page ON wiki_page_revisions(page_id, rev_number DESC);

    CREATE TABLE IF NOT EXISTS wiki_page_links (
      from_page_id INTEGER     NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      to_slug      VARCHAR(80) NOT NULL,
      PRIMARY KEY (from_page_id, to_slug)
    );
    CREATE INDEX IF NOT EXISTS idx_wiki_links_to ON wiki_page_links(to_slug);

    CREATE TABLE IF NOT EXISTS wiki_redirects (
      from_slug  VARCHAR(80) PRIMARY KEY,
      to_page_id INTEGER     NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wiki_page_submissions (
      id             SERIAL PRIMARY KEY,
      target_page_id INTEGER      NULL REFERENCES wiki_pages(id) ON DELETE SET NULL,
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
    CREATE INDEX IF NOT EXISTS idx_wiki_submissions_status ON wiki_page_submissions(status);

    CREATE TABLE IF NOT EXISTS wiki_images (
      id          SERIAL PRIMARY KEY,
      url         TEXT         NOT NULL,
      filename    VARCHAR(200) NOT NULL,
      mime        VARCHAR(60)  NOT NULL,
      bytes       INTEGER      NOT NULL,
      width       INTEGER      NULL,
      height      INTEGER      NULL,
      caption     VARCHAR(300) NOT NULL DEFAULT '',
      status      VARCHAR(12)  NOT NULL DEFAULT 'active',
      uploaded_by VARCHAR(30)  NOT NULL,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
  // Full-text search vector (separate statement: generated columns can't be
  // added twice, and IF NOT EXISTS isn't supported for them on older PG)
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'wiki_pages' AND column_name = 'search_tsv'
      ) THEN
        ALTER TABLE wiki_pages ADD COLUMN search_tsv tsvector
          GENERATED ALWAYS AS (
            setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(body, '')), 'C')
          ) STORED;
        CREATE INDEX idx_wiki_pages_search ON wiki_pages USING GIN (search_tsv);
      END IF;
    END $$;
  `);
  tablesReady = true;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToPage(row: Record<string, any>): WikiPage {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    pageType: row.page_type,
    summary: row.summary,
    infobox: Array.isArray(row.infobox) ? row.infobox : [],
    body: row.body,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToSummary(row: Record<string, any>): WikiPageSummary {
  return {
    slug: row.slug,
    title: row.title,
    pageType: row.page_type,
    summary: row.summary,
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToRevision(row: Record<string, any>): WikiRevision {
  return {
    id: row.id,
    pageId: row.page_id,
    revNumber: row.rev_number,
    title: row.title,
    summary: row.summary,
    infobox: Array.isArray(row.infobox) ? row.infobox : [],
    body: row.body,
    authorId: row.author_id,
    authorName: row.author_name,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Fetch a page by slug, following one redirect hop. */
export async function getWikiPage(
  pool: Pool,
  slug: string,
): Promise<{ page: WikiPage; redirectedFrom?: string } | null> {
  await ensureWikiTables(pool);
  const direct = await pool.query(`SELECT * FROM wiki_pages WHERE slug = $1`, [slug]);
  if (direct.rows.length > 0) return { page: rowToPage(direct.rows[0]) };
  const redirected = await pool.query(
    `SELECT p.* FROM wiki_redirects r JOIN wiki_pages p ON p.id = r.to_page_id WHERE r.from_slug = $1`,
    [slug],
  );
  if (redirected.rows.length > 0) return { page: rowToPage(redirected.rows[0]), redirectedFrom: slug };
  return null;
}

export async function listWikiPages(
  pool: Pool,
  opts: { pageType?: WikiPageType; includeArchived?: boolean } = {},
): Promise<WikiPageSummary[]> {
  await ensureWikiTables(pool);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeArchived) clauses.push(`status = 'published'`);
  if (opts.pageType) {
    params.push(opts.pageType);
    clauses.push(`page_type = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT slug, title, page_type, summary, updated_at FROM wiki_pages ${where} ORDER BY LOWER(title)`,
    params,
  );
  return result.rows.map(rowToSummary);
}

export async function searchWikiPages(pool: Pool, query: string, limit = 20): Promise<WikiPageSummary[]> {
  await ensureWikiTables(pool);
  const q = query.trim();
  if (!q) return [];
  const result = await pool.query(
    `SELECT slug, title, page_type, summary, updated_at,
            ts_rank(search_tsv, websearch_to_tsquery('english', $1)) AS rank,
            (LOWER(title) LIKE LOWER($2)) AS title_hit
     FROM wiki_pages
     WHERE status = 'published'
       AND (search_tsv @@ websearch_to_tsquery('english', $1) OR LOWER(title) LIKE LOWER($2))
     ORDER BY title_hit DESC, rank DESC, LOWER(title)
     LIMIT $3`,
    [q, `%${q}%`, limit],
  );
  return result.rows.map(rowToSummary);
}

export async function recentWikiChanges(pool: Pool, limit = 20): Promise<Array<WikiPageSummary & { note: string; authorName: string; revNumber: number }>> {
  await ensureWikiTables(pool);
  const result = await pool.query(
    `SELECT p.slug, p.title, p.page_type, p.summary, r.created_at AS updated_at,
            r.note, r.author_name, r.rev_number
     FROM wiki_page_revisions r JOIN wiki_pages p ON p.id = r.page_id
     WHERE p.status = 'published'
     ORDER BY r.created_at DESC LIMIT $1`,
    [limit],
  );
  return result.rows.map(row => ({
    ...rowToSummary(row),
    note: row.note,
    authorName: row.author_name,
    revNumber: row.rev_number,
  }));
}

export async function listWikiRevisions(pool: Pool, pageId: number): Promise<WikiRevision[]> {
  await ensureWikiTables(pool);
  const result = await pool.query(
    `SELECT * FROM wiki_page_revisions WHERE page_id = $1 ORDER BY rev_number DESC`,
    [pageId],
  );
  return result.rows.map(rowToRevision);
}

export async function getWikiRevision(pool: Pool, pageId: number, revNumber: number): Promise<WikiRevision | null> {
  await ensureWikiTables(pool);
  const result = await pool.query(
    `SELECT * FROM wiki_page_revisions WHERE page_id = $1 AND rev_number = $2`,
    [pageId, revNumber],
  );
  return result.rows.length ? rowToRevision(result.rows[0]) : null;
}

/** Published pages that link TO this slug ("What links here"). */
export async function wikiBacklinks(pool: Pool, slug: string): Promise<WikiPageSummary[]> {
  await ensureWikiTables(pool);
  const result = await pool.query(
    `SELECT p.slug, p.title, p.page_type, p.summary, p.updated_at
     FROM wiki_page_links l JOIN wiki_pages p ON p.id = l.from_page_id
     WHERE l.to_slug = $1 AND p.status = 'published'
     ORDER BY LOWER(p.title)`,
    [slug],
  );
  return result.rows.map(rowToSummary);
}

/** Which of the given slugs exist (as pages or redirects) — for red links. */
export async function resolveWikiSlugs(pool: Pool, slugs: string[]): Promise<Set<string>> {
  await ensureWikiTables(pool);
  if (slugs.length === 0) return new Set();
  const result = await pool.query(
    `SELECT slug FROM wiki_pages WHERE slug = ANY($1)
     UNION SELECT from_slug FROM wiki_redirects WHERE from_slug = ANY($1)`,
    [slugs],
  );
  return new Set(result.rows.map(r => r.slug));
}

// ---------------------------------------------------------------------------
// Writes (exec direct — every change is a revision)
// ---------------------------------------------------------------------------

async function recomputeLinks(client: PoolClient, pageId: number, body: string): Promise<void> {
  await client.query(`DELETE FROM wiki_page_links WHERE from_page_id = $1`, [pageId]);
  const links = extractWikiLinks(body);
  for (const slug of links) {
    await client.query(
      `INSERT INTO wiki_page_links (from_page_id, to_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [pageId, slug],
    );
  }
}

export async function createWikiPage(
  pool: Pool,
  payload: WikiPagePayload,
  author: { id: string; name: string },
  note: string,
): Promise<{ ok: true; pageId: number } | { ok: false; error: string }> {
  await ensureWikiTables(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const clash = await client.query(
      `SELECT 1 FROM wiki_pages WHERE slug = $1 UNION SELECT 1 FROM wiki_redirects WHERE from_slug = $1`,
      [payload.slug],
    );
    if (clash.rows.length > 0) {
      await client.query('ROLLBACK');
      return { ok: false, error: `Slug "${payload.slug}" is already in use` };
    }
    const inserted = await client.query(
      `INSERT INTO wiki_pages (slug, title, page_type, summary, infobox, body, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [payload.slug, payload.title, payload.pageType, payload.summary, JSON.stringify(payload.infobox), payload.body, author.id],
    );
    const pageId = inserted.rows[0].id;
    await client.query(
      `INSERT INTO wiki_page_revisions (page_id, rev_number, title, summary, infobox, body, author_id, author_name, note)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8)`,
      [pageId, payload.title, payload.summary, JSON.stringify(payload.infobox), payload.body, author.id, author.name, note || 'Page created'],
    );
    await recomputeLinks(client, pageId, payload.body);
    await client.query('COMMIT');
    return { ok: true, pageId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function editWikiPage(
  pool: Pool,
  pageId: number,
  payload: WikiPagePayload,
  author: { id: string; name: string },
  note: string,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  await ensureWikiTables(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT * FROM wiki_pages WHERE id = $1 FOR UPDATE`, [pageId]);
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Page not found' };
    }
    const current = found.rows[0];

    // Slug change = rename: keep a redirect from the old slug
    if (payload.slug !== current.slug) {
      const clash = await client.query(
        `SELECT 1 FROM wiki_pages WHERE slug = $1 AND id <> $2
         UNION SELECT 1 FROM wiki_redirects WHERE from_slug = $1 AND to_page_id <> $2`,
        [payload.slug, pageId],
      );
      if (clash.rows.length > 0) {
        await client.query('ROLLBACK');
        return { ok: false, error: `Slug "${payload.slug}" is already in use` };
      }
      await client.query(`DELETE FROM wiki_redirects WHERE from_slug = $1`, [payload.slug]);
      await client.query(
        `INSERT INTO wiki_redirects (from_slug, to_page_id) VALUES ($1, $2)
         ON CONFLICT (from_slug) DO UPDATE SET to_page_id = EXCLUDED.to_page_id`,
        [current.slug, pageId],
      );
    }

    await client.query(
      `UPDATE wiki_pages SET slug = $1, title = $2, page_type = $3, summary = $4,
              infobox = $5, body = $6, updated_at = NOW()
       WHERE id = $7`,
      [payload.slug, payload.title, payload.pageType, payload.summary, JSON.stringify(payload.infobox), payload.body, pageId],
    );
    const rev = await client.query(
      `SELECT COALESCE(MAX(rev_number), 0) + 1 AS next FROM wiki_page_revisions WHERE page_id = $1`,
      [pageId],
    );
    await client.query(
      `INSERT INTO wiki_page_revisions (page_id, rev_number, title, summary, infobox, body, author_id, author_name, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [pageId, rev.rows[0].next, payload.title, payload.summary, JSON.stringify(payload.infobox), payload.body, author.id, author.name, note],
    );
    await recomputeLinks(client, pageId, payload.body);
    await client.query('COMMIT');
    return { ok: true, slug: payload.slug };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Archive (soft-delete). Revisions and links are retained. */
export async function setWikiPageStatus(
  pool: Pool,
  pageId: number,
  status: 'published' | 'draft' | 'archived',
): Promise<boolean> {
  await ensureWikiTables(pool);
  const result = await pool.query(
    `UPDATE wiki_pages SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, pageId],
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Suggestions (community proposals → exec review)
// ---------------------------------------------------------------------------

import { WikiSubmission } from './wiki';

function rowToSubmission(row: Record<string, any>): WikiSubmission {
  return {
    id: row.id,
    targetPageId: row.target_page_id ?? null,
    payload: row.payload,
    note: row.note,
    status: row.status,
    submittedBy: row.submitted_by,
    submittedName: row.submitted_name,
    submittedAt: row.submitted_at.toISOString(),
    reviewedBy: row.reviewed_by ?? null,
    reviewNote: row.review_note ?? null,
    reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
  };
}

export async function countPendingWikiBy(pool: Pool, discordId: string): Promise<number> {
  await ensureWikiTables(pool);
  const r = await pool.query(
    `SELECT COUNT(*) AS n FROM wiki_page_submissions WHERE submitted_by = $1 AND status = 'pending'`,
    [discordId],
  );
  return Number(r.rows[0].n);
}

export async function createWikiSubmission(
  pool: Pool,
  args: { targetPageId: number | null; payload: WikiPagePayload; note: string; submittedBy: string; submittedName: string },
): Promise<number> {
  await ensureWikiTables(pool);
  const r = await pool.query(
    `INSERT INTO wiki_page_submissions (target_page_id, payload, note, submitted_by, submitted_name)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [args.targetPageId, JSON.stringify(args.payload), args.note, args.submittedBy, args.submittedName],
  );
  return r.rows[0].id;
}

export async function listWikiSubmissions(pool: Pool, status?: string, limit = 50): Promise<WikiSubmission[]> {
  await ensureWikiTables(pool);
  const r = status
    ? await pool.query(`SELECT * FROM wiki_page_submissions WHERE status = $1 ORDER BY submitted_at DESC LIMIT $2`, [status, limit])
    : await pool.query(`SELECT * FROM wiki_page_submissions ORDER BY submitted_at DESC LIMIT $1`, [limit]);
  return r.rows.map(rowToSubmission);
}

/**
 * Approve or reject a pending suggestion. Approval materializes the payload
 * through the normal create/edit path, so the change lands as a revision
 * authored by the SUGGESTER, with the reviewer recorded in the edit note.
 */
export async function reviewWikiSubmission(
  pool: Pool,
  args: { id: number; approve: boolean; reviewedBy: string; reviewNote: string },
): Promise<{ ok: boolean; error?: string; slug?: string }> {
  await ensureWikiTables(pool);
  const found = await pool.query(`SELECT * FROM wiki_page_submissions WHERE id = $1 AND status = 'pending'`, [args.id]);
  if (found.rows.length === 0) return { ok: false, error: 'Submission not found or already reviewed' };
  const sub = rowToSubmission(found.rows[0]);

  if (args.approve) {
    const author = { id: sub.submittedBy, name: sub.submittedName };
    const note = `${sub.note || 'Suggested edit'} (approved by ${args.reviewedBy})`.slice(0, 300);
    let result: { ok: boolean; error?: string; slug?: string };
    if (sub.targetPageId === null) {
      const created = await createWikiPage(pool, sub.payload, author, note);
      result = created.ok ? { ok: true, slug: sub.payload.slug } : created;
    } else {
      const edited = await editWikiPage(pool, sub.targetPageId, sub.payload, author, note);
      result = edited.ok ? { ok: true, slug: edited.slug } : edited;
    }
    if (!result.ok) return result;
  }

  await pool.query(
    `UPDATE wiki_page_submissions SET status = $1, reviewed_by = $2, review_note = $3, reviewed_at = NOW() WHERE id = $4`,
    [args.approve ? 'approved' : 'rejected', args.reviewedBy, args.reviewNote, args.id],
  );
  return { ok: true, slug: sub.payload.slug };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export async function recordWikiImage(
  pool: Pool,
  args: { url: string; filename: string; mime: string; bytes: number; width: number | null; height: number | null; caption: string; status: 'active' | 'pending'; uploadedBy: string },
): Promise<number> {
  await ensureWikiTables(pool);
  const r = await pool.query(
    `INSERT INTO wiki_images (url, filename, mime, bytes, width, height, caption, status, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [args.url, args.filename, args.mime, args.bytes, args.width, args.height, args.caption, args.status, args.uploadedBy],
  );
  return r.rows[0].id;
}
