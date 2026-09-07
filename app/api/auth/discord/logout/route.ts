import { NextResponse } from 'next/server';
import { clearExecSessionCookie, getBaseUrl } from '@/lib/exec-auth';
import { clearWikiSessionCookie } from '@/lib/wiki-auth';

/**
 * Signing out clears both cookies. Anyone signed in with Discord now holds a
 * wiki session, so clearing only the exec one would leave someone still able
 * to edit the Chronicle after pressing Log out.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  clearExecSessionCookie(response);
  clearWikiSessionCookie(response);
  return response;
}

export async function GET() {
  const baseUrl = getBaseUrl();
  const response = NextResponse.redirect(new URL('/login', baseUrl));
  clearExecSessionCookie(response);
  clearWikiSessionCookie(response);
  return response;
}
