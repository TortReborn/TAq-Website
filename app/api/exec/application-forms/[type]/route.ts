import { NextRequest, NextResponse } from 'next/server';
import { isNarwhalRank, requireExecSession, requireNarwhalSession } from '@/lib/exec-auth';
import { FORM_TYPES, defaultForm, normalizeForm, type FormType } from '@/lib/application-questions';
import { FormConflict, getFormRevisions, getLiveForm, saveFormRevision } from '@/lib/application-forms-db';

export const dynamic = 'force-dynamic';

const NOTE_MAX = 200;

async function formType(params: Promise<{ type: string }>): Promise<FormType | null> {
  const { type } = await params;
  return (FORM_TYPES as string[]).includes(type) ? type as FormType : null;
}

// GET — the live form, its history, and the defaults (TAQ-217)
export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const type = await formType(params);
  if (!type) return NextResponse.json({ error: 'No such form' }, { status: 404 });

  try {
    const [live, revisions] = await Promise.all([getLiveForm(type), getFormRevisions(type)]);
    return NextResponse.json({
      live, revisions, defaults: defaultForm(type), can_edit: isNarwhalRank(session.rank),
    });
  } catch (error) {
    console.error('Application form fetch error:', error);
    return NextResponse.json({ error: 'Failed to load the form' }, { status: 500 });
  }
}

// POST — save a revision; applicants see it on their next page load
export async function POST(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const session = await requireNarwhalSession(request);
  if (!session) return NextResponse.json({ error: 'Narwhal access required.' }, { status: 403 });
  const type = await formType(params);
  if (!type) return NextResponse.json({ error: 'No such form' }, { status: 404 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { content, errors } = normalizeForm(type, body?.content);
  if (!content) return NextResponse.json({ error: 'The form has problems.', errors }, { status: 400 });

  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (note.length > NOTE_MAX) return NextResponse.json({ error: `The note is longer than ${NOTE_MAX} characters.` }, { status: 400 });
  const baseRev = Number.isInteger(body?.base_rev) ? body.base_rev as number : null;
  const restoredFrom = Number.isInteger(body?.restored_from) ? body.restored_from as number : null;

  try {
    const rev = await saveFormRevision(type, {
      content, baseRev, note, restoredFrom,
      authorId: session.discord_id, authorName: session.ign || session.discord_username,
    });
    return NextResponse.json({ rev_number: rev }, { status: 201 });
  } catch (error) {
    if (error instanceof FormConflict) {
      return NextResponse.json({
        error: `${error.latestAuthor ?? 'Someone'} saved this form while you were editing (now rev ${error.latestRev}). Reload to see their change, then make yours again.`,
      }, { status: 409 });
    }
    console.error('Application form save error:', error);
    return NextResponse.json({ error: 'Failed to save the form' }, { status: 500 });
  }
}
