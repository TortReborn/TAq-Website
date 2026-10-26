import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { errorResponse, readJson, requirePlayer, unauthorized } from '@/lib/duel/http';
import { saveDeck } from '@/lib/duel/store';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = await requirePlayer(request);
  if (!me) return unauthorized();
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  try {
    const deck = await saveDeck(getPool(), me.discordId, { name: body.name, cards: body.cards });
    return NextResponse.json({ deck: { id: deck.id, name: deck.name, cards: deck.cards, updatedAt: deck.updated_at } });
  } catch (e) {
    return errorResponse(e, 'save deck');
  }
}
