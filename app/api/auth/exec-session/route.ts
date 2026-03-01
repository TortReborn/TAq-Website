import { NextRequest, NextResponse } from 'next/server';
import { getExecSession, clearExecSessionCookie, checkGuildMembership } from '@/lib/exec-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = getExecSession(request);

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Verify the user is still in the guild
  const inGuild = await checkGuildMembership(session.uuid);
  if (!inGuild) {
    const response = NextResponse.json(
      { authenticated: false, reason: 'no_longer_in_guild' },
      { status: 401 }
    );
    clearExecSessionCookie(response);
    return response;
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      discord_id: session.discord_id,
      discord_username: session.discord_username,
      discord_avatar: session.discord_avatar,
      ign: session.ign,
      rank: session.rank,
    },
  });
}
