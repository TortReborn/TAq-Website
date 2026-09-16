/**
 * Signed links to a member's composited uniform skin (TAQ-89).
 *
 * The composite is served off a cookie-less route so the link survives being
 * pasted around. A signed, expiring token keeps that route from being a free
 * skin-compositing service for arbitrary uuids: only the profile page, which
 * knows the session's uuid, can mint one.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { getSessionSecret } from '@/lib/exec-auth';
import type { ArmModel, UniformVariant } from '@/lib/uniform';
import { isUniformVariant } from '@/lib/uniform';

export interface UniformTokenPayload {
  /** undashed uuid */
  u: string;
  v: UniformVariant;
  /** arm model override; absent means "whatever Mojang says" */
  m?: ArmModel;
  /** unix seconds */
  exp: number;
}

export const UNIFORM_TOKEN_TTL_S = 24 * 60 * 60;

function sign(payloadB64: string): string {
  return createHmac('sha256', getSessionSecret()).update(`uniform-link:${payloadB64}`).digest('base64url');
}

export function mintUniformToken(payload: Omit<UniformTokenPayload, 'exp'>, nowS = Math.floor(Date.now() / 1000)): string {
  const full: UniformTokenPayload = { ...payload, exp: nowS + UNIFORM_TOKEN_TTL_S };
  const b64 = Buffer.from(JSON.stringify(full)).toString('base64url');
  return `${b64}.${sign(b64)}`;
}

export function verifyUniformToken(token: string, nowS = Math.floor(Date.now() / 1000)): UniformTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;

  const expected = Buffer.from(sign(b64));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let payload: UniformTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.u !== 'string' || !/^[0-9a-f]{32}$/.test(payload.u)) return null;
  if (!isUniformVariant(payload.v)) return null;
  if (payload.m !== undefined && payload.m !== 'slim' && payload.m !== 'classic') return null;
  if (typeof payload.exp !== 'number' || payload.exp < nowS) return null;
  return payload;
}
