// The value model every card is built against.
//
// A card of cost c gets a budget of base + perCost * c + quad * c^2 "stat
// points" (plus a small tier premium, below), whatever its rarity. The
// quadratic term makes big cards a little better per tide than small ones,
// which is what keeps a late game worth reaching (README, "Balance"). Power
// and health are bought at their stat weights; keywords and abilities are priced in the same unit. Rarer cards
// spend their budget on abilities and keywords, so they are more flexible
// but not stronger per tide spent: a normal and a mythic of the same cost
// are the same size. That rule is what keeps a rare collection from winning
// just by being rare (lib/duel/README.md, "Fairness").
//
// Every price is a named coefficient in balance-coefficients.json. They were
// fitted by self-play (lib/duel/tune.test.ts): mechanics that won more than
// their share of games got dearer, ones that lost got cheaper, repeated
// until no mechanic group stood out. When a card looks wrong, re-run the
// tuner rather than hand-patching the one card.

import coefficients from './balance-coefficients.json';
import type { Ability, CardDef, Effect, Element, Keyword, TargetSpec, Tier } from './types';

/**
 * normalElementBudget (optional, war prices only so far): a separate
 * per-element offset for normal cards. Free decks are all normals, whose
 * kits differ from the rarer tiers', so one offset per element could not
 * balance both the starters and the collections.
 */
export type Coefficients = typeof coefficients & { normalElementBudget?: Record<Element, number> };

/** Mutable only so the tuner can refit it in place; everything else reads it. */
export const K: Coefficients = structuredClone(coefficients);


/**
 * Per-element offset, at most one point either way. What is left after the
 * mechanic prices are fitted is the element's pool as a whole playing
 * stronger or weaker than its parts (the tuner fits it from mono-element
 * decks). Kept small on purpose: the practice bot plays aggressive plans
 * better than patient ones, and people may not.
 */
export const ELEMENT_BUDGET_LIMIT = 1;

export function budget(cost: number, tier: Tier, element?: Element): number {
  const offset = !element ? 0 : tier === 'normal' && K.normalElementBudget ? K.normalElementBudget[element] : K.elementBudget[element];
  // tierBonus: without a small premium, ability cards lost to plain bodies
  // of the same cost and a mythic was a trap (README, "Fairness").
  return K.budget.perCost * cost + K.budget.base + K.budget.quad * cost * cost + K.tierBonus[tier] + offset;
}

/** `others` is the card's full keyword list: a Shield on a Guard soaks a
 *  hit every time the enemy is forced to attack it, so it is worth more. */
export function keywordValue(kw: Keyword, power: number, health: number, others: Keyword[] = []): number {
  const [base, perPower, perHealth] = K.keywords[kw];
  const combo = kw === 'shield' && others.includes('guard') ? K.shieldOnGuard : 0;
  return base + perPower * power + perHealth * health + combo;
}

/** Token stats are fixed (catalog.ts TOKENS); their value feeds summon effects. */
export type TokenLookup = (slug: string) => { power: number; health: number; keywords: Keyword[] } | undefined;

type Scope = 'self' | 'one' | 'all';

function scope(t: string): Scope {
  if (t === 'self') return 'self';
  return t === 'all_ally_units' || t === 'other_ally_units' || t === 'all_enemy_units' || t === 'all_other_units' ? 'all' : 'one';
}

/** The coefficient an effect is priced by. The tuner attributes game results
 *  to these keys, so two effects share a key only if they share a price. */
export function effectKey(e: Effect, spec: TargetSpec | undefined): string {
  switch (e.k) {
    case 'damage': return e.t === 'chosen' ? `damage:chosen:${spec ?? 'enemy'}` : `damage:${e.t}`;
    case 'heal': return `heal:${scope(e.t)}`;
    case 'buff': return `buff:${scope(e.t)}:${e.atk ? 'atk' : 'hp'}`;
    case 'freeze': return `freeze:${e.t === 'random_enemy_unit' ? 'random' : scope(e.t)}`;
    case 'bounce': return `bounce:${e.t === 'all_enemy_units' ? 'enemies' : e.t === 'all_other_units' ? 'everyone' : 'one'}`;
    case 'grant': return `grant:${e.kw}:${scope(e.t)}`;
    case 'draw': case 'summon': case 'tide': case 'destroy': case 'chain': return e.k;
  }
}

function coef(key: string): number {
  const v = (K.effects as Record<string, number>)[key];
  if (v === undefined) throw new Error(`No balance coefficient for ${key}`);
  return v;
}

export function effectValue(e: Effect, spec: TargetSpec | undefined, tokens: TokenLookup): number {
  const k = coef(effectKey(e, spec));
  switch (e.k) {
    case 'damage': case 'heal': case 'draw': case 'tide': case 'chain': return k * e.n;
    case 'buff': return k * (e.atk * K.stats.power + e.hp * K.stats.health);
    case 'freeze': case 'grant': return k;
    case 'bounce': return k * (1 + Math.min(e.maxCost ?? 8, 8));
    case 'destroy': return k * (1 + Math.min(e.maxPower ?? 8, 8));
    case 'summon': {
      const t = tokens(e.token);
      if (!t) return 0;
      const kw = t.keywords.reduce((s, x) => s + keywordValue(x, t.power, t.health, t.keywords), 0);
      return k * e.n * (K.stats.power * t.power + K.stats.health * t.health + kw);
    }
  }
}

export function abilityValue(a: Ability, tokens: TokenLookup): number {
  const raw = a.effects.reduce((s, e) => s + effectValue(e, a.target, tokens), 0);
  switch (a.when) {
    case 'play': return raw;
    case 'death': return K.triggers.death * raw;
    case 'turn_start': return K.triggers.turn_start * raw;
    // A move repeats every turn but costs tide and replaces the unit's attack.
    case 'move': return Math.max(K.triggers.moveFloor, K.triggers.move * raw - K.triggers.moveTide * (a.cost ?? 0));
  }
}

/**
 * A card with no keywords and no abilities is priced `vanilla` points
 * higher. Evolved decks showed plain bodies winning more than their stats
 * say: a body with nothing to misplay, and none of its budget spent on an
 * effect that is sometimes dead. Fitted like any other price (tune.ts).
 */
export function cardValue(def: Pick<CardDef, 'power' | 'health' | 'keywords' | 'abilities'>, tokens: TokenLookup): number {
  const plain = !def.keywords.length && !def.abilities.length ? K.vanilla : 0;
  return plain + K.stats.power * def.power + K.stats.health * def.health
    + def.keywords.reduce((s, k) => s + keywordValue(k, def.power, def.health, def.keywords), 0)
    + def.abilities.reduce((s, a) => s + abilityValue(a, tokens), 0);
}

/**
 * Pick power/health so the card lands on its budget, leaning toward the
 * element's shape (share of stat points in power). Returns null when the
 * keywords and abilities alone already cost more than the budget allows.
 */
export function solveStats(
  target: number,
  shape: number,
  keywords: Keyword[],
  abilities: Ability[],
  tokens: TokenLookup,
): { power: number; health: number } | null {
  let best: { power: number; health: number; score: number } | null = null;
  const minPower = keywords.includes('guard') ? 0 : 1;
  for (let h = 1; h <= target + 2; h++) {
    for (let p = minPower; p <= target + 2; p++) {
      const v = cardValue({ power: p, health: h, keywords, abilities }, tokens);
      // Never more than half a point over: rounding may cost a card, never gift one.
      if (v > target + 0.5) break;
      const miss = target - v;
      if (miss > 1.5) continue;
      const lean = p - shape * (p + h);
      const score = miss * miss * 4 + lean * lean;
      if (!best || score < best.score) best = { power: p, health: h, score };
    }
  }
  return best ? { power: best.power, health: best.health } : null;
}
