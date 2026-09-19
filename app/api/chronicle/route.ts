import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { loadChronicleData } from '@/lib/chronicle-db';
import { resolveWikiSlugs } from '@/lib/wiki-db';
import { slugify } from '@/lib/wiki';
import { resolveWikiPrincipal } from '@/lib/wiki-auth';
import { canEnterChronicle } from '@/lib/chronicle-gate';

export const dynamic = 'force-dynamic';

/** Approved Chronicle data (alliances + events) for the map layer. */
export async function GET(request: NextRequest) {
  try {
    const pool = getPool();
    const data = await loadChronicleData(pool);

    // Cross-link to the Chronicle wiki: alliances/events whose slugified
    // name matches an existing article carry its slug for "Read more" links.
    // While the wiki is under construction (TAQ-90) only someone who may
    // enter it gets the slugs — the map itself is public, and even a slug
    // says which articles exist. Their response is then marked private so
    // the edge never hands it to an anonymous visitor.
    const principal = await resolveWikiPrincipal(request).catch(() => null);
    const linkWiki = canEnterChronicle(principal);
    const candidates = linkWiki
      ? [
          ...data.alliances.map(a => slugify(a.name)),
          ...data.events.map(e => slugify(e.title)),
        ].filter(Boolean)
      : [];
    const existing = candidates.length > 0
      ? await resolveWikiSlugs(pool, [...new Set(candidates)])
      : new Set<string>();
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
        'Cache-Control': linkWiki ? 'private, no-store' : 'public, max-age=0, s-maxage=30',
      },
    });
  } catch (error) {
    console.error('[api:chronicle] failed to load data:', error);
    return NextResponse.json({ error: 'Failed to load chronicle data' }, { status: 500 });
  }
}
