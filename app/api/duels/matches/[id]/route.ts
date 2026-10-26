import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getExecSession } from '@/lib/exec-auth';
import { errorResponse, inTransaction, unauthorized } from '@/lib/duel/http';
import { loadMatch, seatOf, settleAndSave, toPayload } from '@/lib/duel/store';

export const dynamic = 'force-dynamic';

/**
 * The match as the caller may see it. Polled every couple of seconds while
 * waiting on the opponent, so it checks the session cookie only (no member
 * lookup; only the two seated players get anything back) and answers
 * `?v=<version>` with { unchanged: true } when nothing has moved.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getExecSession(request);
  if (!session) return unauthorized();
  const { id } = await params;
  // Absent means "send everything"; Number(null) would be 0, a real version.
  const raw = request.nextUrl.searchParams.get('v');
  const since = raw === null || raw === '' ? NaN : Number(raw);
  try {
    const row = await loadMatch(getPool(), id);
    const seat = row ? seatOf(row, session.discord_id) : null;
    if (!row || seat === null) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    const now = new Date();
    const clockRanOut = row.status === 'active' && row.deadline !== null && now > row.deadline;
    if (!clockRanOut && Number.isFinite(since) && since === row.version) {
      return NextResponse.json({ unchanged: true, version: row.version, deadline: row.deadline, now });
    }
    // Only the path that has to write takes the row lock.
    const current = clockRanOut
      ? await inTransaction(async client => settleAndSave(client, (await loadMatch(client, id, true))!, now))
      : row;
    return NextResponse.json({ match: toPayload(current, seat, now) });
  } catch (e) {
    return errorResponse(e, 'load match');
  }
}
