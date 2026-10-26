import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { errorResponse, readJson, requirePlayer, unauthorized } from '@/lib/duel/http';
import { deleteDeck, saveDeck } from '@/lib/duel/store';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const me = await requirePlayer(request);
  if (!me) return unauthorized();
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return NextResponse.json({ error: 'Deck not found.' }, { status: 404 });
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  try {
    const deck = await saveDeck(getPool(), me.discordId, { id, name: body.name, cards: body.cards });
    return NextResponse.json({ deck: { id: deck.id, name: deck.name, cards: deck.cards, updatedAt: deck.updated_at } });
  } catch (e) {
    return errorResponse(e, 'save deck');
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const me = await requirePlayer(request);
  if (!me) return unauthorized();
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return NextResponse.json({ error: 'Deck not found.' }, { status: 404 });
  try {
    const ok = await deleteDeck(getPool(), me.discordId, id);
    return ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Deck not found.' }, { status: 404 });
  } catch (e) {
    return errorResponse(e, 'delete deck');
  }
}
