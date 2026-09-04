/**
 * Authorisation for the Chronicle wiki.
 *
 * The wiki has a different membership problem from the rest of the site. Every
 * other authenticated surface answers "is this person in the guild, and what
 * rank?" — `requireGuildSession` checks `discord_links` *and* the live roster,
 * and the OAuth callback sends anyone missing from `discord_links` to
 * /unauthorized. The people who actually remember this history frequently play
 * elsewhere, left years ago, or were never in The Aquarium at all. Gating the
 * wiki on guild membership would exclude exactly the contributors it needs.
 *
 * So a chronicler is authorised by Discord id alone, held in `wiki_chroniclers`
 * and nothing else. They get their own session cookie, minted by the same OAuth
 * callback but skipping the roster checks, because there is no uuid, ign or
 * rank to look up. Guild membership remains irrelevant to them in both
 * directions: leaving the guild does not revoke a chronicler, and being in the
 * guild does not make one.
 *
 * Execs keep everything they already had; a chronicler is a *narrower* role
 * that happens to be reachable from outside the guild. Chroniclers may write,
 * publish and review, but may not manage the chronicler list or delete pages —
 * those stay with exec, so the trusted set can only be widened by the guild.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getExecSession } from '@/lib/exec-auth';
import { EXEC_RANKS } from '@/lib/exec-auth';

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
 * chronicler cookie carries no rank for anything else to trust.
 */
function getSecret(): string {
  const secret = isTestMode()
    ? process.env.TEST_EXEC_SESSION_SECRET
    : process.env.EXEC_SESSION_SECRET;
  if (!secret) throw new Error('EXEC_SESSION_SECRET is not set');
  return secret;
}

export interface ChroniclerSessionData {
  discord_id: string;
  discord_username: string;
  discord_avatar: string;
  exp: number;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function setChroniclerSessionCookie(
  response: NextResponse,
  user: { discord_id: string; discord_username: string; discord_avatar: string },
): void {
  const data: ChroniclerSessionData = {
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

export function clearChroniclerSessionCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function getChroniclerSession(request: NextRequest): ChroniclerSessionData | null {
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

    const data: ChroniclerSessionData = JSON.parse(
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
  /** In-game name for a guild member, Discord username for an outside chronicler. */
  name: string;
  isExec: boolean;
  isChronicler: boolean;
  /** Any linked guild member — enough to suggest an edit for review. */
  isGuildMember: boolean;
  /** Edits go live without review. */
  canPublish: boolean;
  /** Can work the submission queue and vouch for pages. */
  canReview: boolean;
  /** Adding and removing chroniclers stays with the guild. */
  canManageChroniclers: boolean;
}

/**
 * Work out who is asking. A guild session is preferred when both cookies are
 * present, because it carries an in-game name worth attributing edits to; the
 * chronicler table is consulted either way, so a guild member can also hold the
 * role. Returns null for anonymous visitors.
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
    // A guild member who has since left keeps nothing but a chronicler role, if
    // they hold one — so fall through rather than returning a stale principal.
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
    if (chronicler) {
      return {
        discordId: execSession.discord_id,
        name: execSession.ign || execSession.discord_username,
        isExec: false,
        isChronicler: true,
        isGuildMember: false,
        canPublish: true,
        canReview: true,
        canManageChroniclers: false,
      };
    }
  }

  const chronSession = getChroniclerSession(request);
  if (chronSession) {
    // Re-checked on every request, so revoking a chronicler takes effect at
    // once rather than whenever their 30-day cookie happens to expire.
    if (await isChronicler(getPool(), chronSession.discord_id)) {
      return {
        discordId: chronSession.discord_id,
        name: chronSession.discord_username,
        isExec: false,
        isChronicler: true,
        isGuildMember: false,
        canPublish: true,
        canReview: true,
        canManageChroniclers: false,
      };
    }
  }

  return null;
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
