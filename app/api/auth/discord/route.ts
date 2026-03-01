import { NextResponse } from 'next/server';
import { generateOAuthState, getDiscordOAuthUrl, getBaseUrl } from '@/lib/exec-auth';

export async function GET() {
  try {
    const state = generateOAuthState();
    const url = getDiscordOAuthUrl(state);

    const response = NextResponse.redirect(url);

    // Store state in cookie for CSRF verification
    response.cookies.set('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 300, // 5 minutes
    });

    return response;
  } catch (error) {
    console.error('OAuth2 initiation error:', error);
    return NextResponse.redirect(new URL('/exec/login?error=config', getBaseUrl()));
  }
}
