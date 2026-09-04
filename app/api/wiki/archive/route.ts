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

const CITE = /\{\{cite:([^}|]+)/g;

export async function GET() {
  try {
    const root = path.join(process.cwd(), 'data', 'wiki', 'sources');
    let sources: Record<string, SourceMeta> = {};
    try {
      sources = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')).sources ?? {};
    } catch {
      return NextResponse.json({ error: 'The source index is not readable' }, { status: 500 });
    }

    // Word counts come from the archived document, not the index, so a source
    // that failed to extract shows as the near-empty thing it is.
    const words = (id: string): number => {
      try {
        const doc = fs.readFileSync(path.join(root, 'docs', `${id}.md`), 'utf8');
        const body = doc.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
        return body ? body.split(/\s+/).length : 0;
      } catch { return 0; }
    };

    const pool = getPool();
    await ensureWikiTables(pool);
    const { rows } = await pool.query<{ slug: string; title: string; summary: string; body: string }>(
      `SELECT slug, title, summary, body FROM wiki_pages WHERE status = 'published'`,
    );

    const usage = new Map<string, Set<string>>();
    for (const page of rows) {
      const text = `${page.summary ?? ''}\n${page.body ?? ''}`;
      for (const m of text.matchAll(CITE)) {
        const id = m[1].trim();
        if (!usage.has(id)) usage.set(id, new Set());
        usage.get(id)!.add(page.slug);
      }
    }

    const entries: ArchiveEntry[] = Object.entries(sources).map(([id, s]) => {
      const cited = usage.get(id);
      return {
        id,
        title: s.title?.trim() || id,
        tier: s.tier ?? 'unclassified',
        kind: s.kind ?? 'web',
        url: s.url ?? '',
        words: words(id),
        note: s.note?.trim() || null,
        citations: cited ? cited.size : 0,
        articles: cited ? [...cited].sort() : [],
      };
    }).sort((a, b) => a.title.localeCompare(b.title));

    const archived = new Set(Object.keys(sources));
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
        pages: rows.length,
        citations: [...usage.values()].reduce((n, s) => n + s.size, 0),
      },
    });
  } catch (error) {
    console.error('[api:wiki/archive] failed:', error);
    return NextResponse.json({ error: 'Failed to read the source archive' }, { status: 500 });
  }
}
