import { NextRequest, NextResponse } from 'next/server';
import { isNarwhalRank, requireExecSession } from '@/lib/exec-auth';
import { RecruitmentError, deleteShout, updateShout } from '@/lib/recruitment-db';
import { parseTime } from '@/lib/recruitment';

export const dynamic = 'force-dynamic';

// PATCH { at } — correct when a shout went out: your own, or anyone's for
// Narwhal and up. Moved to another UTC day, it needs a free slot there.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Bad shout id' }, { status: 400 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const at = parseTime(body?.at);
  if (!at) return NextResponse.json({ error: 'Send the time the shout went out' }, { status: 400 });
  try {
    const shout = await updateShout(id, { id: session.discord_id, name: session.ign }, isNarwhalRank(session.rank), at);
    return NextResponse.json({ shout });
  } catch (error) {
    if (error instanceof RecruitmentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Shout update error:', error);
    return NextResponse.json({ error: 'Failed to change the shout' }, { status: 500 });
  }
}

// DELETE — remove a mis-logged shout, freeing its slot: your own, or anyone's
// for Narwhal and up
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Bad shout id' }, { status: 400 });
  try {
    await deleteShout(id, { id: session.discord_id, name: session.ign }, isNarwhalRank(session.rank));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RecruitmentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Shout delete error:', error);
    return NextResponse.json({ error: 'Failed to remove the shout' }, { status: 500 });
  }
}
