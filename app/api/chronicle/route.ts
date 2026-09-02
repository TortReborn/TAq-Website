import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { loadChronicleData } from '@/lib/chronicle-db';

export const dynamic = 'force-dynamic';

/** Approved Chronicle data (alliances + events) for the map layer. */
export async function GET() {
  try {
    const data = await loadChronicleData(getPool());
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
