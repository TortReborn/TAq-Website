import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { DOLPHIN_PLUS_RANKS } from '@/lib/rank-constants';

// --- Exec session cookie management ---

export interface ExecSessionData {
  discord_id: string;
  discord_username: string;
  discord_avatar: string;
  uuid: string;
  ign: string;
  rank: string;
  role: 'exec' | 'member';
  exp: number;
}

const COOKIE_NAME = 'exec_session';
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

function isTestMode(): boolean {
  const v = process.env.TEST_MODE;
  if (!v) return false;
  const s = v.toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function pickEnv(name: string, nameTest: string): string | undefined {
  return isTestMode() ? process.env[nameTest] : process.env[name];
}

function getSecret(): string {
  const secret = pickEnv('EXEC_SESSION_SECRET', 'TEST_EXEC_SESSION_SECRET');
  if (!secret) throw new Error('EXEC_SESSION_SECRET is not set');
  return secret;
}

/**
 * The session secret, for other short-lived signed tokens (uniform skin
 * links, TAQ-89). Callers must namespace what they sign so a token minted
 * for one purpose can never verify as another.
 */
export function getSessionSecret(): string {
  return getSecret();
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function setExecSessionCookie(
  response: NextResponse,
  user: { discord_id: string; discord_username: string; discord_avatar: string; uuid: string; ign: string; rank: string; role: 'exec' | 'member' }
): void {
  const secret = getSecret();

  const sessionData: ExecSessionData = {
    discord_id: user.discord_id,
    discord_username: user.discord_username,
    discord_avatar: user.discord_avatar,
    uuid: user.uuid,
    ign: user.ign,
    rank: user.rank,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
  };

  const payloadB64 = Buffer.from(JSON.stringify(sessionData)).toString('base64url');
  const signature = signPayload(payloadB64, secret);
  const cookieValue = `${payloadB64}.${signature}`;

  response.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

export function getExecSession(request: NextRequest): ExecSessionData | null {
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
    const expectedSig = signPayload(payloadB64, secret);

    const expectedBuf = Buffer.from(expectedSig);
    const providedBuf = Buffer.from(providedSig);
    if (expectedBuf.length !== providedBuf.length) return null;
    if (!timingSafeEqual(expectedBuf, providedBuf)) return null;

    const data: ExecSessionData = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8')
    );

    if (Date.now() / 1000 > data.exp) return null;

    return data;
  } catch {
    return null;
  }
}

export function clearExecSessionCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Helper for protected exec API routes.
 * Verifies the session cookie, then re-checks membership (guild_roster) and
 * rank (discord_links) on every request, so a demotion or an in-game leave
 * takes effect immediately. The same query also refreshes the ign, so
 * consumers never see the cookie's stale name after a rename.
 * Returns the session data or null. If null, the caller should return a 401 response.
 */
export async function requireExecSession(request: NextRequest): Promise<ExecSessionData | null> {
  const session = getExecSession(request);
  if (!session) return null;

  // Re-verify rank (and refresh ign) from database on every request
  const rankCheck = await checkDiscordLinkRank(session.discord_id);
  if (!rankCheck.ok) return null;

  return { ...session, rank: rankCheck.rank, ign: rankCheck.ign };
}

/**
 * Generate a random state parameter for OAuth2 CSRF protection.
 */
export function generateOAuthState(): string {
  return randomBytes(32).toString('hex');
}

/**
 * A post-login destination is only ever a path on this site. `new URL(x, base)`
 * lets an absolute `x` win over `base`, so anything that isn't a single-slash
 * relative path (`//host`, `https:`, `javascript:`, backslash tricks) would
 * send a freshly authenticated user off-site. Returns the path or null.
 */
export function safeRedirectPath(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/\\')) return null;
  try {
    const base = 'https://redirect.invalid';
    const url = new URL(candidate, base);
    if (url.origin !== base) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export function getBaseUrl(): string {
  return pickEnv('NEXT_PUBLIC_BASE_URL', 'TEST_NEXT_PUBLIC_BASE_URL') || 'http://localhost:3000';
}

// --- Discord OAuth2 configuration ---

const DISCORD_API_BASE = 'https://discord.com/api/v10';

// Ranks that are allowed to access the exec dashboard (Hammerhead or higher)
export const EXEC_RANKS = ['Hammerhead', 'Sailfish', 'Dolphin', 'Narwhal', 'Hydra', '✫✪✫ Hydra - Leader'];
export const NARWHAL_RANKS = ['Narwhal', 'Hydra', '✫✪✫ Hydra - Leader'];
export const DOLPHIN_RANKS = DOLPHIN_PLUS_RANKS;
const ALLOWED_RANKS = EXEC_RANKS;

export function isNarwhalRank(rank?: string | null): boolean {
  return !!rank && NARWHAL_RANKS.includes(rank);
}

export function isDolphinRank(rank?: string | null): boolean {
  return !!rank && DOLPHIN_RANKS.includes(rank);
}

export async function requireNarwhalSession(request: NextRequest): Promise<ExecSessionData | null> {
  const session = await requireExecSession(request);
  return session && isNarwhalRank(session.rank) ? session : null;
}

export async function requireDolphinSession(request: NextRequest): Promise<ExecSessionData | null> {
  const session = await requireExecSession(request);
  return session && isDolphinRank(session.rank) ? session : null;
}

export function getDiscordOAuthUrl(state: string): string {
  const clientId = pickEnv('DISCORD_CLIENT_ID', 'TEST_DISCORD_CLIENT_ID');
  const redirectUri = pickEnv('DISCORD_REDIRECT_URI', 'TEST_DISCORD_REDIRECT_URI');
  if (!clientId || !redirectUri) {
    throw new Error('DISCORD_CLIENT_ID or DISCORD_REDIRECT_URI not set');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const clientId = pickEnv('DISCORD_CLIENT_ID', 'TEST_DISCORD_CLIENT_ID');
  const clientSecret = pickEnv('DISCORD_CLIENT_SECRET', 'TEST_DISCORD_CLIENT_SECRET');
  const redirectUri = pickEnv('DISCORD_REDIRECT_URI', 'TEST_DISCORD_REDIRECT_URI');
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Discord OAuth2 env vars not set');
  }

  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord token exchange failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function getDiscordUser(accessToken: string): Promise<{
  id: string;
  username: string;
  avatar: string | null;
}> {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Discord user: ${response.status}`);
  }

  return response.json();
}

export type RankCheckResult =
  | { ok: true; uuid: string; ign: string; rank: string }
  | { ok: false; reason: 'not_linked'; discord_id: string }
  | { ok: false; reason: 'not_in_guild'; discord_id: string; ign: string }
  | { ok: false; reason: 'rank_not_allowed'; discord_id: string; ign: string; rank: string; allowed: string[] };

export type GuildMemberCheckResult =
  | { ok: true; uuid: string; ign: string; rank: string; role: 'exec' | 'member' }
  | { ok: false; reason: 'not_linked'; discord_id: string }
  | { ok: false; reason: 'not_in_guild'; discord_id: string; ign: string };

export type LinkedMemberLookup =
  | { linked: false }
  | { linked: true; uuid: string; ign: string; rank: string | null; inGuild: boolean };

/**
 * The identity + membership question in one query (TAQ-76): the Discord
 * account's discord_links row, and whether that player is on guild_roster.
 * `rank` is the Discord rank role they hold, or null.
 */
export async function lookupLinkedMember(discordId: string): Promise<LinkedMemberLookup> {
  const { getPool } = await import('@/lib/db');
  const pool = getPool();

  const result = await pool.query(
    `SELECT dl.uuid, dl.ign, dl.rank,
            EXISTS (SELECT 1 FROM guild_roster gr WHERE gr.uuid = dl.uuid) AS in_guild
       FROM discord_links dl
      WHERE dl.discord_id = $1`,
    [discordId]
  );
  if (result.rows.length === 0) return { linked: false };
  const row = result.rows[0];
  return { linked: true, uuid: row.uuid, ign: row.ign, rank: row.rank ?? null, inGuild: row.in_guild === true };
}

/** Pure decision for checkDiscordLinkRank, exported for tests. */
export function rankCheckFromLookup(discordId: string, link: LinkedMemberLookup): RankCheckResult {
  if (!link.linked) {
    return { ok: false, reason: 'not_linked', discord_id: discordId };
  }
  if (!link.inGuild) {
    return { ok: false, reason: 'not_in_guild', discord_id: discordId, ign: link.ign };
  }
  if (!link.rank || !ALLOWED_RANKS.includes(link.rank)) {
    return { ok: false, reason: 'rank_not_allowed', discord_id: discordId, ign: link.ign, rank: link.rank ?? '', allowed: ALLOWED_RANKS };
  }
  return { ok: true, uuid: link.uuid, ign: link.ign, rank: link.rank };
}

/** Pure decision for checkDiscordLink, exported for tests. */
export function memberCheckFromLookup(discordId: string, link: LinkedMemberLookup): GuildMemberCheckResult {
  if (!link.linked) {
    return { ok: false, reason: 'not_linked', discord_id: discordId };
  }
  if (!link.inGuild) {
    return { ok: false, reason: 'not_in_guild', discord_id: discordId, ign: link.ign };
  }
  const rank = link.rank ?? '';
  const role = EXEC_RANKS.includes(rank) ? 'exec' : 'member';
  return { ok: true, uuid: link.uuid, ign: link.ign, rank, role };
}

/**
 * Check if a Discord user is a current guild member with a qualifying rank
 * (Hammerhead or higher). Membership comes from guild_roster, so a former
 * exec keeps nothing once their uuid leaves the in-game guild -- rank alone
 * was the whole check before TAQ-76.
 */
export async function checkDiscordLinkRank(discordId: string): Promise<RankCheckResult> {
  return rankCheckFromLookup(discordId, await lookupLinkedMember(discordId));
}

/**
 * Check if a Discord user is a current guild member (any rank).
 * Returns user data with role derived from rank.
 */
export async function checkDiscordLink(discordId: string): Promise<GuildMemberCheckResult> {
  return memberCheckFromLookup(discordId, await lookupLinkedMember(discordId));
}

/**
 * Guard for any guild member (exec or regular).
 * Verifies session cookie, re-checks discord_links and guild membership.
 */
export async function requireGuildSession(request: NextRequest): Promise<ExecSessionData | null> {
  const session = getExecSession(request);
  if (!session) return null;

  const [linkCheck, inGuild] = await Promise.all([
    checkDiscordLink(session.discord_id),
    checkGuildMembership(session.uuid),
  ]);
  if (!linkCheck.ok) return null;
  if (!inGuild) return null;

  return { ...session, role: linkCheck.role, rank: linkCheck.rank, ign: linkCheck.ign };
}

// Membership answers change at most when the guild roster syncs, so a short
// in-process cache collapses the burst of concurrent session checks a single
// page load produces (profile fires 4-5 authenticated requests at once).
const MEMBERSHIP_CACHE_TTL_MS = 60 * 1000;
const membershipCache = new Map<string, { inGuild: boolean; expires: number }>();

/**
 * Is this uuid on the in-game roster right now? guild_roster is kept in step
 * with the Wynncraft API by the bot (TAQ-76); one indexed probe replaces the
 * old jsonb scan over the cached guildData blob.
 */
export async function checkGuildMembership(uuid: string): Promise<boolean> {
  const normalizedUuid = uuid.replace(/-/g, '');

  const cached = membershipCache.get(normalizedUuid);
  if (cached && cached.expires > Date.now()) {
    return cached.inGuild;
  }

  try {
    const { getPool } = await import('@/lib/db');
    const pool = getPool();

    const result = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM guild_roster WHERE uuid = $1::uuid) AS in_guild`,
      [uuid]
    );
    const inGuild = result.rows[0]?.in_guild === true;

    membershipCache.set(normalizedUuid, { inGuild, expires: Date.now() + MEMBERSHIP_CACHE_TTL_MS });
    return inGuild;
  } catch {
    return false;
  }
}
