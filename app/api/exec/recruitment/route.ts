import { NextRequest, NextResponse } from 'next/server';
import { isNarwhalRank, requireExecSession } from '@/lib/exec-auth';
import { MAX_RANGE_DAYS, addDays, parseDay, utcDay, weekStart } from '@/lib/recruitment';
import { getLive, getRange } from '@/lib/recruitment-db';

export const dynamic = 'force-dynamic';

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (UTC days, `to` exclusive; defaults to
// this week) — the range's pfinder sessions and shouts, who is clocked in
// now, and today's (UTC) shouts
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const from = parseDay(params.get('from')) ?? weekStart(utcDay(Date.now()));
  const to = parseDay(params.get('to')) ?? addDays(from, 7);
  if (to <= from || to > addDays(from, MAX_RANGE_DAYS)) {
    return NextResponse.json({ error: `Ask for 1 to ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }
  try {
    const [{ sessions, shouts }, { open, today }] = await Promise.all([
      getRange(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`)),
      getLive(),
    ]);
    return NextResponse.json({
      from, to, sessions, shouts, open, today,
      me: { discord_id: session.discord_id, can_manage: isNarwhalRank(session.rank) },
    });
  } catch (error) {
    console.error('Recruitment fetch error:', error);
    return NextResponse.json({ error: 'Failed to load recruitment' }, { status: 500 });
  }
}
