import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const value = Number(body.value);

    if (!Number.isFinite(value) || value < 1 || value > 20) {
      return NextResponse.json({ error: 'Value must be between 1 and 20' }, { status: 400 });
    }

    await simpleDatabaseCache.setSetting('weekly_threshold', value);

    return NextResponse.json({ success: true, weeklyRequirement: value });
  } catch (error) {
    console.error('Failed to update weekly threshold:', error);
    return NextResponse.json({ error: 'Failed to update threshold' }, { status: 500 });
  }
}
