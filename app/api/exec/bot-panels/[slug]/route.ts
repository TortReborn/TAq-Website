import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { LIMITS, normalizeContent, parseMessageLink } from '@/lib/bot-panels';
import { createRevision, getPanel, getRegistry, messageOwner, RevisionConflict } from '@/lib/bot-panels-db';
import { getPanelValues } from '@/lib/panel-values-db';

export const dynamic = 'force-dynamic';

const SNOWFLAKE_RE = /^\d{15,22}$/;

// GET — the panel, its latest content, its history, and the bot's registry
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;
  try {
    const [detail, registry, values] = await Promise.all([getPanel(slug), getRegistry(), getPanelValues()]);
    if (!detail) return NextResponse.json({ error: 'Panel not found' }, { status: 404 });
    return NextResponse.json({ ...detail, registry, values });
  } catch (error) {
    console.error('Bot panel fetch error:', error);
    return NextResponse.json({ error: 'Failed to load panel' }, { status: 500 });
  }
}

// POST — save a new revision; the bot publishes it within a few seconds
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

  let registry;
  try {
    registry = await getRegistry();
  } catch (error) {
    console.error('Bot panel registry fetch error:', error);
    return NextResponse.json({ error: 'Failed to load the bot registry' }, { status: 500 });
  }

  const { content, errors } = normalizeContent(body?.content, {
    actionKeys: registry ? new Set(registry.actions.map(a => a.key)) : undefined,
    roles: registry ? new Map(registry.roles.map(r => [r.id, r])) : undefined,
  });
  if (!content) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

  let channelId = typeof body?.channel_id === 'string' ? body.channel_id.trim() : '';

  // Taking over messages that are already in Discord (posted by /generate)
  let adoptMessageIds: string[] | null = null;
  const adoptLinks: unknown[] = Array.isArray(body?.adopt_links) ? body.adopt_links.filter((l: unknown) => typeof l === 'string' && l.trim()) : [];
  if (adoptLinks.length) {
    if (adoptLinks.length > LIMITS.messages) {
      return NextResponse.json({ error: `Link at most ${LIMITS.messages} messages` }, { status: 400 });
    }
    const parsed = adoptLinks.map(l => parseMessageLink(l as string));
    if (parsed.some(p => !p)) {
      return NextResponse.json({ error: 'Each linked message must be a Discord message link (Copy Message Link)' }, { status: 400 });
    }
    const channels = new Set(parsed.map(p => p!.channelId));
    if (channels.size > 1) {
      return NextResponse.json({ error: 'All linked messages must be in the same channel' }, { status: 400 });
    }
    const [linkChannel] = channels;
    if (channelId && channelId !== linkChannel) {
      return NextResponse.json({ error: 'The linked messages are in a different channel than the one picked' }, { status: 400 });
    }
    if (registry?.guild && parsed.some(p => p!.guildId !== registry.guild!.id)) {
      return NextResponse.json({ error: `Linked messages must be in ${registry.guild.name}` }, { status: 400 });
    }
    channelId = linkChannel;
    adoptMessageIds = parsed.map(p => p!.messageId);
    // Two panels editing one message would overwrite each other on every publish.
    const owner = await messageOwner(slug, adoptMessageIds);
    if (owner) {
      return NextResponse.json({ error: `That message already belongs to the "${owner.name}" panel. Edit it there instead.` }, { status: 409 });
    }
  }

  if (!SNOWFLAKE_RE.test(channelId)) {
    return NextResponse.json({ error: 'Pick a channel for this panel' }, { status: 400 });
  }

  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, LIMITS.note) : '';
  const restoredFrom = Number.isInteger(body?.restored_from) ? body.restored_from : null;
  const baseRev = Number.isInteger(body?.base_rev) ? body.base_rev : null;
  const name = typeof body?.name === 'string' && body.name.trim() && body.name.trim().length <= 100 ? body.name.trim() : undefined;

  try {
    const rev = await createRevision(slug, {
      content, channelId, adoptMessageIds, note, restoredFrom, baseRev,
      force: body?.force === true,
      authorId: session.discord_id,
      authorName: session.ign || session.discord_username,
      name,
    });
    if (rev === null) return NextResponse.json({ error: 'Panel not found' }, { status: 404 });
    return NextResponse.json({ rev_number: rev }, { status: 201 });
  } catch (error) {
    if (error instanceof RevisionConflict) {
      return NextResponse.json(
        { error: error.message, conflict: { latest_rev: error.latestRev, latest_author: error.latestAuthor } },
        { status: 409 },
      );
    }
    console.error('Bot panel save error:', error);
    return NextResponse.json({ error: 'Failed to save revision' }, { status: 500 });
  }
}
