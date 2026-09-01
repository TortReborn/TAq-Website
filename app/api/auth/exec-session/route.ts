import { NextRequest, NextResponse } from 'next/server';
import { getExecSession, clearExecSessionCookie, checkGuildMembership, checkDiscordLink } from '@/lib/exec-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = getExecSession(request);

  // Unauthenticated responses use 200 with { authenticated: false } — every
  // consumer reads the body, and a 4xx here just spams the browser console
  // with a "Failed to load resource" error on every anonymous page view.
  if (!session) {
    // Normal case for anonymous visitors — not worth a server log line.
    return NextResponse.json({ authenticated: false });
  }

  // Verify the user is still in discord_links (any rank is OK)
  const linkCheck = await checkDiscordLink(session.discord_id);
  if (!linkCheck.ok) {
    console.warn(`[exec-session] ${session.discord_username} (${session.discord_id}) not found in discord_links`);
    const response = NextResponse.json({ authenticated: false, reason: 'not_linked' });
    clearExecSessionCookie(response);
    return response;
  }

  // Verify the user is still in the guild
  const inGuild = await checkGuildMembership(session.uuid);
  if (!inGuild) {
    console.warn(`[exec-session] ${linkCheck.ign} (${session.discord_username}) not in guild — UUID ${session.uuid} missing from cached guild data`);
    const response = NextResponse.json({ authenticated: false, reason: 'no_longer_in_guild' });
    clearExecSessionCookie(response);
    return response;
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      discord_id: session.discord_id,
      discord_username: session.discord_username,
      discord_avatar: session.discord_avatar,
      uuid: linkCheck.uuid,
      ign: linkCheck.ign,
      rank: linkCheck.rank,
      role: linkCheck.role,
    },
  });
}
