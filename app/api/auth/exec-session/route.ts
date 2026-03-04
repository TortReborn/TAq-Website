import { NextRequest, NextResponse } from 'next/server';
import { getExecSession, clearExecSessionCookie, checkGuildMembership, checkDiscordLinkRank } from '@/lib/exec-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = getExecSession(request);

  if (!session) {
    console.warn('[exec-session] 401: No valid session cookie (missing, expired, or bad signature)');
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Verify the user still has a qualifying rank
  const rankCheck = await checkDiscordLinkRank(session.discord_id);
  if (!rankCheck.ok) {
    const detail = rankCheck.reason === 'not_linked'
      ? { reason: 'not_linked', detail: `Discord ID ${rankCheck.discord_id} has no linked account in discord_links` }
      : { reason: 'rank_not_allowed', detail: `${rankCheck.ign} has rank "${rankCheck.rank}" which is not in the allowed list`, ign: rankCheck.ign, rank: rankCheck.rank };
    console.warn(`[exec-session] 401: ${session.discord_username} (${session.discord_id}) — ${detail.detail}`);
    const response = NextResponse.json(
      { authenticated: false, ...detail },
      { status: 401 }
    );
    clearExecSessionCookie(response);
    return response;
  }

  // Verify the user is still in the guild
  const inGuild = await checkGuildMembership(session.uuid);
  if (!inGuild) {
    console.warn(`[exec-session] 401: ${rankCheck.ign} (${session.discord_username}) not in guild — UUID ${session.uuid} missing from cached guild data`);
    const response = NextResponse.json(
      { authenticated: false, reason: 'no_longer_in_guild', detail: `UUID ${session.uuid} (${rankCheck.ign}) not found in cached guild data` },
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
      ign: rankCheck.ign,
      rank: rankCheck.rank,
    },
  });
}
