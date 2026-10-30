import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { requestRegistryRefresh } from '@/lib/bot-panels-db';

export const dynamic = 'force-dynamic';

// POST — ask the bot to re-read channels, roles and emojis now instead of at
// its hourly sync; the editor polls until the registry's updated_at moves
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await requestRegistryRefresh();
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    console.error('Bot panel registry refresh error:', error);
    return NextResponse.json({ error: 'Failed to request a refresh' }, { status: 500 });
  }
}
