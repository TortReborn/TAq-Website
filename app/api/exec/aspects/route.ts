import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getAspectOverview } from '@/lib/aspects-db';

export const dynamic = 'force-dynamic';

// GET — owed aspects, the rotation from its marker, recent distributions and the blacklist (read-only)
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await getAspectOverview());
  } catch (error) {
    console.error('Aspect overview error:', error);
    return NextResponse.json({ error: 'Failed to load the aspect queue' }, { status: 500 });
  }
}
