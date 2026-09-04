import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireGuildSession } from '@/lib/exec-auth';
import { requireWikiEditor } from '@/lib/wiki-auth';
import { WIKI_LIMITS, validateWikiPagePayload } from '@/lib/wiki';
import { createWikiPage, editWikiPage, setWikiPageStatus } from '@/lib/wiki-db';

export const dynamic = 'force-dynamic';

/**
 * Create or edit a wiki page directly. Open to execs and to chroniclers, who
 * may be outside the guild entirely. Every change is stored as a full revision
 * with author + edit note (the revision log is the audit trail, mirroring the
 * map chronicle's direct-edit convention).
 */
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

  const targetId =
    b.targetId === null || b.targetId === undefined
      ? null
      : Number.isInteger(b.targetId) && (b.targetId as number) > 0
        ? (b.targetId as number)
        : NaN;
  if (Number.isNaN(targetId)) return NextResponse.json({ error: 'Invalid targetId' }, { status: 400 });

  const note = typeof b.note === 'string' ? b.note.slice(0, WIKI_LIMITS.noteMax).trim() : '';
  const validated = validateWikiPagePayload(b.payload);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  // Anything typed into the editor is a human revision by definition, and that
  // is exactly what clears a page's unverified banner.
  const author = { id: principal.discordId, name: principal.name, kind: 'human' as const };
  try {
    if (targetId === null) {
      const result = await createWikiPage(getPool(), validated.value, author, note);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
      return NextResponse.json({ ok: true, slug: validated.value.slug });
    }
    const result = await editWikiPage(getPool(), targetId, validated.value, author, note || 'Edited');
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true, slug: result.slug });
  } catch (error) {
    console.error('[api:wiki/admin] failed:', error);
    return NextResponse.json({ error: 'Failed to save page' }, { status: 500 });
  }
}

/** Exec-only: change a page's status (publish / draft / archive). */
export async function PATCH(request: NextRequest) {
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
  const pageId = Number.isInteger(b.pageId) && (b.pageId as number) > 0 ? (b.pageId as number) : null;
  const status = b.status === 'published' || b.status === 'draft' || b.status === 'archived' ? b.status : null;
  if (!pageId || !status) return NextResponse.json({ error: 'pageId and status required' }, { status: 400 });
  try {
    const ok = await setWikiPageStatus(getPool(), pageId, status);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'Page not found' }, { status: 404 });
  } catch (error) {
    console.error('[api:wiki/admin] status change failed:', error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
