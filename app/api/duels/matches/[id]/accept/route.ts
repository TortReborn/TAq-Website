import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, inTransaction, readJson, requirePlayer, unauthorized } from '@/lib/duel/http';
import { acceptChallenge, loadMatch, parseDeckChoice, resolveDeck, toPayload } from '@/lib/duel/store';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await requirePlayer(request);
  if (!me) return unauthorized();
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  try {
    const row = await inTransaction(async client => {
      const open = await loadMatch(client, id, true);
      if (!open) return null;
      const deck = await resolveDeck(client, me.discordId, parseDeckChoice(body.deck), true);
      return acceptChallenge(client, open, me, deck);
    });
    if (!row) return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    return NextResponse.json({ match: toPayload(row, 1) });
  } catch (e) {
    return errorResponse(e, 'accept challenge');
  }
}
