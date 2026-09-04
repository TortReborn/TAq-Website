import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { resolveWikiPrincipal } from '@/lib/wiki-auth';
import { getWikiPage, validateWikiPage, withdrawWikiValidation } from '@/lib/wiki-db';

export const dynamic = 'force-dynamic';

/**
 * Vouch for a page: "I have read this and it matches what I know."
 *
 * Restricted to people with review rights, because a vouch is the thing that
 * clears the unverified banner — if anyone signed in could press it, the banner
 * would mean nothing. Two vouches are needed, so no one can clear a page alone.
 * Vouches attach to the revision on display, so a later AI edit re-flags the
 * page rather than inheriting approval it never earned.
 */
export async function POST(request: NextRequest) {
  const principal = await resolveWikiPrincipal(request);
  if (!principal || !principal.canReview) {
    return NextResponse.json({ error: 'Chronicler or exec access required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const slug = typeof b.slug === 'string' ? b.slug.trim() : '';
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  try {
    const pool = getPool();
    const found = await getWikiPage(pool, slug);
    if (!found) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

    const result = await validateWikiPage(pool, found.page.id, {
      discordId: principal.discordId,
      name: principal.name,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true, verification: result.verification });
  } catch (error) {
    console.error('[api:wiki/validate] failed:', error);
    return NextResponse.json({ error: 'Failed to record validation' }, { status: 500 });
  }
}

/** Withdraw your own vouch — for when a second read changes your mind. */
export async function DELETE(request: NextRequest) {
  const principal = await resolveWikiPrincipal(request);
  if (!principal || !principal.canReview) {
    return NextResponse.json({ error: 'Chronicler or exec access required' }, { status: 401 });
  }
  const slug = request.nextUrl.searchParams.get('slug') ?? '';
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  try {
    const pool = getPool();
    const found = await getWikiPage(pool, slug);
    if (!found) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    await withdrawWikiValidation(pool, found.page.id, principal.discordId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api:wiki/validate] withdraw failed:', error);
    return NextResponse.json({ error: 'Failed to withdraw validation' }, { status: 500 });
  }
}
