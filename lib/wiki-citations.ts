/**
 * Chronicles Wiki citations — Wikipedia-style inline references.
 *
 * Inline syntax (anywhere in a line, unlike the block embeds):
 *   {{cite:thread-237070}}                     archived source id
 *   {{cite:thread-237070|p3 #45}}              …with a locator
 *   {{cite:https://example.com/x|Page title}}  a bare URL
 *   {{cite:territory_exchanges map-data analysis}}   an unlinkable source
 *
 * Each distinct reference gets a number in order of first appearance; repeating
 * the same reference reuses its number. Markers render as superscript links to
 * a numbered reference list at the foot of the article.
 *
 * Citing by archived id is strongly preferred: the reference list then resolves
 * to the real title, URL and capture date from data/sources/index.json, and the
 * text we quoted is on disk (see data/sources/README.md).
 */

export interface WikiCitationRef {
  /** The full raw token, e.g. "{{cite:thread-237070|p3 #45}}" — the render key */
  raw: string;
  /** Archived source id, URL, or free text */
  ref: string;
  /** Optional page/post pointer, e.g. "p3 #45" */
  locator: string;
  /** 1-based, in order of first appearance */
  number: number;
}

/** A reference resolved against the source archive (server-side). */
export interface WikiCitation extends WikiCitationRef {
  /** Human-readable source name for the reference list */
  title: string;
  /** Clickable target, when the source has one */
  url?: string;
  /** e.g. "forum-thread", "titan-times" */
  kind?: string;
  /** Wayback capture stamp (YYYYMMDDhhmmss) when the citation is to a capture */
  waybackCapture?: string;
  /** True when the ref matched an entry in the local source archive */
  archived: boolean;
}

export type WikiCitationMap = Record<string, WikiCitation>;

/** Inline, so no anchors — but never matches across a line break or a nested brace. */
export const CITATION_RE = /\{\{cite:([^{}|\n]+?)(?:\|([^{}\n]*?))?\}\}/g;

export function isCitationUrl(ref: string): boolean {
  return /^https?:\/\//i.test(ref);
}

/**
 * Every citation in a body, numbered in order of first appearance.
 * Identical raw tokens share a number, as on Wikipedia.
 */
export function extractCitations(body: string): WikiCitationRef[] {
  const seen = new Map<string, WikiCitationRef>();
  CITATION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITATION_RE.exec(body)) !== null) {
    const raw = m[0];
    if (seen.has(raw)) continue;
    seen.set(raw, {
      raw,
      ref: m[1].trim(),
      locator: (m[2] ?? '').trim(),
      number: seen.size + 1,
    });
  }
  return [...seen.values()];
}

/** Citations in numbered order — what the reference list renders. */
export function citationList(map: WikiCitationMap): WikiCitation[] {
  return Object.values(map).sort((a, b) => a.number - b.number);
}

export const citationAnchor = (n: number) => `cite-${n}`;
export const citationBackAnchor = (n: number) => `cite-ref-${n}`;

/**
 * Fallback presentation for a citation with no archive entry: a URL shows its
 * host, anything else stands as written.
 */
export function fallbackCitationTitle(ref: string): string {
  if (!isCitationUrl(ref)) return ref;
  try {
    const u = new URL(ref);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return ref;
  }
}
