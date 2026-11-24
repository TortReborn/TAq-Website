import { NextRequest, NextResponse } from 'next/server';
import { isNarwhalRank, requireExecSession } from '@/lib/exec-auth';
import { listFormSummaries } from '@/lib/application-forms-db';

export const dynamic = 'force-dynamic';

// GET — the newest revision of each application form, for the Bot Messages list (TAQ-217)
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const forms = await listFormSummaries();
    return NextResponse.json({ forms, can_edit: isNarwhalRank(session.rank) });
  } catch (error) {
    console.error('Application forms list error:', error);
    return NextResponse.json({ error: 'Failed to load application forms' }, { status: 500 });
  }
}
