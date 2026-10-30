import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getRevision } from '@/lib/bot-panels-db';

export const dynamic = 'force-dynamic';

// GET — one revision's full content (history view, diff, revert)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; rev: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug, rev } = await params;
  const revNumber = parseInt(rev, 10);
  if (isNaN(revNumber)) return NextResponse.json({ error: 'Invalid revision' }, { status: 400 });

  try {
    const revision = await getRevision(slug, revNumber);
    if (!revision) return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
    return NextResponse.json(revision);
  } catch (error) {
    console.error('Bot panel revision fetch error:', error);
    return NextResponse.json({ error: 'Failed to load revision' }, { status: 500 });
  }
}
