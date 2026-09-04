import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getPool } from '@/lib/db';
import { ensureWikiTables } from '@/lib/wiki-db';

export const dynamic = 'force-dynamic';

/**
 * The state of the source archive: what we hold, what is actually being used,
 * and what is cited but missing.
 *
 * The archive and the articles drift apart in two directions and neither is
 * visible from a page. Sources get fetched and never mined — 119 of 320 at the
 * time of writing, some of them thousands of words of primary material. And a
 * citation can name a document that was never archived, in which case the
 * footnote resolves to nothing a reader can check. Both are editorial work
 * nobody can pick up if nobody can see it.
 *
 * Counted against the live database rather than the seed file, because the
 * question is what the published wiki cites, not what a checkout happens to
 * contain.
 */

interface SourceMeta {
  url?: string;
  kind?: string;
  title?: string;
  tier?: string;
  note?: string;
  textChars?: number;
  waybackCapture?: string;
  fetchedAt?: string;
}

export interface ArchiveEntry {
  id: string;
  title: string;
  tier: string;
  kind: string;
  url: string;
  words: number;
  note: string | null;
  citations: number;
  articles: string[];
}

export interface ArchiveGap {
  id: string;
  citations: number;
  articles: string[];
  /** A citation written as a bare URL bypasses the archive completely. */
  isRawUrl: boolean;
}

/**
 * Word counts are read off 7 MB of archived documents across 329 files, which
 * costs ~70ms of synchronous disk and string-splitting. Those files only change
 * when a deploy ships new ones, so the index's mtime and size are a sound key —
 * every import writes the index in the same pass as the document.
 */
let wordCache: { key: string; words: Map<string, number> } | null = null;

function wordCounts(root: string, ids: string[]): Map<string, number> {
  let key = 'no-index';
  try {
    const st = fs.statSync(path.join(root, 'index.json'));
    key = `${st.mtimeMs}:${st.size}`;
  } catch { /* fall through to a recount */ }
  if (wordCache?.key === key) return wordCache.words;

  const words = new Map<string, number>();
  for (const id of ids) {
    try {
      const doc = fs.readFileSync(path.join(root, 'docs', `${id}.md`), 'utf8');
      const body = doc.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
      words.set(id, body ? body.split(/\s+/).length : 0);
    } catch { words.set(id, 0); }
  }
  wordCache = { key, words };
  return words;
}

/**
 * Which page cites which source, resolved in Postgres.
 *
 * Doing this in JavaScript meant pulling every published body across the
 * network to run a regex over it — 0.73 MB and 385ms against the production
 * database, on a dashboard nobody wants to wait for. The same answer as one
 * column of ids costs 55ms.
 */
const CITATION_SQL = `
  SELECT DISTINCT p.slug, m[1] AS source_id
    FROM wiki_pages p,
         LATERAL regexp_matches(
           coalesce(p.summary, '') || E'\n' || coalesce(p.body, ''),
           '\{\{cite:([^}|]+)', 'g'
         ) AS m
   WHERE p.status = 'published'`;

export async function GET() {
  try {
    const root = path.join(process.cwd(), 'data', 'wiki', 'sources');
    let sources: Record<string, SourceMeta> = {};
    try {
      sources = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')).sources ?? {};
    } catch {
      return NextResponse.json({ error: 'The source index is not readable' }, { status: 500 });
    }

    const ids = Object.keys(sources);
    const words = wordCounts(root, ids);

    const pool = getPool();
    await ensureWikiTables(pool);
    const [cites, counted] = await Promise.all([
      pool.query<{ slug: string; source_id: string }>(CITATION_SQL),
      pool.query<{ pages: string }>(`SELECT COUNT(*) AS pages FROM wiki_pages WHERE status = 'published'`),
    ]);

    const usage = new Map<string, Set<string>>();
    for (const row of cites.rows) {
      const id = row.source_id.trim();
      if (!usage.has(id)) usage.set(id, new Set());
      usage.get(id)!.add(row.slug);
    }

    const entries: ArchiveEntry[] = ids.map((id) => {
      const s = sources[id];
      const cited = usage.get(id);
      return {
        id,
        title: s.title?.trim() || id,
        tier: s.tier ?? 'unclassified',
        kind: s.kind ?? 'web',
        url: s.url ?? '',
        words: words.get(id) ?? 0,
        // Trimmed here rather than in the browser: the panel shows 160
        // characters, and a few hundred notes at full length is the bulk of
        // this response.
        note: s.note?.trim() ? s.note.trim().slice(0, 200) : null,
        citations: cited ? cited.size : 0,
        articles: cited ? [...cited].sort() : [],
      };
    }).sort((a, b) => a.title.localeCompare(b.title));

    const archived = new Set(ids);
    const gaps: ArchiveGap[] = [...usage.entries()]
      .filter(([id]) => !archived.has(id))
      .map(([id, slugs]) => ({
        id,
        citations: slugs.size,
        articles: [...slugs].sort(),
        isRawUrl: /^https?:\/\//i.test(id),
      }))
      .sort((a, b) => b.citations - a.citations);

    const used = entries.filter((e) => e.citations > 0);
    return NextResponse.json({
      entries,
      gaps,
      totals: {
        archived: entries.length,
        cited: used.length,
        uncited: entries.length - used.length,
        // The material we hold and have not used yet — the number that says how
        // much history is sitting there unwritten.
        uncitedWords: entries.filter((e) => e.citations === 0).reduce((n, e) => n + e.words, 0),
        pages: Number(counted.rows[0]?.pages ?? 0),
        citations: cites.rowCount ?? 0,
      },
    });
  } catch (error) {
    console.error('[api:wiki/archive] failed:', error);
    return NextResponse.json({ error: 'Failed to read the source archive' }, { status: 500 });
  }
}
