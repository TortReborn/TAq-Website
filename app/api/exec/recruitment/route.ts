import { NextRequest, NextResponse } from 'next/server';
import { isNarwhalRank, requireExecSession } from '@/lib/exec-auth';
import { parseMonth, utcDay } from '@/lib/recruitment';
import { getLive, getMonth } from '@/lib/recruitment-db';

export const dynamic = 'force-dynamic';

// GET ?month=YYYY-MM — that month's pfinder sessions and shouts, who is
// clocked in now, and today's (UTC) shouts
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const month = parseMonth(request.nextUrl.searchParams.get('month')) ?? utcDay(Date.now()).slice(0, 7);
  try {
    const [{ sessions, shouts }, { open, today }] = await Promise.all([getMonth(month), getLive()]);
    return NextResponse.json({
      month, sessions, shouts, open, today,
      me: { discord_id: session.discord_id, can_manage: isNarwhalRank(session.rank) },
    });
  } catch (error) {
    console.error('Recruitment fetch error:', error);
    return NextResponse.json({ error: 'Failed to load recruitment' }, { status: 500 });
  }
}
