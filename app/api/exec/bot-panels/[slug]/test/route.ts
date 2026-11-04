import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { normalizeContent } from '@/lib/bot-panels';
import { getPanelTemplate, getTemplateTest, requestTemplateTest } from '@/lib/bot-panels-db';

export const dynamic = 'force-dynamic';

// GET — how the caller's last test send of this template went
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;
  try {
    const test = await getTemplateTest(session.discord_id);
    return NextResponse.json({ test: test?.slug === slug ? test : null });
  } catch (error) {
    console.error('Template test fetch error:', error);
    return NextResponse.json({ error: 'Failed to load the test send' }, { status: 500 });
  }
}

// POST — ask the bot to DM the caller this draft of a template, filled in as
// if they were the new member (TAQ-142)
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

  try {
    const template = await getPanelTemplate(slug);
    if (template === undefined) return NextResponse.json({ error: 'Panel not found' }, { status: 404 });
    if (!template) return NextResponse.json({ error: 'Only templates can be sent as a test' }, { status: 400 });

    const { content, errors } = normalizeContent(body?.content, { template: true });
    if (!content) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

    await requestTemplateTest(session.discord_id, { slug, content, ign: session.ign || session.discord_username });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    console.error('Template test request error:', error);
    return NextResponse.json({ error: 'Failed to request the test send' }, { status: 500 });
  }
}
