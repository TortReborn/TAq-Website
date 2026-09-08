/**
 * Authorisation for the Chronicle wiki.
 *
 * The wiki has a different membership problem from the rest of the site. Every
 * other authenticated surface answers "is this person in the guild, and what
 * rank?" — `requireGuildSession` checks `discord_links` *and* the live roster.
 * The people who actually remember this history frequently play elsewhere,
 * left years ago, or were never in The Aquarium at all. Gating the wiki on
 * guild membership would exclude exactly the contributors it needs.
 *
 * So the Chronicle asks a smaller question than the rest of the site: is there
 * a Discord account behind this request? Anyone who signs in with Discord gets
 * a principal here and may suggest an edit, whether or not they appear in
 * `discord_links` and whether or not they are in the guild. Suggestions land in
 * the review queue and nothing goes live without a reviewer, so the open door
 * grants an unknown contributor no more than the right to be read.
 *
 * A chronicler is the narrower, trusted role on top of that: held in
 * `wiki_chroniclers` by Discord id alone, it is what lets someone publish
 * without review and work the queue. Guild membership remains irrelevant to it
 * in both directions — leaving the guild does not revoke a chronicler, and
 * being in the guild does not make one.
 *
 * Execs keep everything they already had. Chroniclers may write, publish and
 * review, but may not manage the chronicler list or delete pages — those stay
 * with exec, so the trusted set can only be widened by the guild.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getExecSession } from '@/lib/exec-auth';
import { EXEC_RANKS } from '@/lib/exec-auth';

/**
 * The wiki session cookie. Named for the chronicler role it was introduced
 * for, and left that way on purpose: renaming it would sign out every
 * contributor holding one. It now stands for any Discord account signed in to
 * the Chronicle, and carries no rank, so nothing outside the wiki trusts it.
 */
const COOKIE_NAME = 'chronicler_session';
const SESSION_TTL = 30 * 24 * 60 * 60; // 30 days — contributors edit sporadically

function isTestMode(): boolean {
  const v = process.env.TEST_MODE;
  if (!v) return false;
  const s = v.toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/**
 * Reuses the exec session secret rather than introducing another env var to
 * provision. The cookie name differs, so the two can never be confused, and a
 * wiki cookie carries no rank for anything else to trust.
 */
function getSecret(): string {
  const secret = isTestMode()
    ? process.env.TEST_EXEC_SESSION_SECRET
    : process.env.EXEC_SESSION_SECRET;
  if (!secret) throw new Error('EXEC_SESSION_SECRET is not set');
  return secret;
}

export interface WikiSessionData {
  discord_id: string;
  discord_username: string;
  discord_avatar: string;
  exp: number;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function setWikiSessionCookie(
  response: NextResponse,
  user: { discord_id: string; discord_username: string; discord_avatar: string },
): void {
  const data: WikiSessionData = {
    discord_id: user.discord_id,
    discord_username: user.discord_username,
    discord_avatar: user.discord_avatar,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
  };
  const payloadB64 = Buffer.from(JSON.stringify(data)).toString('base64url');
  response.cookies.set(COOKIE_NAME, `${payloadB64}.${sign(payloadB64, getSecret())}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

export function clearWikiSessionCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function getWikiSession(request: NextRequest): WikiSessionData | null {
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }
  const cookie = request.cookies.get(COOKIE_NAME);
  if (!cookie) return null;

  const parts = cookie.value.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, providedSig] = parts;

  try {
    const expected = Buffer.from(sign(payloadB64, secret));
    const provided = Buffer.from(providedSig);
    if (expected.length !== provided.length) return null;
    if (!timingSafeEqual(expected, provided)) return null;

    const data: WikiSessionData = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    );
    if (Date.now() / 1000 > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The principal
// ---------------------------------------------------------------------------

export interface WikiPrincipal {
  discordId: string;
  /** In-game name for a guild member, Discord username for anyone else. */
  name: string;
  isExec: boolean;
  isChronicler: boolean;
  /** A linked account currently on the roster. Affects attribution, not rights. */
  isGuildMember: boolean;
  /** Edits go live without review. */
  canPublish: boolean;
  /** Can work the submission queue and vouch for pages. */
  canReview: boolean;
  /** Adding and removing chroniclers stays with the guild. */
  canManageChroniclers: boolean;
}

/**
 * Work out who is asking.
 *
 * Any signed-in Discord account resolves to a principal — that is the whole
 * point of this function being separate from `requireGuildSession`. Holding a
 * principal means "may suggest an edit" and nothing more; publishing and
 * reviewing are the `canPublish` / `canReview` flags, which only exec and
 * chronicler ever set. Returns null only for anonymous visitors.
 *
 * A guild session is preferred when both cookies are present, because it
 * carries an in-game name worth attributing edits to; the chronicler table is
 * consulted either way, so a guild member can also hold the role.
 */
export async function resolveWikiPrincipal(request: NextRequest): Promise<WikiPrincipal | null> {
  const { getPool } = await import('@/lib/db');
  const { isChronicler } = await import('@/lib/wiki-db');

  const execSession = getExecSession(request);
  if (execSession) {
    const { checkDiscordLink, checkGuildMembership } = await import('@/lib/exec-auth');
    const [link, inGuild, chronicler] = await Promise.all([
      checkDiscordLink(execSession.discord_id),
      checkGuildMembership(execSession.uuid),
      isChronicler(getPool(), execSession.discord_id),
    ]);
    if (link.ok && inGuild) {
      const isExec = EXEC_RANKS.includes(link.rank);
      return {
        discordId: execSession.discord_id,
        name: link.ign || execSession.discord_username,
        isExec,
        isChronicler: chronicler,
        isGuildMember: true,
        canPublish: isExec || chronicler,
        canReview: isExec || chronicler,
        canManageChroniclers: isExec,
      };
    }
    // Someone who has since left the guild, or whose link was removed. Their
    // rank is gone and with it everything it granted; what remains is a Discord
    // account that is signed in, which is enough to suggest — plus a chronicler
    // role if they hold one, which guild membership never governed.
    return {
      discordId: execSession.discord_id,
      name: execSession.ign || execSession.discord_username,
      isExec: false,
      isChronicler: chronicler,
      isGuildMember: false,
      canPublish: chronicler,
      canReview: chronicler,
      canManageChroniclers: false,
    };
  }

  const wikiSession = getWikiSession(request);
  if (wikiSession) {
    // Re-checked on every request, so revoking a chronicler takes effect at
    // once rather than whenever their 30-day cookie happens to expire.
    const chronicler = await isChronicler(getPool(), wikiSession.discord_id);
    return {
      discordId: wikiSession.discord_id,
      name: wikiSession.discord_username,
      isExec: false,
      isChronicler: chronicler,
      isGuildMember: false,
      canPublish: chronicler,
      canReview: chronicler,
      canManageChroniclers: false,
    };
  }

  return null;
}

/**
 * The same question, asked from a server component.
 *
 * Route handlers get a `NextRequest`; pages under `app/` do not, they get the
 * `cookies()` store. Both session readers touch the request only through
 * `request.cookies.get(name)`, and the store exposes exactly that method, so a
 * two-field shim spares us a second copy of the cookie-verifying logic — which
 * is the part that must not drift between the two paths.
 *
 * Used for read-gating pages (see lib/wiki-redaction.ts). Anything that writes
 * still goes through a route handler and `requireWikiEditor`.
 */
export async function resolveWikiPrincipalFromCookies(): Promise<WikiPrincipal | null> {
  const { cookies } = await import('next/headers');
  const store = cookies();
  const shim = { cookies: { get: (name: string) => store.get(name) } } as unknown as NextRequest;
  return resolveWikiPrincipal(shim);
}

/** Guard for routes that publish or review. */
export async function requireWikiEditor(request: NextRequest): Promise<WikiPrincipal | null> {
  const p = await resolveWikiPrincipal(request);
  return p && p.canPublish ? p : null;
}

/** Guard for routes that manage the chronicler list. */
export async function requireWikiAdmin(request: NextRequest): Promise<WikiPrincipal | null> {
  const p = await resolveWikiPrincipal(request);
  return p && p.canManageChroniclers ? p : null;
}
