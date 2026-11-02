import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { setPanelArchived } from '@/lib/bot-panels-db';

export const dynamic = 'force-dynamic';

// POST { archived: boolean } — move a panel into the Archive or back out (TAQ-144)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body?.archived !== 'boolean') return NextResponse.json({ error: 'archived must be true or false' }, { status: 400 });

  try {
    const result = await setPanelArchived(slug, body.archived, session.ign || session.discord_username);
    if (result === 'missing') return NextResponse.json({ error: 'Panel not found' }, { status: 404 });
    if (result === 'template') {
      return NextResponse.json({ error: 'The bot sends this template to every new member, so it can\'t be archived.' }, { status: 400 });
    }
    return NextResponse.json({ archived: body.archived });
  } catch (error) {
    console.error('Bot panel archive error:', error);
    return NextResponse.json({ error: 'Failed to update the panel' }, { status: 500 });
  }
}
