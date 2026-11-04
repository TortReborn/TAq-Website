import { NextRequest, NextResponse } from 'next/server';
import { isNarwhalRank, requireExecSession } from '@/lib/exec-auth';
import { RecruitmentError, deleteSession, updateSession } from '@/lib/recruitment-db';
import { parseTime } from '@/lib/recruitment';

export const dynamic = 'force-dynamic';

// PATCH { started_at, ended_at } — correct a session's times: your own, or
// anyone's for Narwhal and up. ended_at is null only for a session still open.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Bad session id' }, { status: 400 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const start = parseTime(body?.started_at);
  const end = body?.ended_at === null ? null : parseTime(body?.ended_at);
  if (!start || (body?.ended_at !== null && !end)) {
    return NextResponse.json({ error: 'Send started_at, and ended_at (or null for a session still open)' }, { status: 400 });
  }
  try {
    const updated = await updateSession(id, { id: session.discord_id, name: session.ign }, isNarwhalRank(session.rank), start, end);
    return NextResponse.json({ session: updated });
  } catch (error) {
    if (error instanceof RecruitmentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Pfinder session update error:', error);
    return NextResponse.json({ error: 'Failed to change the session' }, { status: 500 });
  }
}

// DELETE — remove a session: your own, or anyone's for Narwhal and up
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Bad session id' }, { status: 400 });
  try {
    await deleteSession(id, { id: session.discord_id, name: session.ign }, isNarwhalRank(session.rank));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RecruitmentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Pfinder session delete error:', error);
    return NextResponse.json({ error: 'Failed to remove the session' }, { status: 500 });
  }
}
