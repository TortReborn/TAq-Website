import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { resolveWikiPrincipal } from '@/lib/wiki-auth';
import { WIKI_LIMITS, WIKI_PENDING_PER_USER, validateWikiPagePayload } from '@/lib/wiki';
import { countPendingWikiBy, createWikiSubmission, getWikiPage } from '@/lib/wiki-db';

export const dynamic = 'force-dynamic';

/**
 * Any signed-in Discord account can suggest a new page or an edit; suggestions
 * go to the review queue and nothing here publishes.
 *
 * Deliberately not `requireGuildSession`: the people who remember this history
 * are often not in the guild, and a suggestion is the one contribution that is
 * safe to accept from a stranger, because a reviewer reads every one of them
 * before it becomes an article. The per-user pending cap below is what keeps
 * that open door from being a flood.
 */
export async function POST(request: NextRequest) {
  const principal = await resolveWikiPrincipal(request);
  if (!principal) {
    return NextResponse.json({ error: 'Sign in with Discord to suggest an edit' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const targetPageId =
    b.targetId === null || b.targetId === undefined
      ? null
      : Number.isInteger(b.targetId) && (b.targetId as number) > 0
        ? (b.targetId as number)
        : NaN;
  if (Number.isNaN(targetPageId)) return NextResponse.json({ error: 'Invalid targetId' }, { status: 400 });

  const note = typeof b.note === 'string' ? b.note.slice(0, WIKI_LIMITS.noteMax).trim() : '';
  const validated = validateWikiPagePayload(b.payload);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const pool = getPool();
  const pending = await countPendingWikiBy(pool, principal.discordId);
  if (pending >= WIKI_PENDING_PER_USER) {
    return NextResponse.json(
      { error: `You already have ${pending} pending suggestions — wait for review before submitting more` },
      { status: 429 },
    );
  }

  if (targetPageId === null) {
    const clash = await getWikiPage(pool, validated.value.slug);
    if (clash) return NextResponse.json({ error: `A page already exists at "${validated.value.slug}" — suggest an edit to it instead` }, { status: 409 });
  }

  try {
    const id = await createWikiSubmission(pool, {
      targetPageId,
      payload: validated.value,
      note,
      submittedBy: principal.discordId,
      submittedName: principal.name,
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error('[api:wiki/suggest] failed:', error);
    return NextResponse.json({ error: 'Failed to submit suggestion' }, { status: 500 });
  }
}
