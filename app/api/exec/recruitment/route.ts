import { NextRequest, NextResponse } from 'next/server';
import { isNarwhalRank, requireExecSession } from '@/lib/exec-auth';
import { MAX_RANGE_DAYS, parseTime } from '@/lib/recruitment';
import { getLive, getRange } from '@/lib/recruitment-db';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

// GET ?from=ISO&to=ISO (`to` exclusive; the browser sends its own local
// midnights, defaulting to the last 7 days) — the range's pfinder sessions,
// shouts and guild applications, who is clocked in now, today's (UTC) shouts,
// the latest shouts for the history, and the saved pfinder and shout messages
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const to = parseTime(params.get('to')) ?? new Date();
  const from = parseTime(params.get('from')) ?? new Date(to.getTime() - 7 * DAY);
  if (to <= from || to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY) {
    return NextResponse.json({ error: `Ask for up to ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }
  try {
    const [{ sessions, shouts, applications }, { open, today, recent, messages }] = await Promise.all([getRange(from, to), getLive()]);
    return NextResponse.json({
      from: from.toISOString(), to: to.toISOString(), sessions, shouts, applications, open, today, recent, messages,
      me: { discord_id: session.discord_id, can_manage: isNarwhalRank(session.rank) },
    });
  } catch (error) {
    console.error('Recruitment fetch error:', error);
    return NextResponse.json({ error: 'Failed to load recruitment' }, { status: 500 });
  }
}
