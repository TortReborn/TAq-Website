// What a player may see of a war.
//
// Hidden: the opponent's hand and deck (counts only), both decks' order, the
// RNG, and the opponent's plan until the round resolves (only whether it is
// in). The garrison is PUBLIC: every unit reaches it through a deploy or a
// switch that both players watch resolve, so hiding it would mean redacting
// log events for no real secrecy; the mind game is in when a switch comes,
// not what is on the bench (the same call Pokémon makes).

import type { CardDef } from '../types';
import type { Plan, Side, WarPlayer, WarState } from './types';

export interface WarPlayerView extends Omit<WarPlayer, 'deck' | 'hand' | 'plan'> {
  deckCount: number;
  handCount: number;
  hand?: WarPlayer['hand'];
  /** Orders submitted this round (contents only for your own side). */
  planned: boolean;
  plan?: Plan | null;
}

export interface WarView extends Omit<WarState, 'players' | 'rng' | 'quiet'> {
  you: Side;
  players: [WarPlayerView, WarPlayerView];
}

function playerView(p: WarPlayer, own: boolean, over: boolean): WarPlayerView {
  const { deck, hand, plan, ...rest } = p;
  // A finished war has no pending plan worth showing, even your own.
  return { ...rest, deckCount: deck.length, handCount: hand.length, planned: !!plan && !over, ...(own ? { hand, ...(over ? {} : { plan }) } : {}) };
}

export function warViewFor(s: WarState, side: Side): WarView {
  const { rng: _rng, quiet: _quiet, players, extraDefs, ...rest } = s;
  const view: WarView = {
    ...rest,
    you: side,
    players: [playerView(players[0], side === 0, s.phase === 'over'), playerView(players[1], side === 1, s.phase === 'over')],
  };
  if (extraDefs) {
    // Member cards: only the ones this player can already see.
    const me = players[side];
    const visible = new Set<string>([
      ...me.deck.map(c => c.slug), ...me.hand.map(c => c.slug),
      ...players.flatMap(p => [...p.active.flatMap(u => (u ? [u.slug] : [])), ...p.garrison.map(u => u.slug), ...p.graveyard]),
    ]);
    const defs: Record<string, CardDef> = {};
    for (const [slug, def] of Object.entries(extraDefs)) if (visible.has(slug)) defs[slug] = def;
    if (Object.keys(defs).length) view.extraDefs = defs;
  }
  return view;
}
