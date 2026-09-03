import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { searchWikiPages } from '@/lib/wiki-db';

export const dynamic = 'force-dynamic';

/** Public wiki search: title prefix + full-text, grouped client-side. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ results: [] });
  try {
    const results = await searchWikiPages(getPool(), q, 20);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('[api:wiki/search] failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
