/**
 * Chronicle Wiki live-data embeds.
 *
 * Directives are block-level: a line containing nothing but
 *   {{alliance:Name}}
 *   {{war-chart:Guild A|Guild B|2020-01-10|2020-04-01}}
 *   {{map:2019-05-01|optional label}}
 * Inline occurrences and anything inside code fences are left as plain text.
 *
 * This module is client-safe (parsing + types). Server-side resolution against
 * the chronicle/exchange tables lives in wiki-embed-db.ts.
 */

export type WikiEmbedKind = 'alliance' | 'war-chart' | 'map';

export interface WikiEmbedDirective {
  /** The exact directive line — the key embeds are resolved under */
  raw: string;
  kind: WikiEmbedKind;
  /** Pipe-separated args, trimmed */
  args: string[];
}

export interface AllianceEmbedData {
  kind: 'alliance';
  name: string;
  tag: string;
  color: string;
  allianceKind: 'war' | 'community';
  description: string;
  /** ISO date of the earliest membership */
  startsAt: string;
  /** ISO date of the latest departure, or null while any member remains */
  endsAt: string | null;
  members: { guild: string; joinedAt: string; leftAt: string | null }[];
  /** Slug of this alliance's wiki article, when one exists */
  wikiSlug: string | null;
}

export interface WarChartEmbedData {
  kind: 'war-chart';
  guildA: string;
  guildB: string;
  start: string;
  /** Window end as drawn — clipped to the last day in the log, see truncatedTo */
  end: string;
  /**
   * Weekly buckets (ISO date of the bucket start), zero-filled. `a` and `b` are
   * the average number of territories each guild held across that week, so a
   * square held for half the week counts 0.5.
   */
  weeks: { week: string; a: number; b: number }[];
  /** Mean territories held across the whole window */
  meanA: number;
  meanB: number;
  /**
   * Exchanges between the two guilds over the window. This measures how hard
   * they were fighting, not who was winning — see the note in wiki-embed-db.
   */
  exchanges: number;
  /** Runs of two or more days inside the window with nothing in the capture log */
  gaps: { from: string; to: string; days: number }[];
  /** Set when the directive's end date ran past the log and the window was cut back */
  truncatedTo: string | null;
}

export interface MapEmbedData {
  kind: 'map';
  date: string;
  label: string;
}

export interface EmbedErrorData {
  kind: 'error';
  message: string;
}

export type WikiEmbedData = AllianceEmbedData | WarChartEmbedData | MapEmbedData | EmbedErrorData;

/** Resolved embed data, keyed by the raw directive line */
export type WikiEmbedMap = Record<string, WikiEmbedData>;

const EMBED_LINE_RE = /^\{\{(alliance|war-chart|map):([^{}]+)\}\}\s*$/;

export function parseWikiEmbedLine(line: string): WikiEmbedDirective | null {
  const m = EMBED_LINE_RE.exec(line.trim());
  if (!m) return null;
  return {
    raw: line.trim().replace(/\s+$/, ''),
    kind: m[1] as WikiEmbedKind,
    args: m[2].split('|').map(s => s.trim()),
  };
}

export type WikiBodySegment =
  | { type: 'md'; text: string }
  | { type: 'embed'; directive: WikiEmbedDirective };

/**
 * Split a body into markdown chunks and embed directives, in document order.
 * Code fences are respected — a directive inside ``` stays markdown.
 */
export function splitWikiBody(body: string): WikiBodySegment[] {
  const segments: WikiBodySegment[] = [];
  let mdLines: string[] = [];
  let inFence = false;
  const flush = () => {
    if (mdLines.length) {
      segments.push({ type: 'md', text: mdLines.join('\n') });
      mdLines = [];
    }
  };
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const directive = inFence ? null : parseWikiEmbedLine(line);
    if (directive) {
      flush();
      segments.push({ type: 'embed', directive });
    } else {
      mdLines.push(line);
    }
  }
  flush();
  return segments;
}

/** Unique directives in a body, in first-appearance order. */
export function extractWikiEmbeds(body: string): WikiEmbedDirective[] {
  const out: WikiEmbedDirective[] = [];
  const seen = new Set<string>();
  for (const seg of splitWikiBody(body)) {
    if (seg.type === 'embed' && !seen.has(seg.directive.raw)) {
      seen.add(seg.directive.raw);
      out.push(seg.directive);
    }
  }
  return out;
}

export const WIKI_EMBED_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Longest window a war-chart may cover (weeks) — keeps queries and SVGs sane. */
export const WAR_CHART_MAX_WEEKS = 160;

export const WAR_CHART_WEEK_MS = 7 * 24 * 3600 * 1000;

/**
 * Clip a war-chart window to the end of the capture log.
 *
 * The live wars carry directive end dates in the future — they were written
 * while still being fought. Holdings are drawn from spans that run to the
 * window's end, so an end date past the log would extend the last known holder
 * over days nothing is recorded about and draw a settled front out of nothing.
 *
 * The returned end is exclusive, so `lastLoggedDay` itself is drawn in full.
 */
export function clipWarChartEnd(
  end: string,
  lastLoggedDay: string | null,
): { end: string; truncatedTo: string | null } {
  if (!lastLoggedDay || end <= lastLoggedDay) return { end, truncatedTo: null };
  const clipped = new Date(Date.parse(`${lastLoggedDay}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
  return { end: clipped, truncatedTo: clipped };
}

/**
 * Mean of a weekly series over a window whose last bucket is usually short.
 * Each bucket is a mean already, so a plain average would let three trailing
 * days weigh as much as a full week.
 */
export function weightedWeekMean(values: number[], startMs: number, endMs: number): number {
  if (values.length === 0) return 0;
  let sum = 0;
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    const from = startMs + i * WAR_CHART_WEEK_MS;
    const w = Math.min(from + WAR_CHART_WEEK_MS, endMs) - from;
    if (w <= 0) continue;
    sum += values[i] * w;
    total += w;
  }
  return total === 0 ? 0 : Math.round((sum / total) * 10) / 10;
}
