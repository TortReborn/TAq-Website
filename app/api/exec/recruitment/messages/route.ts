import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { RecruitmentError, saveMessage } from '@/lib/recruitment-db';
import { isMessageKind } from '@/lib/recruitment';

export const dynamic = 'force-dynamic';

// PUT { kind: 'pfinder' | 'shout', body, seen } — replace a saved message;
// `seen` is the updated_at the editor started from, or null if there was none
export async function PUT(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!isMessageKind(body?.kind) || typeof body?.body !== 'string') {
    return NextResponse.json({ error: 'Send a kind (pfinder or shout) and the message' }, { status: 400 });
  }
  const seen = typeof body.seen === 'string' ? body.seen : null;

  try {
    return NextResponse.json({ message: await saveMessage({ id: session.discord_id, name: session.ign }, body.kind, body.body, seen) });
  } catch (error) {
    if (error instanceof RecruitmentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Recruitment message save error:', error);
    return NextResponse.json({ error: 'Failed to save the message' }, { status: 500 });
  }
}
