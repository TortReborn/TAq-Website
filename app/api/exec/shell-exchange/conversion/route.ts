import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { republishPanelsUsing } from '@/lib/bot-panels-db';
import { PANEL_VALUES } from '@/lib/panel-values';
import { getShellConversion, saveShellConversion, shellConversionErrors } from '@/lib/shell-conversion';

export const dynamic = 'force-dynamic';

// GET — the current shells -> aspects rate
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await getShellConversion());
  } catch (e) {
    console.error('shell conversion GET', e);
    return NextResponse.json({ error: 'Failed to load the conversion rate' }, { status: 500 });
  }
}

// PUT { shells_per_aspect, max_aspects_per_conversion } — takes effect on the next conversion
export async function PUT(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const errors = shellConversionErrors(body ?? {});
  if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

  const value = { shells_per_aspect: body.shells_per_aspect as number, max_aspects_per_conversion: body.max_aspects_per_conversion as number };
  try {
    const before = await getShellConversion();
    await saveShellConversion(value);

    // Panels that show a changed value get republished so Discord follows it.
    const changed = (Object.keys(value) as (keyof typeof value)[]).filter(k => before[k] !== value[k]);
    const note = changed
      .map(k => `${PANEL_VALUES.find(v => v.key === k)?.label ?? k} changed ${before[k]} → ${value[k]}`)
      .join('; ');
    const republished = await republishPanelsUsing(changed, note, {
      id: session.discord_id ?? null, name: session.ign || session.discord_username,
    });
    return NextResponse.json({ ...value, republished });
  } catch (e) {
    console.error('shell conversion PUT', e);
    return NextResponse.json({ error: 'Failed to save the conversion rate' }, { status: 500 });
  }
}
