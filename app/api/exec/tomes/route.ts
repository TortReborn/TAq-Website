import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getOpenRequests, getRecentEvents } from '@/lib/tomes-db';

export const dynamic = 'force-dynamic';

// GET — open requests (every bucket) and recent tome activity
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [requests, recent] = await Promise.all([getOpenRequests(), getRecentEvents()]);
    return NextResponse.json({ requests, recent });
  } catch (error) {
    console.error('Tome queue fetch error:', error);
    return NextResponse.json({ error: 'Failed to load the tome queue' }, { status: 500 });
  }
}
