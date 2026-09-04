import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { loadChronicleData } from '@/lib/chronicle-db';
import { resolveWikiSlugs } from '@/lib/wiki-db';
import { slugify } from '@/lib/wiki';

export const dynamic = 'force-dynamic';

/** Approved Chronicle data (alliances + events) for the map layer. */
export async function GET() {
  try {
    const pool = getPool();
    const data = await loadChronicleData(pool);

    // Cross-link to the Chronicle wiki: alliances/events whose slugified
    // name matches an existing article carry its slug for "Read more" links.
    const candidates = [
      ...data.alliances.map(a => slugify(a.name)),
      ...data.events.map(e => slugify(e.title)),
    ].filter(Boolean);
    const existing = await resolveWikiSlugs(pool, [...new Set(candidates)]);
    for (const a of data.alliances) {
      const slug = slugify(a.name);
      if (existing.has(slug)) a.wikiSlug = slug;
    }
    for (const e of data.events) {
      const slug = slugify(e.title);
      if (existing.has(slug)) e.wikiSlug = slug;
    }
    // max-age=0 so browsers always revalidate — exec edits and deletions must
    // not linger client-side. The CDN edge may still serve up to 30s stale.
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=30',
      },
    });
  } catch (error) {
    console.error('[api:chronicle] failed to load data:', error);
    return NextResponse.json({ error: 'Failed to load chronicle data' }, { status: 500 });
  }
}
