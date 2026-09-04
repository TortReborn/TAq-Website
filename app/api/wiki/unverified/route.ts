import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { resolveWikiPrincipal } from '@/lib/wiki-auth';
import { listUnverifiedPages, wikiAuthorshipStats } from '@/lib/wiki-db';

export const dynamic = 'force-dynamic';

/**
 * The contributor work-list: pages no human has touched and that lack enough
 * vouches, plus the corpus-wide AI/human split.
 *
 * Deliberately readable by anyone. The banner already tells every visitor that
 * a given page is unverified, so the aggregate is not a secret — and the whole
 * point is to make it easy for someone to find a page worth their attention.
 */
export async function GET(request: NextRequest) {
  try {
    const pool = getPool();
    const [pages, stats, principal] = await Promise.all([
      listUnverifiedPages(pool),
      wikiAuthorshipStats(pool),
      resolveWikiPrincipal(request),
    ]);
    return NextResponse.json({
      pages,
      stats,
      canValidate: principal?.canReview ?? false,
    });
  } catch (error) {
    console.error('[api:wiki/unverified] failed:', error);
    return NextResponse.json({ error: 'Failed to load the unverified list' }, { status: 500 });
  }
}
