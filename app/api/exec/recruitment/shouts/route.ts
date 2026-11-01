import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { RecruitmentError, logShout } from '@/lib/recruitment-db';
import { parseTime } from '@/lib/recruitment';

export const dynamic = 'force-dynamic';

// POST { at?, note? } — log a shout; a missing `at` means now
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const at = parseTime(body?.at) ?? new Date();
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 200) || null : null;

  try {
    return NextResponse.json({ shout: await logShout({ id: session.discord_id, name: session.ign }, at, note) });
  } catch (error) {
    if (error instanceof RecruitmentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Shout log error:', error);
    return NextResponse.json({ error: 'Failed to log the shout' }, { status: 500 });
  }
}
