import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForToken,
  getDiscordUser,
  checkDiscordLinkRank,
  setExecSessionCookie,
  getBaseUrl,
} from '@/lib/exec-auth';

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Discord returned an error (e.g. user denied)
  if (error) {
    return NextResponse.redirect(new URL('/exec/login?error=denied', baseUrl));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/exec/login?error=missing_params', baseUrl));
  }

  // Verify state matches
  const storedState = request.cookies.get('oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL('/exec/login?error=invalid_state', baseUrl));
  }

  try {
    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(code);

    // Fetch Discord user info
    const discordUser = await getDiscordUser(accessToken);

    // Check if user has a qualifying rank in discord_links (Hammerhead or higher)
    const rankCheck = await checkDiscordLinkRank(discordUser.id);

    if (!rankCheck.ok) {
      const params = new URLSearchParams({ reason: rankCheck.reason });
      if (rankCheck.reason === 'not_linked') {
        params.set('discord_id', rankCheck.discord_id);
        params.set('discord_name', discordUser.username);
      } else {
        params.set('ign', rankCheck.ign);
        params.set('rank', rankCheck.rank);
        params.set('discord_name', discordUser.username);
      }
      const response = NextResponse.redirect(new URL(`/exec/unauthorized?${params.toString()}`, baseUrl));
      response.cookies.set('oauth_state', '', { maxAge: 0, path: '/' });
      return response;
    }

    // Build avatar URL
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordUser.id) >> 22n) % 6}.png`;

    // Set exec session cookie
    const response = NextResponse.redirect(new URL('/exec', baseUrl));
    setExecSessionCookie(response, {
      discord_id: discordUser.id,
      discord_username: discordUser.username,
      discord_avatar: avatarUrl,
      uuid: rankCheck.uuid,
      ign: rankCheck.ign,
      rank: rankCheck.rank,
    });

    // Clear OAuth state cookie
    response.cookies.set('oauth_state', '', { maxAge: 0, path: '/' });

    return response;
  } catch (err) {
    console.error('OAuth2 callback error:', err);
    return NextResponse.redirect(new URL('/exec/login?error=auth_failed', baseUrl));
  }
}
