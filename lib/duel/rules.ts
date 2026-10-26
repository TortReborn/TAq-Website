// Rule constants and the Tank abilities.
//
// RULES is mutable only so the balance lab (lab.ts) can try variants
// in-process; the game, the API and the UI all run on the values below. The
// UI reads the exported constants in engine.ts (HERO_HP and friends), which
// are these shipped values.

import type { Ability, CardDef, Element } from './types';
import { ELEMENTS } from './types';

export interface Rules {
  heroHp: number;
  /** Opening hand for the first and second player (the second also gets the Pearl). */
  startHand: [number, number];
  /** Off only for before/after measurements of the Tank ability. */
  tanks: boolean;
  /** Tide cost of each element's Tank ability. */
  tankCost: Record<Element, number>;
}

/** Friendly-duel clocks; practice has none. Here rather than store.ts so the browser can import them. */
export const TURN_SECONDS = 90;
export const MULLIGAN_SECONDS = 45;

export const RULES: Rules = {
  heroHp: 20,
  startHand: [3, 4],
  tanks: true,
  tankCost: { earth: 2, thunder: 2, water: 2, fire: 2, air: 2 },
};

/**
 * Every deck fights from a tank of its main element, and the tank has one
 * ability usable once a turn for tide. It is the game's tide sink: a turn
 * with nothing worth playing still has a decision in it, a late game with
 * a thin hand still has something to do, and each element gets a plan of
 * its own on day one, whatever cards the player owns.
 */
export function tankAbility(el: Element): Ability {
  const cost = RULES.tankCost[el];
  switch (el) {
    case 'fire': return { when: 'move', name: 'Flare', cost, target: 'enemy', effects: [{ k: 'damage', n: 1, t: 'chosen' }] };
    case 'thunder': return { when: 'move', name: 'Spark', cost, effects: [{ k: 'summon', token: 'token-spark', n: 1 }] };
    case 'water': return { when: 'move', name: 'Mend', cost, target: 'ally', effects: [{ k: 'heal', n: 2, t: 'chosen' }] };
    case 'earth': return { when: 'move', name: 'Raise Wall', cost, effects: [{ k: 'summon', token: 'token-stone-wall', n: 1 }] };
    case 'air': return { when: 'move', name: 'Scout', cost, effects: [{ k: 'draw', n: 1 }] };
  }
}

/**
 * A deck's tank element: the element with the most cards, then the most
 * total cost, then the first in ELEMENTS order. Pure, so the deck builder
 * can show it.
 */
export function tankElement(cards: Pick<CardDef, 'element' | 'cost'>[]): Element {
  const count = new Map<Element, number>();
  const cost = new Map<Element, number>();
  for (const c of cards) {
    count.set(c.element, (count.get(c.element) ?? 0) + 1);
    cost.set(c.element, (cost.get(c.element) ?? 0) + c.cost);
  }
  let best: Element = ELEMENTS[0];
  for (const el of ELEMENTS) {
    const d = (count.get(el) ?? 0) - (count.get(best) ?? 0);
    if (d > 0 || (d === 0 && (cost.get(el) ?? 0) > (cost.get(best) ?? 0))) best = el;
  }
  return best;
}
