import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForToken,
  getDiscordUser,
  checkDiscordLink,
  setExecSessionCookie,
  getBaseUrl,
} from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Discord returned an error (e.g. user denied)
  if (error) {
    return NextResponse.redirect(new URL('/login?error=denied', baseUrl));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/login?error=missing_params', baseUrl));
  }

  // Verify state matches
  const storedState = request.cookies.get('oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL('/login?error=invalid_state', baseUrl));
  }

  try {
    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(code);

    // Fetch Discord user info
    const discordUser = await getDiscordUser(accessToken);

    // Check if user exists in discord_links (any guild member can log in)
    const linkCheck = await checkDiscordLink(discordUser.id);

    if (!linkCheck.ok) {
      console.warn(`[auth] Login denied: Discord user ${discordUser.username} (${linkCheck.discord_id}) not found in discord_links`);
      const params = new URLSearchParams({ reason: 'not_linked', discord_id: linkCheck.discord_id, discord_name: discordUser.username });
      const response = NextResponse.redirect(new URL(`/unauthorized?${params.toString()}`, baseUrl));
      response.cookies.set('oauth_state', '', { maxAge: 0, path: '/' });
      return response;
    }

    // Build avatar URL
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordUser.id) >> 22n) % 6}.png`;

    // Redirect: use stored redirect path if present, otherwise role-based default
    const storedRedirect = request.cookies.get('oauth_redirect')?.value;
    const redirectPath = storedRedirect || (linkCheck.role === 'exec' ? '/exec' : '/profile');
    const response = NextResponse.redirect(new URL(redirectPath, baseUrl));
    setExecSessionCookie(response, {
      discord_id: discordUser.id,
      discord_username: discordUser.username,
      discord_avatar: avatarUrl,
      uuid: linkCheck.uuid,
      ign: linkCheck.ign,
      rank: linkCheck.rank,
      role: linkCheck.role,
    });

    // Track login for analytics (fire-and-forget)
    getPool().query(
      `INSERT INTO analytics_logins (discord_id, ign, rank, role) VALUES ($1, $2, $3, $4)`,
      [discordUser.id, linkCheck.ign, linkCheck.rank, linkCheck.role]
    ).catch(() => {});

    // Clear OAuth cookies
    response.cookies.set('oauth_state', '', { maxAge: 0, path: '/' });
    response.cookies.set('oauth_redirect', '', { maxAge: 0, path: '/' });

    return response;
  } catch (err) {
    console.error('OAuth2 callback error:', err);
    return NextResponse.redirect(new URL('/login?error=auth_failed', baseUrl));
  }
}
