// What a player may see of a game. The full GameState holds both decks in
// order, the opponent's hand and the RNG state; none of that leaves the
// server. A view carries counts for the hidden zones instead.

import type { CardDef, GameState, GameView, PlayerState, PlayerView, Side } from './types';

function playerView(p: PlayerState, own: boolean): PlayerView {
  const { deck, hand, ...rest } = p;
  return { ...rest, deckCount: deck.length, handCount: hand.length, ...(own ? { hand } : {}) };
}

export function viewFor(s: GameState, side: Side): GameView {
  const view: GameView = {
    rules: s.rules,
    phase: s.phase,
    turn: s.turn,
    active: s.active,
    first: s.first,
    you: side,
    winner: s.winner,
    endReason: s.endReason,
    players: [playerView(s.players[0], side === 0), playerView(s.players[1], side === 1)],
    log: s.log,
    logBase: s.logBase,
  };
  if (s.extraDefs) {
    // Member cards are the only defs not in the shared catalog. Send the ones
    // this player can already see, so the list does not reveal the other
    // deck.
    const me = s.players[side];
    const visible = new Set<string>([
      ...me.deck.map(c => c.slug), ...me.hand.map(c => c.slug),
      ...s.players.flatMap(p => [...p.board.map(u => u.slug), ...p.graveyard]),
      ...s.log.flatMap(e => ('slug' in e ? [e.slug] : [])),
    ]);
    const defs: Record<string, CardDef> = {};
    for (const [slug, def] of Object.entries(s.extraDefs)) if (visible.has(slug)) defs[slug] = def;
    if (Object.keys(defs).length) view.extraDefs = defs;
  }
  return view;
}
