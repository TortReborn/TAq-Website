import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireGuildSession } from '@/lib/exec-auth';
import { getGuildPrefixes } from '@/lib/exchange-data';
import {
  CHRONICLE_LIMITS,
  validateAlliancePayload,
  validateEventPayload,
} from '@/lib/chronicle';
import { approvedAllianceNames, countPendingBy, createSubmission, targetExists } from '@/lib/chronicle-db';

export const dynamic = 'force-dynamic';

/**
 * Propose a new alliance/event, or an edit to an existing one.
 * Requires a linked guild account (any rank); an exec must approve the
 * submission before it appears on the map.
 */
export async function POST(request: NextRequest) {
  const session = await requireGuildSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Sign in with a linked guild account to submit' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const kind = b.kind === 'alliance' || b.kind === 'event' ? b.kind : null;
  if (!kind) return NextResponse.json({ error: 'kind must be "alliance" or "event"' }, { status: 400 });

  const targetId =
    b.targetId === null || b.targetId === undefined
      ? null
      : Number.isInteger(b.targetId) && (b.targetId as number) > 0
        ? (b.targetId as number)
        : NaN;
  if (Number.isNaN(targetId)) return NextResponse.json({ error: 'Invalid targetId' }, { status: 400 });

  const note = typeof b.note === 'string' ? b.note.slice(0, CHRONICLE_LIMITS.noteMax).trim() : '';

  // Shape validation
  const validated = kind === 'alliance' ? validateAlliancePayload(b.payload) : validateEventPayload(b.payload);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const pool = getPool();

  // Guild names must be real guilds from the prefix table — the same source
  // the map's autocomplete uses, so honest submissions always pass
  const knownGuilds = await getGuildPrefixes(pool);
  const guildNames = kind === 'alliance'
    ? (validated.value as { memberships: { guild: string }[] }).memberships.map(m => m.guild)
    : (validated.value as { guilds: string[] }).guilds;
  for (const guild of guildNames) {
    if (!knownGuilds.has(guild)) {
      return NextResponse.json({ error: `Unknown guild: "${guild}"` }, { status: 400 });
    }
  }

  // Alliance participants must reference approved alliances
  if (kind === 'event') {
    const eventAlliances = (validated.value as { alliances: string[] }).alliances;
    if (eventAlliances.length > 0) {
      const known = await approvedAllianceNames(pool);
      for (const name of eventAlliances) {
        if (!known.has(name)) {
          return NextResponse.json({ error: `Unknown alliance: "${name}"` }, { status: 400 });
        }
      }
    }
  }

  // Edits must reference a real entity
  if (targetId !== null && !(await targetExists(pool, kind, targetId))) {
    return NextResponse.json({ error: 'The entry being edited no longer exists' }, { status: 400 });
  }

  // Per-user pending cap
  const pending = await countPendingBy(pool, session.discord_id);
  if (pending >= CHRONICLE_LIMITS.pendingPerUser) {
    return NextResponse.json(
      { error: `You already have ${pending} submissions awaiting review — please wait for those first` },
      { status: 429 },
    );
  }

  try {
    const id = await createSubmission(pool, {
      kind,
      targetId,
      payload: validated.value,
      note,
      submittedBy: session.discord_id,
      submittedName: session.ign || session.discord_username,
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error('[api:chronicle/submit] failed:', error);
    return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 });
  }
}
