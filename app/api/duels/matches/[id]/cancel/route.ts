import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, inTransaction, requirePlayer, unauthorized } from '@/lib/duel/http';
import { cancelChallenge, loadMatch } from '@/lib/duel/store';

export const dynamic = 'force-dynamic';

/** Withdraw your open challenge, or decline one sent to you. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await requirePlayer(request);
  if (!me) return unauthorized();
  const { id } = await params;
  try {
    const found = await inTransaction(async client => {
      const row = await loadMatch(client, id, true);
      if (!row) return false;
      await cancelChallenge(client, row, me);
      return true;
    });
    return found ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  } catch (e) {
    return errorResponse(e, 'cancel challenge');
  }
}
