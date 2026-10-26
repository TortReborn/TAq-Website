// What a player may see of a Warfront game.
//
// Hidden: the opponent's hand, both decks (counts only; your own deck order
// too), and the RNG. Everything on the board is public: units (Stealth
// units included: they are on the board, just not targetable), nodes and
// owners, HQ health, emeralds, orders left, brace stances.

import type { CardDef, Side } from '../types';
import type { GridPlayer, GridState } from './types';

export interface GridPlayerView extends Omit<GridPlayer, 'deck' | 'hand'> {
  deckCount: number;
  handCount: number;
  /** Only present for the viewer's own side. */
  hand?: GridPlayer['hand'];
}

export interface GridView extends Omit<GridState, 'players' | 'rng' | 'quiet'> {
  you: Side;
  players: [GridPlayerView, GridPlayerView];
}

function playerView(p: GridPlayer, own: boolean): GridPlayerView {
  const { deck, hand, ...rest } = p;
  return { ...rest, deckCount: deck.length, handCount: hand.length, ...(own ? { hand } : {}) };
}

export function gridViewFor(s: GridState, side: Side): GridView {
  const { rng: _rng, quiet: _quiet, players, extraDefs, ...rest } = s;
  const view: GridView = { ...rest, you: side, players: [playerView(players[0], side === 0), playerView(players[1], side === 1)] };
  if (extraDefs) {
    // Member cards: only the ones this player can already see.
    const me = players[side];
    const visible = new Set<string>([
      ...me.deck.map(c => c.slug), ...me.hand.map(c => c.slug), ...s.units.map(u => u.slug), ...players.flatMap(p => p.graveyard),
    ]);
    const defs: Record<string, CardDef> = {};
    for (const [slug, def] of Object.entries(extraDefs)) if (visible.has(slug)) defs[slug] = def;
    if (Object.keys(defs).length) view.extraDefs = defs;
  }
  return view;
}
