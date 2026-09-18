import { NextResponse } from 'next/server';
import { clearExecSessionCookie } from '@/lib/exec-auth';
import { clearWikiSessionCookie } from '@/lib/wiki-auth';

/**
 * Signing out clears both cookies. Anyone signed in with Discord now holds a
 * wiki session, so clearing only the exec one would leave someone still able
 * to edit the Chronicle after pressing Log out.
 *
 * POST only: a GET handler would let any third-party page sign a member out
 * (an <img src>, a redirect). Callers use lib/logout-client.ts.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  clearExecSessionCookie(response);
  clearWikiSessionCookie(response);
  return response;
}
