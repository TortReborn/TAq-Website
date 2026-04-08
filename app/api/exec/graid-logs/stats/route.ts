import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPlayerGraidStats } from '@/lib/graid-log-stats';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const ign = url.searchParams.get('ign');
    if (!ign) {
      return NextResponse.json({ error: 'Missing ign parameter' }, { status: 400 });
    }

    const stats = await getPlayerGraidStats(ign);
    if (!stats) {
      return NextResponse.json({ error: `No graid logs found for "${ign}"` }, { status: 404 });
    }

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Graid log stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch player stats' }, { status: 500 });
  }
}
