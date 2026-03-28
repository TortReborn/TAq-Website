import { NextRequest, NextResponse } from 'next/server';
import { requireGuildSession } from '@/lib/exec-auth';
import { getPlayerSnipeStats } from '@/lib/snipe-stats';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireGuildSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await getPlayerSnipeStats(session.ign);
    if (!stats) {
      return NextResponse.json({ error: 'No snipes found' }, { status: 404 });
    }
    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Profile snipe stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch snipe stats' }, { status: 500 });
  }
}
