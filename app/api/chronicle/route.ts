import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { loadChronicleData } from '@/lib/chronicle-db';

export const dynamic = 'force-dynamic';

/** Approved Chronicle data (alliances + events) for the map layer. */
export async function GET() {
  try {
    const data = await loadChronicleData(getPool());
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });
  } catch (error) {
    console.error('[api:chronicle] failed to load data:', error);
    return NextResponse.json({ error: 'Failed to load chronicle data' }, { status: 500 });
  }
}
