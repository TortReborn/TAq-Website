import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { findMember, recordForMember } from '@/lib/tomes-db';

export const dynamic = 'force-dynamic';

// GET ?ign= — one member's tomes: received by kind, debt, requests and history
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ign = request.nextUrl.searchParams.get('ign')?.trim() ?? '';
  if (!/^\w{1,16}$/.test(ign)) return NextResponse.json({ error: 'Enter an IGN' }, { status: 400 });
  try {
    const member = await findMember(ign);
    if (!member) return NextResponse.json({ error: `No player called ${ign} is known` }, { status: 404 });
    return NextResponse.json(member);
  } catch (error) {
    console.error('Tome member fetch error:', error);
    return NextResponse.json({ error: 'Failed to load the member' }, { status: 500 });
  }
}

// POST { ign, action: 'debt', count, note } | { ign, action: 'adjust', kind, count (signed), note }
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 200) : '';
  const count = Number(body?.count);
  if (!note) return NextResponse.json({ error: 'Say why' }, { status: 400 });
  if (!Number.isInteger(count) || count === 0 || Math.abs(count) > 1000) return NextResponse.json({ error: 'Enter a number of tomes' }, { status: 400 });
  if (body?.action === 'debt' && count < 0) return NextResponse.json({ error: 'Debt is a positive number of tomes' }, { status: 400 });
  if (body?.action !== 'debt' && body?.action !== 'adjust') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  const kind = body?.kind === 'war' || body?.kind === 'raid' ? body.kind : null;
  if (body.action === 'adjust' && !kind) return NextResponse.json({ error: 'Pick war or raid tomes' }, { status: 400 });

  try {
    const member = await findMember(String(body?.ign ?? ''));
    if (!member) return NextResponse.json({ error: 'No such player' }, { status: 404 });
    await recordForMember(member.uuid, body.action === 'debt' ? 'debt' : 'adjusted', kind, count, note,
      { id: session.discord_id, name: session.ign }, member.ign);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Tome member record error:', error);
    return NextResponse.json({ error: 'Failed to record it' }, { status: 500 });
  }
}
