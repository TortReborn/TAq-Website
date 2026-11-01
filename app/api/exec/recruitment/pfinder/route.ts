import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { RecruitmentError, clockIn, clockOut, logSession } from '@/lib/recruitment-db';
import { parseTime } from '@/lib/recruitment';

export const dynamic = 'force-dynamic';

// POST { action: 'in' | 'out', at? } | { action: 'log', started_at, ended_at }
// Times are ISO strings; a missing `at` means now.
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const actor = { id: session.discord_id, name: session.ign };

  try {
    if (body?.action === 'in' || body?.action === 'out') {
      const at = parseTime(body.at) ?? new Date();
      const s = body.action === 'in' ? await clockIn(actor, at) : await clockOut(actor, at);
      return NextResponse.json({ session: s });
    }
    if (body?.action === 'log') {
      const start = parseTime(body.started_at);
      const end = parseTime(body.ended_at);
      if (!start || !end) return NextResponse.json({ error: 'Give a start and an end time' }, { status: 400 });
      return NextResponse.json({ session: await logSession(actor, start, end) });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof RecruitmentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Pfinder session error:', error);
    return NextResponse.json({ error: 'Failed to update your pfinder session' }, { status: 500 });
  }
}
