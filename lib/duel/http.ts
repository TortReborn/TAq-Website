// Route plumbing shared by /api/duels/*: the session-to-player mapping, one
// transaction per request, and a single place that turns store errors into
// status codes.

import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import { requireGuildSession, type ExecSessionData } from '@/lib/exec-auth';
import { DuelInputError, StaleVersionError, type Me } from './store';

export function meFrom(session: ExecSessionData): Me {
  return { discordId: session.discord_id, ign: session.ign, uuid: session.uuid.replace(/-/g, '') };
}

export async function requirePlayer(request: NextRequest): Promise<Me | null> {
  const session = await requireGuildSession(request);
  return session ? meFrom(session) : null;
}

export const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

export async function readJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

export async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export function errorResponse(e: unknown, what: string): NextResponse {
  if (e instanceof DuelInputError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof StaleVersionError) return NextResponse.json({ error: e.message, stale: true }, { status: 409 });
  console.error(`Duel ${what} error:`, e);
  return NextResponse.json({ error: `Failed to ${what}` }, { status: 500 });
}
