import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { createRevision, getPanel, PanelArchived, RevisionConflict } from '@/lib/bot-panels-db';

export const dynamic = 'force-dynamic';

const SLUG = 'shell-exchange';

// POST — redraw the rate images: queue a copy of the panel's latest revision.
// Open to every exec, unlike editing a panel: the content comes from the
// database, so this can only re-send what a Narwhal last published.
// rev_number is null when the panel was never posted.
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const detail = await getPanel(SLUG);
    if (!detail) return NextResponse.json({ error: 'The shell exchange panel was not found' }, { status: 404 });
    const { panel, latest } = detail;
    if (!latest) {
      return NextResponse.json({ error: 'The shell exchange panel has no content yet. Set it up under Bot Messages first.' }, { status: 400 });
    }
    if (!panel.message_ids.length) return NextResponse.json({ rev_number: null });

    const rev = await createRevision(SLUG, {
      content: latest.content,
      channelId: latest.channel_id ?? panel.channel_id,
      adoptMessageIds: null,
      note: 'Rates update',
      restoredFrom: null,
      baseRev: latest.rev_number,
      force: false,
      authorId: session.discord_id,
      authorName: session.ign || session.discord_username,
    });
    if (rev === null) return NextResponse.json({ error: 'The shell exchange panel was not found' }, { status: 404 });
    return NextResponse.json({ rev_number: rev }, { status: 201 });
  } catch (error) {
    if (error instanceof PanelArchived || error instanceof RevisionConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Shell exchange publish error:', error);
    return NextResponse.json({ error: 'Failed to publish the shell exchange panel' }, { status: 500 });
  }
}
