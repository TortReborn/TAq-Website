import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireGuildSession } from '@/lib/exec-auth';
import { getGuildPrefixes } from '@/lib/exchange-data';
import {
  CHRONICLE_LIMITS,
  validateAlliancePayload,
  validateEventPayload,
} from '@/lib/chronicle';
import { approvedAllianceNames, createSubmission, deleteChronicleEntity, reviewSubmission, targetExists } from '@/lib/chronicle-db';

export const dynamic = 'force-dynamic';

/**
 * Exec-only: create or edit an alliance/event directly, skipping the review
 * queue. The change is still recorded as a submission (immediately approved)
 * so the audit trail stays complete.
 */
export async function POST(request: NextRequest) {
  const session = await requireGuildSession(request);
  if (!session || session.role !== 'exec') {
    return NextResponse.json({ error: 'Exec access required' }, { status: 401 });
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

  const validated = kind === 'alliance' ? validateAlliancePayload(b.payload) : validateEventPayload(b.payload);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const pool = getPool();

  const knownGuilds = await getGuildPrefixes(pool);
  const guildNames = kind === 'alliance'
    ? (validated.value as { memberships: { guild: string }[] }).memberships.map(m => m.guild)
    : (validated.value as { guilds: string[] }).guilds;
  for (const guild of guildNames) {
    if (!knownGuilds.has(guild)) {
      return NextResponse.json({ error: `Unknown guild: "${guild}"` }, { status: 400 });
    }
  }

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

  if (targetId !== null && !(await targetExists(pool, kind, targetId))) {
    return NextResponse.json({ error: 'The entry being edited no longer exists' }, { status: 400 });
  }

  try {
    const reviewer = session.ign || session.discord_username;
    const id = await createSubmission(pool, {
      kind,
      targetId,
      payload: validated.value,
      note,
      submittedBy: session.discord_id,
      submittedName: reviewer,
    });
    const result = await reviewSubmission(pool, {
      id,
      approve: true,
      reviewedBy: reviewer,
      reviewNote: 'direct exec edit',
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error('[api:chronicle/admin] failed:', error);
    return NextResponse.json({ error: 'Failed to apply change' }, { status: 500 });
  }
}

/**
 * Exec-only: delete a published alliance or event. The removed entity's final
 * state is snapshotted into the decision log.
 */
export async function DELETE(request: NextRequest) {
  const session = await requireGuildSession(request);
  if (!session || session.role !== 'exec') {
    return NextResponse.json({ error: 'Exec access required' }, { status: 401 });
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
  const id = Number.isInteger(b.targetId) && (b.targetId as number) > 0 ? (b.targetId as number) : null;
  if (!id) return NextResponse.json({ error: 'Invalid targetId' }, { status: 400 });

  try {
    const result = await deleteChronicleEntity(getPool(), {
      kind,
      id,
      deletedBy: session.discord_id,
      deletedName: session.ign || session.discord_username,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api:chronicle/admin] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
