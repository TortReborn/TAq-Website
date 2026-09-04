/**
 * Chronicle Wiki — server-side data access. Client-safe types/validation in
 * lib/wiki.ts; design in docs/chronicle-wiki-plan.md.
 *
 * Conventions follow lib/chronicle-db.ts: lazy table creation, every content
 * change stored as a full revision (the revision log doubles as the audit
 * trail), exec direct edits recorded with author + note.
 */

import { Pool, PoolClient } from 'pg';
import {
  WikiAuthor,
  WikiPage,
  WikiPagePayload,
  WikiPageSummary,
  WikiPageType,
  WikiRevision,
  WikiVerification,
  WIKI_VALIDATIONS_REQUIRED,
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
  // Lead image (Wikipedia-style: shown at the top of the infobox with a caption).
  // Added after the tables shipped, so applied as idempotent ALTERs.
  await pool.query(`
    ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS lead_image VARCHAR(400) NOT NULL DEFAULT '';
    ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS lead_image_caption VARCHAR(200) NOT NULL DEFAULT '';
    ALTER TABLE wiki_page_revisions ADD COLUMN IF NOT EXISTS lead_image VARCHAR(400) NOT NULL DEFAULT '';
    ALTER TABLE wiki_page_revisions ADD COLUMN IF NOT EXISTS lead_image_caption VARCHAR(200) NOT NULL DEFAULT '';
  `);

  // Who actually wrote a revision. 'ai' marks text generated by the drafting
  // pipeline; 'human' is a person typing in the editor. A page counts as
  // unverified exactly while no human revision exists, so this column is what
  // the banner is computed from — it is not merely a label.
  //
  // Images live in the site's S3 bucket rather than Vercel Blob, so keep the
  // key alongside the url (the url is a route on this site that streams it).
  await pool.query(`
    ALTER TABLE wiki_page_revisions ADD COLUMN IF NOT EXISTS author_kind VARCHAR(8) NOT NULL DEFAULT 'human';
    ALTER TABLE wiki_images ADD COLUMN IF NOT EXISTS s3_key VARCHAR(600) NOT NULL DEFAULT '';
    ALTER TABLE wiki_images ADD COLUMN IF NOT EXISTS backend VARCHAR(16) NOT NULL DEFAULT 's3';

    CREATE TABLE IF NOT EXISTS wiki_chroniclers (
      discord_id   VARCHAR(30)  PRIMARY KEY,
      display_name VARCHAR(60)  NOT NULL DEFAULT '',
      note         VARCHAR(200) NOT NULL DEFAULT '',
      active       BOOLEAN      NOT NULL DEFAULT TRUE,
      added_by     VARCHAR(60)  NOT NULL,
      added_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wiki_page_validations (
      page_id        INTEGER     NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      discord_id     VARCHAR(30) NOT NULL,
      validator_name VARCHAR(60) NOT NULL DEFAULT '',
      rev_number     INTEGER     NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (page_id, discord_id)
    );
    CREATE INDEX IF NOT EXISTS idx_wiki_validations_page ON wiki_page_validations(page_id, rev_number);
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
    ...(row.lead_image ? { leadImage: row.lead_image } : {}),
    ...(row.lead_image_caption ? { leadImageCaption: row.lead_image_caption } : {}),
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
    ...(row.lead_image ? { leadImage: row.lead_image } : {}),
    ...(row.lead_image_caption ? { leadImageCaption: row.lead_image_caption } : {}),
    body: row.body,
    authorId: row.author_id,
    authorName: row.author_name,
    authorKind: row.author_kind === 'ai' ? 'ai' : 'human',
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
  author: WikiAuthor,
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
      `INSERT INTO wiki_pages (slug, title, page_type, summary, infobox, body, created_by, lead_image, lead_image_caption)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [payload.slug, payload.title, payload.pageType, payload.summary, JSON.stringify(payload.infobox), payload.body, author.id, payload.leadImage ?? '', payload.leadImageCaption ?? ''],
    );
    const pageId = inserted.rows[0].id;
    await client.query(
      `INSERT INTO wiki_page_revisions (page_id, rev_number, title, summary, infobox, body, author_id, author_name, note, lead_image, lead_image_caption, author_kind)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [pageId, payload.title, payload.summary, JSON.stringify(payload.infobox), payload.body, author.id, author.name, note || 'Page created', payload.leadImage ?? '', payload.leadImageCaption ?? '', author.kind ?? 'human'],
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
  author: WikiAuthor,
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
              infobox = $5, body = $6, lead_image = $8, lead_image_caption = $9, updated_at = NOW()
       WHERE id = $7`,
      [payload.slug, payload.title, payload.pageType, payload.summary, JSON.stringify(payload.infobox), payload.body, pageId, payload.leadImage ?? '', payload.leadImageCaption ?? ''],
    );
    const rev = await client.query(
      `SELECT COALESCE(MAX(rev_number), 0) + 1 AS next FROM wiki_page_revisions WHERE page_id = $1`,
      [pageId],
    );
    await client.query(
      `INSERT INTO wiki_page_revisions (page_id, rev_number, title, summary, infobox, body, author_id, author_name, note, lead_image, lead_image_caption, author_kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [pageId, rev.rows[0].next, payload.title, payload.summary, JSON.stringify(payload.infobox), payload.body, author.id, author.name, note, payload.leadImage ?? '', payload.leadImageCaption ?? '', author.kind ?? 'human'],
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
  args: { url: string; s3Key?: string; backend?: 'blob' | 'blob-private' | 's3'; filename: string; mime: string; bytes: number; width: number | null; height: number | null; caption: string; status: 'active' | 'pending'; uploadedBy: string },
): Promise<number> {
  await ensureWikiTables(pool);
  const r = await pool.query(
    `INSERT INTO wiki_images (url, s3_key, backend, filename, mime, bytes, width, height, caption, status, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [args.url, args.s3Key ?? '', args.backend ?? 's3', args.filename, args.mime, args.bytes, args.width, args.height, args.caption, args.status, args.uploadedBy],
  );
  return r.rows[0].id;
}

// ---------------------------------------------------------------------------
// Chroniclers
//
// A chronicler is trusted to write and to review, and is identified by Discord
// id alone. That is deliberate: the people who remember this history are often
// not in the guild, so nothing here may depend on discord_links or the roster.
// ---------------------------------------------------------------------------

export interface WikiChronicler {
  discordId: string;
  displayName: string;
  note: string;
  active: boolean;
  addedBy: string;
  addedAt: string;
}

function rowToChronicler(row: Record<string, any>): WikiChronicler {
  return {
    discordId: row.discord_id,
    displayName: row.display_name,
    note: row.note,
    active: row.active,
    addedBy: row.added_by,
    addedAt: row.added_at.toISOString(),
  };
}

export async function isChronicler(pool: Pool, discordId: string): Promise<boolean> {
  await ensureWikiTables(pool);
  const r = await pool.query(
    `SELECT 1 FROM wiki_chroniclers WHERE discord_id = $1 AND active`,
    [discordId],
  );
  return r.rows.length > 0;
}

export async function listChroniclers(pool: Pool, includeInactive = false): Promise<WikiChronicler[]> {
  await ensureWikiTables(pool);
  const r = await pool.query(
    `SELECT * FROM wiki_chroniclers ${includeInactive ? '' : 'WHERE active'} ORDER BY active DESC, added_at DESC`,
  );
  return r.rows.map(rowToChronicler);
}

export async function addChronicler(
  pool: Pool,
  args: { discordId: string; displayName: string; note: string; addedBy: string },
): Promise<void> {
  await ensureWikiTables(pool);
  // Re-adding someone previously removed reactivates them but keeps the
  // original added_at, so a re-add does not rewrite the audit trail.
  await pool.query(
    `INSERT INTO wiki_chroniclers (discord_id, display_name, note, added_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (discord_id) DO UPDATE
       SET active = TRUE,
           display_name = EXCLUDED.display_name,
           note = EXCLUDED.note`,
    [args.discordId, args.displayName, args.note, args.addedBy],
  );
}

/** Soft-remove: their past validations and revisions stay attributed. */
export async function deactivateChronicler(pool: Pool, discordId: string): Promise<void> {
  await ensureWikiTables(pool);
  await pool.query(`UPDATE wiki_chroniclers SET active = FALSE WHERE discord_id = $1`, [discordId]);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * A page is verified when a human has revised it, or when enough chroniclers
 * have vouched for the revision now on display. Vouches are recorded against a
 * revision number, so a later AI edit drops the page back to unverified rather
 * than inheriting approval it never earned.
 */
export async function getPageVerification(
  pool: Pool,
  pageId: number,
  viewerDiscordId?: string | null,
): Promise<WikiVerification> {
  await ensureWikiTables(pool);
  const r = await pool.query(
    `SELECT
       (SELECT COALESCE(MAX(rev_number), 1) FROM wiki_page_revisions WHERE page_id = $1) AS current_rev,
       (SELECT COUNT(*) FROM wiki_page_revisions WHERE page_id = $1 AND author_kind = 'human') AS human_revs`,
    [pageId],
  );
  const currentRev: number = Number(r.rows[0].current_rev);
  const hasHumanRevision = Number(r.rows[0].human_revs) > 0;

  const v = await pool.query(
    `SELECT discord_id, validator_name FROM wiki_page_validations
     WHERE page_id = $1 AND rev_number = $2 ORDER BY created_at`,
    [pageId, currentRev],
  );
  const validatedBy = v.rows.map((row) => row.validator_name || row.discord_id);
  const viewerValidated = !!viewerDiscordId && v.rows.some((row) => row.discord_id === viewerDiscordId);

  return {
    verified: hasHumanRevision || v.rows.length >= WIKI_VALIDATIONS_REQUIRED,
    hasHumanRevision,
    validations: v.rows.length,
    validatedBy,
    viewerValidated,
  };
}

/** Record one chronicler's vouch for the revision currently on display. */
export async function validateWikiPage(
  pool: Pool,
  pageId: number,
  validator: { discordId: string; name: string },
): Promise<{ ok: true; verification: WikiVerification } | { ok: false; error: string }> {
  await ensureWikiTables(pool);
  const page = await pool.query(
    `SELECT (SELECT COALESCE(MAX(rev_number), 1) FROM wiki_page_revisions WHERE page_id = wiki_pages.id) AS current_rev
       FROM wiki_pages WHERE id = $1`,
    [pageId],
  );
  if (page.rows.length === 0) return { ok: false, error: 'Page not found' };
  const currentRev = Number(page.rows[0].current_rev);

  // One vouch per person per page; re-vouching after an edit moves it forward.
  await pool.query(
    `INSERT INTO wiki_page_validations (page_id, discord_id, validator_name, rev_number)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (page_id, discord_id) DO UPDATE
       SET rev_number = EXCLUDED.rev_number,
           validator_name = EXCLUDED.validator_name,
           created_at = NOW()`,
    [pageId, validator.discordId, validator.name, currentRev],
  );
  return { ok: true, verification: await getPageVerification(pool, pageId, validator.discordId) };
}

export async function withdrawWikiValidation(pool: Pool, pageId: number, discordId: string): Promise<void> {
  await ensureWikiTables(pool);
  await pool.query(`DELETE FROM wiki_page_validations WHERE page_id = $1 AND discord_id = $2`, [pageId, discordId]);
}

/**
 * Pages still waiting on a human: no human revision, and not enough vouches.
 * This is the contributor work-list the banner is meant to produce.
 */
export async function listUnverifiedPages(
  pool: Pool,
  limit = 500,
): Promise<Array<WikiPageSummary & { validations: number; revisions: number }>> {
  await ensureWikiTables(pool);
  const r = await pool.query(
    `SELECT p.slug, p.title, p.page_type, p.summary, p.updated_at,
            (SELECT COUNT(*) FROM wiki_page_revisions r WHERE r.page_id = p.id) AS revisions,
            (SELECT COUNT(*) FROM wiki_page_validations v
              WHERE v.page_id = p.id
                AND v.rev_number = (SELECT COALESCE(MAX(rev_number), 1) FROM wiki_page_revisions WHERE page_id = p.id)
            ) AS validations
       FROM wiki_pages p
      WHERE p.status = 'published'
        AND NOT EXISTS (
          SELECT 1 FROM wiki_page_revisions r WHERE r.page_id = p.id AND r.author_kind = 'human'
        )
      ORDER BY p.title
      LIMIT $1`,
    [limit],
  );
  return r.rows
    .filter((row) => Number(row.validations) < WIKI_VALIDATIONS_REQUIRED)
    .map((row) => ({
      ...rowToSummary(row),
      validations: Number(row.validations),
      revisions: Number(row.revisions),
    }));
}

/** Corpus-wide split of who wrote what, for the admin dashboard. */
export async function wikiAuthorshipStats(pool: Pool): Promise<{
  pages: number;
  pagesWithHumanRevision: number;
  revisions: number;
  aiRevisions: number;
  humanRevisions: number;
}> {
  await ensureWikiTables(pool);
  const r = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM wiki_pages WHERE status = 'published') AS pages,
       (SELECT COUNT(DISTINCT page_id) FROM wiki_page_revisions WHERE author_kind = 'human') AS pages_human,
       (SELECT COUNT(*) FROM wiki_page_revisions) AS revisions,
       (SELECT COUNT(*) FROM wiki_page_revisions WHERE author_kind = 'ai') AS ai_revisions,
       (SELECT COUNT(*) FROM wiki_page_revisions WHERE author_kind = 'human') AS human_revisions`,
  );
  const row = r.rows[0];
  return {
    pages: Number(row.pages),
    pagesWithHumanRevision: Number(row.pages_human),
    revisions: Number(row.revisions),
    aiRevisions: Number(row.ai_revisions),
    humanRevisions: Number(row.human_revisions),
  };
}
