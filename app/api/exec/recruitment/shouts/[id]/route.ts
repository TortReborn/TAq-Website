import { NextRequest, NextResponse } from 'next/server';
import { isNarwhalRank, requireExecSession } from '@/lib/exec-auth';
import { RecruitmentError, deleteShout } from '@/lib/recruitment-db';

export const dynamic = 'force-dynamic';

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
