import { NextRequest, NextResponse } from 'next/server';
import { getExecSession, clearExecSessionCookie, checkGuildMembership, checkDiscordLink } from '@/lib/exec-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = getExecSession(request);

  if (!session) {
    console.warn('[exec-session] 401: No valid session cookie (missing, expired, or bad signature)');
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Verify the user is still in discord_links (any rank is OK)
  const linkCheck = await checkDiscordLink(session.discord_id);
  if (!linkCheck.ok) {
    console.warn(`[exec-session] 401: ${session.discord_username} (${session.discord_id}) not found in discord_links`);
    const response = NextResponse.json(
      { authenticated: false, reason: 'not_linked' },
      { status: 401 }
    );
    clearExecSessionCookie(response);
    return response;
  }

  // Verify the user is still in the guild
  const inGuild = await checkGuildMembership(session.uuid);
  if (!inGuild) {
    console.warn(`[exec-session] 401: ${linkCheck.ign} (${session.discord_username}) not in guild — UUID ${session.uuid} missing from cached guild data`);
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
      ign: linkCheck.ign,
      rank: linkCheck.rank,
      role: linkCheck.role,
    },
  });
}
