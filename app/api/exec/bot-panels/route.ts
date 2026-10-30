import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { SLUG_RE } from '@/lib/bot-panels';
import { createPanel, getRegistry, listPanels } from '@/lib/bot-panels-db';

export const dynamic = 'force-dynamic';

// GET — every panel with its latest revision's state, plus the bot's registry
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [panels, registry] = await Promise.all([listPanels(), getRegistry()]);
    return NextResponse.json({ panels, registry });
  } catch (error) {
    console.error('Bot panels list error:', error);
    return NextResponse.json({ error: 'Failed to load bot panels' }, { status: 500 });
  }
}

// POST — create an empty panel; its first revision comes from the editor
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'Slug must be 3-48 lowercase letters, numbers or dashes' }, { status: 400 });
  }
  if (!name || name.length > 100) {
    return NextResponse.json({ error: 'Name must be 1-100 characters' }, { status: 400 });
  }

  try {
    if (!(await createPanel(slug, name))) {
      return NextResponse.json({ error: `A panel called "${slug}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ slug }, { status: 201 });
  } catch (error) {
    console.error('Bot panel create error:', error);
    return NextResponse.json({ error: 'Failed to create panel' }, { status: 500 });
  }
}
