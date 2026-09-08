/**
 * Serve-time redaction of named individuals.
 *
 * Some of the people this wiki writes about are still around, and a few of them
 * have asked not to be findable by name. The archive is not the place to answer
 * that: every claim here is sourced, and quietly rewriting stored prose or an
 * archived forum capture would corrupt the record for the archivists too.
 *
 * So the redaction happens at the last possible moment, on the way out. What is
 * stored stays correct and complete — real names in article bodies, in citation
 * locators, in the captured source documents. What is *served* to a reader
 * without review rights has the name replaced by an alias, the person's own
 * page made unreachable, and their entry removed from every index, search
 * result and backlink list.
 *
 * Reviewers (exec or chronicler — `canReview`) see the record as written.
 *
 * ## What this does not reach
 *
 * This repository is public on GitHub, and `data/wiki/seed-articles.json` and
 * `data/wiki/sources/docs/*.md` carry the unredacted text. The forum threads
 * these names come from are public on wynncraft.com and are cited by number.
 * Redaction makes the site clean; it does not make a name unfindable, and
 * nobody should be told otherwise.
 *
 * ## Adding someone
 *
 * Add an entry to REDACTED_IDENTITIES. Every spelling that appears anywhere in
 * stored data must be listed — a missed variant is a leak. `npm test` then
 * checks the invariant that matters against the real corpus: for every article
 * field, every archived source document and every manifest title, redacting it
 * leaves nothing behind (lib/wiki-redaction.test.ts).
 */

import type { WikiInfoboxRow, WikiPage, WikiPageSummary } from './wiki';
import type { WikiCitationMap } from './wiki-citations';

export interface RedactedIdentity {
  /** The person's own page. Unreachable, and absent from every listing. */
  slug: string;
  /**
   * Every spelling that occurs in stored text, longest first. Matched on word
   * boundaries and case-insensitively, so "Godenn" is caught before "Goden"
   * and neither matches inside a longer word.
   */
  names: string[];
  /**
   * What a reader without review rights sees instead. A descriptive phrase, not
   * an invented title: a fake title would be indistinguishable from the real
   * offices this wiki records, and readers would take it for one.
   */
  alias: string;
  /**
   * Site-relative asset paths that identify the person visually — a skin render
   * is as identifying as a name, and the filename usually carries the name too.
   * These are stripped from anything served to a reader without review rights.
   */
  assets: string[];
}

export const REDACTED_IDENTITIES: RedactedIdentity[] = [
  {
    slug: 'goden',
    // Two spellings because the wiki text says "Goden" throughout while the
    // account is "Godenn". Both must be listed: the corpus contains the first
    // and readers searching would use either.
    names: ['Godenn', 'Goden'],
    alias: 'a Kingdom Foxes officer',
    // The render's filename is deliberately opaque. Files under public/ are not
    // auth-gated by Next, so a name in the path would be readable by anyone who
    // guessed the URL, whatever the page above it does.
    assets: ['/images/chronicles/media/player-6c221c21.webp'],
  },
];

/** Slugs whose pages are unreachable without review rights. */
export const REDACTED_SLUGS: ReadonlySet<string> = new Set(
  REDACTED_IDENTITIES.map((i) => i.slug),
);

/**
 * Who sees the record as written. Deliberately `canReview` rather than
 * `canPublish`: they are the same set today, but the question here is "may this
 * person work the archive", which is the reviewing right.
 */
export function canSeeRedacted(principal: { canReview: boolean } | null | undefined): boolean {
  return principal?.canReview === true;
}

export function isRedactedSlug(slug: string): boolean {
  return REDACTED_SLUGS.has(slug.toLowerCase());
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `[[goden|Goden]]`, `[[goden]]`, `[[Goden|the officer]]` — any link at a redacted slug. */
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

/** Mirrors `slugify` in lib/wiki.ts closely enough to recognise a link target. */
function linkTargetSlug(target: string): string {
  return target
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Is the offset inside a double-quoted span on its own line?
 *
 * Substituting a phrase into a verbatim quotation would misquote the source, so
 * an occurrence inside quote marks is bracketed — `[a Kingdom Foxes officer]` —
 * which is the ordinary editorial signal for a substitution made by the editor
 * rather than words the speaker said. Counting quote marks on the line is a
 * heuristic, and it fails safe: a wrong answer changes the brackets, never
 * whether the name is removed.
 */
function insideQuotation(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  let quotes = 0;
  for (let i = lineStart; i < index; i++) {
    const c = text[i];
    if (c === '"' || c === '“' || c === '”') quotes++;
  }
  return quotes % 2 === 1;
}

/**
 * Replace every redacted name and every link to a redacted page.
 *
 * Order matters: links are rewritten first, so that `[[goden|Goden]]` becomes a
 * single alias rather than a link wrapper around an already-substituted name.
 */
export function redactText(text: string | null | undefined): string {
  if (!text) return text ?? '';
  let out = text;

  // 1. Links at a redacted slug lose the link and keep only the alias. A link
  //    would still resolve to a 404 for this reader, and its href would name
  //    the person in the markup.
  out = out.replace(WIKI_LINK_RE, (whole, target: string, label?: string) => {
    const identity = REDACTED_IDENTITIES.find((i) => i.slug === linkTargetSlug(target));
    if (!identity) return whole;
    // A label that says something other than the name ("his successor") is
    // still worth keeping if it does not identify; but we cannot tell, so the
    // alias replaces the whole thing.
    void label;
    return identity.alias;
  });

  // 2. Identifying assets, before the names. A skin render names its subject
  //    twice over — in the picture and in the filename — and the filename is
  //    the reason this has to run first: substituting the name inside
  //    "goden-render.webp" would leave a path that no longer matches the asset
  //    rule, and the image would survive with an aliased URL.
  for (const identity of REDACTED_IDENTITIES) {
    for (const asset of identity.assets) {
      out = out.replace(new RegExp(`!\\[[^\\]]*\\]\\(${escapeRe(asset)}\\)`, 'g'), '');
      out = out.split(asset).join('');
    }
  }

  // 3. Bare names, wherever they occur — prose, infobox values, citation
  //    locators, captured source documents.
  for (const identity of REDACTED_IDENTITIES) {
    const names = [...identity.names].sort((a, b) => b.length - a.length);
    const re = new RegExp(`\\b(?:${names.map(escapeRe).join('|')})\\b`, 'gi');
    out = out.replace(re, (_m, offset: number) =>
      insideQuotation(out, offset) ? `[${identity.alias}]` : identity.alias,
    );
  }

  return out;
}

/** True if any redacted name or asset survives in the text. Used by tests. */
export function hasRedactedContent(text: string | null | undefined): boolean {
  if (!text) return false;
  for (const identity of REDACTED_IDENTITIES) {
    const re = new RegExp(`\\b(?:${identity.names.map(escapeRe).join('|')})\\b`, 'i');
    if (re.test(text)) return true;
    if (identity.assets.some((a) => text.includes(a))) return true;
    if (new RegExp(`\\[\\[\\s*${escapeRe(identity.slug)}\\s*[|\\]]`, 'i').test(text)) return true;
  }
  return false;
}

function isRedactedAsset(src: string | undefined): boolean {
  if (!src) return false;
  return REDACTED_IDENTITIES.some((i) => i.assets.some((a) => src.includes(a)));
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export function redactInfobox(rows: WikiInfoboxRow[]): WikiInfoboxRow[] {
  return rows.map((row) => ({ label: redactText(row.label), value: redactText(row.value) }));
}

/**
 * A whole page on its way to a reader without review rights.
 *
 * The caller is responsible for having already refused a page whose own slug is
 * redacted; this handles the far commoner case of a name mentioned in passing
 * on somebody else's page.
 */
export function redactPage(page: WikiPage): WikiPage {
  return {
    ...page,
    title: redactText(page.title),
    summary: redactText(page.summary),
    body: redactText(page.body),
    infobox: redactInfobox(page.infobox),
    leadImage: isRedactedAsset(page.leadImage) ? undefined : page.leadImage,
    leadImageCaption: isRedactedAsset(page.leadImage)
      ? undefined
      : redactText(page.leadImageCaption),
  };
}

/**
 * Listing rows: drop redacted pages entirely, redact names in what remains.
 *
 * Generic over the extra fields the various listings carry, so recent changes
 * (which add an edit note, itself free text a name can sit in) go through the
 * same function rather than a near-copy that someone forgets to update.
 */
export function redactSummaries<T extends WikiPageSummary & { note?: string }>(rows: T[]): T[] {
  return rows
    .filter((r) => !isRedactedSlug(r.slug))
    .map((r) => ({
      ...r,
      title: redactText(r.title),
      summary: redactText(r.summary),
      ...(typeof r.note === 'string' ? { note: redactText(r.note) } : {}),
    }));
}

/** Backlink rows and anything else shaped `{ slug, title }`. */
export function redactLinkRows<T extends { slug: string; title: string }>(rows: T[]): T[] {
  return rows
    .filter((r) => !isRedactedSlug(r.slug))
    .map((r) => ({ ...r, title: redactText(r.title) }));
}

/**
 * Reference-list entries.
 *
 * Locators are already clean when this runs, because citations are resolved
 * from the *redacted* body — `{{cite:thread-224905|post #7 (Goden)}}` has become
 * `post #7 (a Kingdom Foxes officer)` before `resolveWikiCitations` ever sees
 * it, which also keeps the map keys matching the markers in the rendered text.
 * What still needs doing is the source title, which comes from the manifest
 * rather than the body: an auto-extracted page title is exactly how a name
 * reached every reference list on the site once before.
 */
export function redactCitations(citations: WikiCitationMap): WikiCitationMap {
  const out: WikiCitationMap = {};
  for (const [ref, citation] of Object.entries(citations)) {
    out[ref] = {
      ...citation,
      title: redactText(citation.title),
      locator: redactText(citation.locator),
    };
  }
  return out;
}

/** The slug set used for red-link resolution: never confirm a redacted page exists. */
export function redactSlugSet(slugs: Iterable<string>): string[] {
  return [...slugs].filter((s) => !isRedactedSlug(s));
}

/** Page history: revision bodies are stored text and carry names like any other. */
export function redactRevisions<
  T extends { title: string; summary: string; body: string; infobox: WikiInfoboxRow[] },
>(revisions: T[]): T[] {
  return revisions.map((r) => ({
    ...r,
    title: redactText(r.title),
    summary: redactText(r.summary),
    body: redactText(r.body),
    infobox: redactInfobox(r.infobox),
  }));
}

/**
 * Does this page carry anything redacted?
 *
 * Used to keep the editor shut. A contributor without review rights would be
 * handed the redacted body, and saving it back would write the alias into the
 * record permanently — the redaction is a view, and a view must never become
 * the stored text. You cannot edit what you are not allowed to read.
 */
export function pageNeedsReviewerToEdit(page: {
  slug: string;
  title: string;
  summary: string;
  body: string;
  infobox: WikiInfoboxRow[];
}): boolean {
  if (isRedactedSlug(page.slug)) return true;
  const haystack = [
    page.title,
    page.summary,
    page.body,
    ...page.infobox.flatMap((r) => [r.label, r.value]),
  ].join('\n');
  return hasRedactedContent(haystack);
}
