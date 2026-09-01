import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireGuildSession } from '@/lib/exec-auth';
import { CHRONICLE_LIMITS } from '@/lib/chronicle';
import { listSubmissions, reviewSubmission } from '@/lib/chronicle-db';

export const dynamic = 'force-dynamic';

/** Exec-only: the pending queue plus recent decisions. */
export async function GET(request: NextRequest) {
  const session = await requireGuildSession(request);
  if (!session || session.role !== 'exec') {
    return NextResponse.json({ error: 'Exec access required' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const [pending, recent] = await Promise.all([
      listSubmissions(pool, 'pending', 100),
      listSubmissions(pool, undefined, 30),
    ]);
    return NextResponse.json({
      pending,
      recent: recent.filter(s => s.status !== 'pending'),
    });
  } catch (error) {
    console.error('[api:chronicle/review] list failed:', error);
    return NextResponse.json({ error: 'Failed to load submissions' }, { status: 500 });
  }
}

/** Exec-only: approve or reject one pending submission. */
export async function POST(request: NextRequest) {
  const session = await requireGuildSession(request);
  if (!session || session.role !== 'exec') {
    return NextResponse.json({ error: 'Exec access required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const id = Number.isInteger(b.id) && (b.id as number) > 0 ? (b.id as number) : null;
  if (!id) return NextResponse.json({ error: 'Invalid submission id' }, { status: 400 });
  if (typeof b.approve !== 'boolean') return NextResponse.json({ error: 'approve must be a boolean' }, { status: 400 });
  const reviewNote = typeof b.note === 'string' ? b.note.slice(0, CHRONICLE_LIMITS.noteMax).trim() : '';

  try {
    const result = await reviewSubmission(getPool(), {
      id,
      approve: b.approve,
      reviewedBy: session.ign || session.discord_username,
      reviewNote,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api:chronicle/review] decision failed:', error);
    return NextResponse.json({ error: 'Failed to apply decision' }, { status: 500 });
  }
}
