/**
 * Chronicles Wiki — client-safe types, validation and helpers.
 *
 * A Wikipedia-style guild-history system: typed pages in one flat namespace,
 * full revision history, exec-driven with community suggestions (Phase 2).
 * Server-side data access lives in lib/wiki-db.ts. Design: docs/chronicles-wiki-plan.md.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WikiPageType = 'guild' | 'alliance' | 'player' | 'war' | 'update' | 'era' | 'general';

export const WIKI_PAGE_TYPES: WikiPageType[] = ['guild', 'alliance', 'player', 'war', 'update', 'era', 'general'];

export const WIKI_TYPE_LABELS: Record<WikiPageType, string> = {
  guild: 'Guild',
  alliance: 'Alliance',
  player: 'Player',
  war: 'War',
  update: 'Update',
  era: 'Era',
  general: 'General',
};

/** Freeform-but-typed infobox: ordered label/value rows, values may wiki-link. */
export interface WikiInfoboxRow {
  label: string;
  value: string; // rendered as inline markdown (wiki links work)
}

export interface WikiPagePayload {
  slug: string;
  title: string;
  pageType: WikiPageType;
  summary: string;
  /** Ordered infobox rows; empty array = no infobox */
  infobox: WikiInfoboxRow[];
  /**
   * The article's lead image, shown at the top of the infobox with its caption
   * beneath — the Wikipedia arrangement. A site-relative path (/images/...) or
   * an absolute http(s) URL. Body images are separate and stay in the prose.
   */
  leadImage?: string;
  /** Short caption under the lead image; say what is shown, not what it means */
  leadImageCaption?: string;
  body: string; // markdown
}

export interface WikiPage extends WikiPagePayload {
  id: number;
  status: 'published' | 'draft' | 'archived';
  updatedAt: string;
  createdAt: string;
}

/**
 * What produced a piece of text. 'ai' is the drafting pipeline (the seeder and
 * anything else generating prose); 'human' is a person in the editor. This is
 * load-bearing rather than decorative: a page is unverified exactly while it
 * has no human revision.
 */
export type WikiAuthorKind = 'ai' | 'human';

export interface WikiAuthor {
  id: string;
  name: string;
  /** Defaults to 'human' — only the generation pipeline passes 'ai'. */
  kind?: WikiAuthorKind;
}

export interface WikiRevision {
  id: number;
  pageId: number;
  revNumber: number;
  title: string;
  summary: string;
  infobox: WikiInfoboxRow[];
  body: string;
  authorId: string;
  authorName: string;
  authorKind: WikiAuthorKind;
  note: string;
  createdAt: string;
}

/** A page's standing with the people who check it. */
export interface WikiVerification {
  /** True once a human has revised the page, or enough chroniclers vouch for it. */
  verified: boolean;
  /** A human has edited it — the strongest signal, and it never lapses. */
  hasHumanRevision: boolean;
  /** Chroniclers who vouched for the *current* revision. */
  validations: number;
  /** Names of those chroniclers, for the banner's tooltip. */
  validatedBy: string[];
  /** Has the viewer already vouched for this revision? */
  viewerValidated: boolean;
}

/**
 * Vouches needed to clear the banner on a page no human has edited. Two, so no
 * single person can wave through a page — including one they wrote.
 */
export const WIKI_VALIDATIONS_REQUIRED = 2;

/** Lightweight listing row (search results, category pages, recent changes) */
export interface WikiPageSummary {
  slug: string;
  title: string;
  pageType: WikiPageType;
  summary: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WIKI_LIMITS = {
  slugMax: 80,
  titleMax: 120,
  summaryMax: 500,
  bodyMax: 100_000,
  noteMax: 300,
  infoboxRowsMax: 24,
  infoboxLabelMax: 40,
  infoboxValueMax: 300,
  leadImageMax: 400,
  leadImageCaptionMax: 200,
} as const;

/**
 * Lead images must be our own assets or an absolute http(s) URL — no
 * javascript:, data: or protocol-relative targets reaching an <img src>.
 */
// Uploaded images live in S3 and are served through /api/wiki/image/<id>, so
// that path is a valid source alongside the committed /images tree.
export const WIKI_IMAGE_SRC_RE = /^(?:\/images\/[A-Za-z0-9._\-/]+|\/api\/wiki\/image\/\d+|https?:\/\/[^\s"'<>]+)$/;

export const WIKI_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "The Federation" -> "the-federation" */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, WIKI_LIMITS.slugMax);
}

/**
 * Extract [[wiki link]] targets from a markdown body (for backlink tracking).
 * Supports [[Target]] and [[target-slug|label]]; targets are slugified.
 */
export function extractWikiLinks(body: string): string[] {
  const out = new Set<string>();
  const re = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const slug = slugify(m[1].trim());
    if (slug) out.add(slug);
  }
  return [...out];
}

/** Markdown headings (## and ###) -> table of contents entries */
export interface TocEntry {
  depth: 2 | 3;
  text: string;
  anchor: string;
}

export function headingAnchor(text: string): string {
  return slugify(text);
}

export function extractToc(body: string): TocEntry[] {
  const toc: TocEntry[] = [];
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^```/.test(line.trim())) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (m) {
      const text = m[2].replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_s, a, b) => b || a);
      toc.push({ depth: m[1].length as 2 | 3, text, anchor: headingAnchor(text) });
    }
  }
  return toc;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

function cleanText(value: unknown, max: number, { multiline = false } = {}): string | null {
  if (typeof value !== 'string') return null;
  let cleaned: string;
  if (multiline) {
    // Keep newlines and tabs; strip other control characters, normalize CRLF
    cleaned = value
      .replace(/\r\n/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
      .trim();
  } else {
    // eslint-disable-next-line no-control-regex
    cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  }
  if (cleaned.length === 0 || cleaned.length > max) return null;
  return cleaned;
}

export function validateWikiPagePayload(raw: unknown): Valid<WikiPagePayload> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Invalid payload' };
  const p = raw as Record<string, unknown>;

  const title = cleanText(p.title, WIKI_LIMITS.titleMax);
  if (!title) return { ok: false, error: `Title is required (max ${WIKI_LIMITS.titleMax} chars)` };

  const rawSlug = typeof p.slug === 'string' && p.slug.trim() !== '' ? p.slug.trim().toLowerCase() : slugify(title);
  if (!WIKI_SLUG_RE.test(rawSlug) || rawSlug.length > WIKI_LIMITS.slugMax) {
    return { ok: false, error: 'Slug must be lowercase kebab-case (a-z, 0-9, hyphens)' };
  }

  const pageType = WIKI_PAGE_TYPES.includes(p.pageType as WikiPageType) ? (p.pageType as WikiPageType) : null;
  if (!pageType) return { ok: false, error: 'Invalid page type' };

  const summary = cleanText(p.summary, WIKI_LIMITS.summaryMax) ?? '';

  const body = cleanText(p.body, WIKI_LIMITS.bodyMax, { multiline: true }) ?? '';
  if (!body) return { ok: false, error: 'Body is required' };

  const rawInfobox = Array.isArray(p.infobox) ? p.infobox : [];
  if (rawInfobox.length > WIKI_LIMITS.infoboxRowsMax) {
    return { ok: false, error: `Too many infobox rows (max ${WIKI_LIMITS.infoboxRowsMax})` };
  }
  const infobox: WikiInfoboxRow[] = [];
  for (const row of rawInfobox) {
    if (typeof row !== 'object' || row === null) return { ok: false, error: 'Invalid infobox row' };
    const r = row as Record<string, unknown>;
    const label = cleanText(r.label, WIKI_LIMITS.infoboxLabelMax);
    const value = cleanText(r.value, WIKI_LIMITS.infoboxValueMax);
    if (!label || !value) return { ok: false, error: 'Infobox rows need a label and a value' };
    infobox.push({ label, value });
  }

  const leadImage = cleanText(p.leadImage, WIKI_LIMITS.leadImageMax);
  if (leadImage && !WIKI_IMAGE_SRC_RE.test(leadImage)) {
    return { ok: false, error: 'Lead image must be an uploaded image, a /images/... path, or an http(s) URL' };
  }
  const leadImageCaption = cleanText(p.leadImageCaption, WIKI_LIMITS.leadImageCaptionMax);
  if (leadImageCaption && !leadImage) {
    return { ok: false, error: 'Lead image caption needs a lead image' };
  }

  return {
    ok: true,
    value: {
      slug: rawSlug, title, pageType, summary, infobox, body,
      ...(leadImage ? { leadImage } : {}),
      ...(leadImageCaption ? { leadImageCaption } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Suggestions (community edit proposals — reviewed by execs)
// ---------------------------------------------------------------------------

export interface WikiSubmission {
  id: number;
  /** null = proposal for a new page */
  targetPageId: number | null;
  payload: WikiPagePayload;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedBy: string;
  submittedName: string;
  submittedAt: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
}

/** Pending suggestions allowed per user at once (matches the map chronicle). */
export const WIKI_PENDING_PER_USER = 5;
