import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireWikiAdmin, resolveWikiPrincipal } from '@/lib/wiki-auth';
import { addChronicler, deactivateChronicler, listChroniclers } from '@/lib/wiki-db';

export const dynamic = 'force-dynamic';

/** Discord snowflakes: 17–20 digits today, with headroom. */
const SNOWFLAKE_RE = /^\d{15,25}$/;

/**
 * The chronicler roster. Reading it needs review rights (chroniclers should see
 * who else is trusted); changing it is exec-only, so the trusted set can only
 * be widened by the guild and never by chroniclers appointing each other.
 */
export async function GET(request: NextRequest) {
  const principal = await resolveWikiPrincipal(request);
  if (!principal || !principal.canReview) {
    return NextResponse.json({ error: 'Chronicler or exec access required' }, { status: 401 });
  }
  try {
    const chroniclers = await listChroniclers(getPool(), principal.canManageChroniclers);
    return NextResponse.json({ chroniclers, canManage: principal.canManageChroniclers });
  } catch (error) {
    console.error('[api:wiki/chroniclers] list failed:', error);
    return NextResponse.json({ error: 'Failed to load chroniclers' }, { status: 500 });
  }
}

/** Exec-only: designate a Discord user as a chronicler. */
export async function POST(request: NextRequest) {
  const principal = await requireWikiAdmin(request);
  if (!principal) {
    return NextResponse.json({ error: 'Exec access required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const discordId = typeof b.discordId === 'string' ? b.discordId.trim() : '';
  if (!SNOWFLAKE_RE.test(discordId)) {
    return NextResponse.json(
      { error: 'A numeric Discord user ID is required (enable Developer Mode in Discord, then right-click the user and Copy User ID)' },
      { status: 400 },
    );
  }
  const displayName = typeof b.displayName === 'string' ? b.displayName.slice(0, 60).trim() : '';
  const note = typeof b.note === 'string' ? b.note.slice(0, 200).trim() : '';

  try {
    await addChronicler(getPool(), {
      discordId,
      displayName,
      note,
      addedBy: principal.name,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api:wiki/chroniclers] add failed:', error);
    return NextResponse.json({ error: 'Failed to add chronicler' }, { status: 500 });
  }
}

/**
 * Exec-only: revoke. Soft — their past revisions and vouches stay attributed,
 * because removing someone should not quietly rewrite who checked what.
 */
export async function DELETE(request: NextRequest) {
  const principal = await requireWikiAdmin(request);
  if (!principal) {
    return NextResponse.json({ error: 'Exec access required' }, { status: 401 });
  }
  const discordId = request.nextUrl.searchParams.get('discordId') ?? '';
  if (!SNOWFLAKE_RE.test(discordId)) {
    return NextResponse.json({ error: 'discordId required' }, { status: 400 });
  }
  try {
    await deactivateChronicler(getPool(), discordId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api:wiki/chroniclers] remove failed:', error);
    return NextResponse.json({ error: 'Failed to remove chronicler' }, { status: 500 });
  }
}
