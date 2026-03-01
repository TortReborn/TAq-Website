import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// --- Exec session cookie management ---

export interface ExecSessionData {
  discord_id: string;
  discord_username: string;
  discord_avatar: string;
  uuid: string;
  ign: string;
  rank: string;
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

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function setExecSessionCookie(
  response: NextResponse,
  user: { discord_id: string; discord_username: string; discord_avatar: string; uuid: string; ign: string; rank: string }
): void {
  const secret = getSecret();

  const sessionData: ExecSessionData = {
    discord_id: user.discord_id,
    discord_username: user.discord_username,
    discord_avatar: user.discord_avatar,
    uuid: user.uuid,
    ign: user.ign,
    rank: user.rank,
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
 * Verifies the session cookie, then re-checks the user's rank from
 * discord_links to ensure they haven't been demoted since login.
 * Returns the session data or null. If null, the caller should return a 401 response.
 */
export async function requireExecSession(request: NextRequest): Promise<ExecSessionData | null> {
  const session = getExecSession(request);
  if (!session) return null;

  // Re-verify rank from database on every request
  const linkData = await checkDiscordLinkRank(session.discord_id);
  if (!linkData) return null;

  return session;
}

/**
 * Generate a random state parameter for OAuth2 CSRF protection.
 */
export function generateOAuthState(): string {
  return randomBytes(32).toString('hex');
}

export function getBaseUrl(): string {
  return pickEnv('NEXT_PUBLIC_BASE_URL', 'TEST_NEXT_PUBLIC_BASE_URL') || 'http://localhost:3000';
}

// --- Discord OAuth2 configuration ---

const DISCORD_API_BASE = 'https://discord.com/api/v10';

// Ranks that are allowed to access the exec dashboard (Hammerhead or higher)
const ALLOWED_RANKS = ['Hammerhead', 'Sailfish', 'Dolphin', 'Trial-Narwhal', 'Narwhal', '✫✪✫ Hydra - Leader'];

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

/**
 * Check if a Discord user has a qualifying rank in discord_links (Hammerhead or higher).
 * Returns the user's row data if authorized, or null if not.
 */
export async function checkDiscordLinkRank(discordId: string): Promise<{ uuid: string; ign: string; rank: string } | null> {
  const { getPool } = await import('@/lib/db');
  const pool = getPool();

  const result = await pool.query(
    `SELECT uuid, ign, rank FROM discord_links WHERE discord_id = $1`,
    [discordId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  if (!ALLOWED_RANKS.includes(row.rank)) return null;

  return { uuid: row.uuid, ign: row.ign, rank: row.rank };
}

/**
 * Check if a UUID is currently a member of the guild using cached guildData from cache_entries.
 */
export async function checkGuildMembership(uuid: string): Promise<boolean> {
  try {
    const { getPool } = await import('@/lib/db');
    const pool = getPool();

    const result = await pool.query(
      `SELECT data FROM cache_entries WHERE cache_key = 'guildData'`
    );

    if (result.rows.length === 0) {
      return false;
    }

    const guildData = result.rows[0].data;
    const members = guildData?.members;
    if (!members) return false;

    const normalizedUuid = uuid.replace(/-/g, '');

    if (Array.isArray(members)) {
      // New format: flat array with uuid field on each member
      return members.some((m: any) =>
        m.uuid && m.uuid.replace(/-/g, '') === normalizedUuid
      );
    }

    // Old format: members organized by rank groups { owner: { username: { uuid, ... } }, ... }
    for (const [key, rankGroup] of Object.entries(members)) {
      if (typeof rankGroup !== 'object' || rankGroup === null) continue;
      for (const memberData of Object.values(rankGroup as Record<string, any>)) {
        if (memberData?.uuid && memberData.uuid.replace(/-/g, '') === normalizedUuid) return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
