import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { searchWikiPages } from '@/lib/wiki-db';
import { resolveWikiPrincipal } from '@/lib/wiki-auth';
import { canSeeRedacted, redactSummaries } from '@/lib/wiki-redaction';
import { canEnterChronicle } from '@/lib/chronicle-gate';

export const dynamic = 'force-dynamic';

/** Wiki search: title prefix + full-text, grouped client-side. */
export async function GET(request: NextRequest) {
  const principal = await resolveWikiPrincipal(request).catch(() => null);
  if (!canEnterChronicle(principal)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const q = request.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ results: [] });
  try {
    const found = await searchWikiPages(getPool(), q, 20);
    // Searching a redacted name must not confirm the page exists, and must not
    // return the summaries of other pages that mention it verbatim.
    const results = canSeeRedacted(principal) ? found : redactSummaries(found);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('[api:wiki/search] failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
