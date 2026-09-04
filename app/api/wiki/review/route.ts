import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireWikiEditor } from '@/lib/wiki-auth';
import { WIKI_LIMITS } from '@/lib/wiki';
import { getWikiPage, listWikiSubmissions, reviewWikiSubmission } from '@/lib/wiki-db';

export const dynamic = 'force-dynamic';

/** Chronicler or exec: the pending suggestion queue (with current page bodies for diffing). */
export async function GET(request: NextRequest) {
  const principal = await requireWikiEditor(request);
  if (!principal) {
    return NextResponse.json({ error: 'Chronicler or exec access required' }, { status: 401 });
  }
  try {
    const pool = getPool();
    const status = request.nextUrl.searchParams.get('status') ?? 'pending';
    const submissions = await listWikiSubmissions(pool, status === 'all' ? undefined : status);
    // Attach current page state for edit suggestions so the client can diff
    const withCurrent = await Promise.all(submissions.map(async (s) => {
      if (s.targetPageId === null) return { ...s, current: null };
      const pageRes = await pool.query(`SELECT slug, title, summary, infobox, body FROM wiki_pages WHERE id = $1`, [s.targetPageId]);
      return { ...s, current: pageRes.rows[0] ?? null };
    }));
    return NextResponse.json({ submissions: withCurrent });
  } catch (error) {
    console.error('[api:wiki/review] list failed:', error);
    return NextResponse.json({ error: 'Failed to load queue' }, { status: 500 });
  }
}

/** Chronicler or exec: approve or reject a suggestion. */
export async function POST(request: NextRequest) {
  const principal = await requireWikiEditor(request);
  if (!principal) {
    return NextResponse.json({ error: 'Chronicler or exec access required' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const id = Number.isInteger(b.id) && (b.id as number) > 0 ? (b.id as number) : null;
  if (!id || typeof b.approve !== 'boolean') {
    return NextResponse.json({ error: 'id and approve required' }, { status: 400 });
  }
  const reviewNote = typeof b.note === 'string' ? b.note.slice(0, WIKI_LIMITS.noteMax).trim() : '';
  try {
    const result = await reviewWikiSubmission(getPool(), {
      id,
      approve: b.approve,
      reviewedBy: principal.name,
      reviewNote,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true, slug: result.slug });
  } catch (error) {
    console.error('[api:wiki/review] decide failed:', error);
    return NextResponse.json({ error: 'Failed to review' }, { status: 500 });
  }
}

// getWikiPage imported for type parity with suggest route; avoids unused warn
void getWikiPage;
