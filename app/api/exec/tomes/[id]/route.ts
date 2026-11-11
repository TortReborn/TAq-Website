import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { BUCKETS, parseScreenshots, type TomeBucket } from '@/lib/tomes';
import { cancelRequest, give, moveRequest, setNote, TomeConflict } from '@/lib/tomes-db';

export const dynamic = 'force-dynamic';

// POST { action: 'give', count, screenshots? } | { action: 'move', bucket } | { action: 'cancel', reason? }
//    | { action: 'note', note } (an empty note clears it)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Bad request id' }, { status: 400 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const actor = { id: session.discord_id, name: session.ign };

  try {
    if (body?.action === 'give') {
      const count = Number(body.count);
      if (!Number.isInteger(count) || count < 1) return NextResponse.json({ error: 'Give at least one tome' }, { status: 400 });
      const screenshots = parseScreenshots(body.screenshots);
      if (!screenshots) return NextResponse.json({ error: 'Those screenshots were not uploaded here' }, { status: 400 });
      return NextResponse.json({ given: await give([{ request_id: id, count }], actor, screenshots) });
    }
    if (body?.action === 'move') {
      if (!BUCKETS.some(b => b.key === body.bucket)) return NextResponse.json({ error: 'Unknown bucket' }, { status: 400 });
      await moveRequest(id, body.bucket as TomeBucket, actor);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === 'note') {
      if (typeof body.note !== 'string') return NextResponse.json({ error: 'Send a note' }, { status: 400 });
      if (body.note.trim().length > 200) return NextResponse.json({ error: 'Keep the note to 200 characters' }, { status: 400 });
      await setNote(id, body.note, actor);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === 'cancel') {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
      return NextResponse.json(await cancelRequest(id, actor, reason));
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof TomeConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Tome request action error:', error);
    return NextResponse.json({ error: 'Failed to update the request' }, { status: 500 });
  }
}
