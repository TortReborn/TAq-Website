import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { starterDecks } from '@/lib/duel/deck';
import { errorResponse, requirePlayer, unauthorized } from '@/lib/duel/http';
import { listDecks, lobby, memberDefs, ownedCards } from '@/lib/duel/store';

export const dynamic = 'force-dynamic';

/**
 * Everything the duels page needs on load: what you own, your decks, the
 * free starters, and your matches and challenges. The card catalog itself
 * ships with the page (lib/duel/catalog.ts), so only member cards, which
 * live in the bot's database, are sent here.
 */
export async function GET(request: NextRequest) {
  const me = await requirePlayer(request);
  if (!me) return unauthorized();
  try {
    const pool = getPool();
    const [owned, decks, matches] = await Promise.all([
      ownedCards(pool, me.discordId),
      listDecks(pool, me.discordId),
      lobby(pool, me),
    ]);
    const members = await memberDefs(pool, Object.keys(owned));
    return NextResponse.json({
      me: { ign: me.ign, uuid: me.uuid },
      owned,
      memberCards: members,
      decks: decks.map(d => ({ id: d.id, name: d.name, cards: d.cards, updatedAt: d.updated_at })),
      starters: starterDecks(),
      ...matches,
    });
  } catch (e) {
    return errorResponse(e, 'load duels');
  }
}
