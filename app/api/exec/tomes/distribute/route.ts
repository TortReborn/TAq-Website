import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { give, previewDistribution, TomeConflict } from '@/lib/tomes-db';

export const dynamic = 'force-dynamic';

const MAX_TOMES = 1000;

// POST { tomes } — preview who `tomes` tomes would go to
// POST { plan: [{ request_id, count }] } — give out a previewed plan
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    if (Array.isArray(body?.plan)) {
      const plan = body.plan
        .map((p: any) => ({ request_id: Number(p?.request_id), count: Number(p?.count) }))
        .filter((p: { request_id: number; count: number }) => Number.isInteger(p.request_id) && Number.isInteger(p.count) && p.count > 0);
      if (!plan.length || plan.length !== body.plan.length) return NextResponse.json({ error: 'The plan is empty or malformed' }, { status: 400 });
      const total = await give(plan, { id: session.discord_id, name: session.ign });
      return NextResponse.json({ given: total });
    }
    const tomes = Number(body?.tomes);
    if (!Number.isInteger(tomes) || tomes < 1 || tomes > MAX_TOMES) {
      return NextResponse.json({ error: `Enter how many tomes you have, 1 to ${MAX_TOMES}` }, { status: 400 });
    }
    return NextResponse.json({ plan: await previewDistribution(tomes) });
  } catch (error) {
    if (error instanceof TomeConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Tome distribution error:', error);
    return NextResponse.json({ error: 'Failed to give tomes out' }, { status: 500 });
  }
}
