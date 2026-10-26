// Fits the mechanic prices in balance-coefficients.json by self-play.
//
// Each round: rebuild every card from the current coefficients, play random
// legal decks against each other, and measure the win rate of the games in
// which a card using each price key was played. A key whose cards win more
// than the average gets dearer (so those cards get smaller bodies), one
// whose cards lose gets cheaper. Power against health is fitted the same
// way from power-heavy versus health-heavy cards, and a small per-element
// offset from mono-element decks. Rounds are noisy, so the coefficients
// from the round whose games came out most even are kept, not the last.
//
// Entry points: tune.test.ts (DUEL_TUNE=1, serial) and the meta loop
// (meta.ts, via scripts/duel-lab.mjs, parallel).

import { effectKey, ELEMENT_BUDGET_LIMIT, K, type Coefficients } from './balance';
import { allCards, OVER_BUDGET, rebuildCatalog } from './catalog';
import type { GameTask, Runner } from './lab';
import { Rng } from './rng';
import { buildDeck } from './sim';
import type { CardDef, Element } from './types';
import { ELEMENTS } from './types';

const ALL = new Set(['normal', 'unique', 'rare', 'legendary', 'fabled', 'mythic']);
const ETA = 0.8;
// Keys carried by one or two signature cards measure those cards, not the
// mechanic; leave them alone until they have a real sample.
const MIN_SAMPLES = 400;
// A price may drift at most this far from where the run started. Effects
// whose worth grows with the board (team-wide buffs) keep winning at any
// flat price; without a bound they would price themselves out of every
// card that carries them.
const DRIFT = [0.5, 1.8];

export function priceKeys(c: CardDef): string[] {
  const keys = c.keywords.map(k => `kw:${k}`);
  if (!c.keywords.length && !c.abilities.length) keys.push('vanilla:');
  if (c.keywords.includes('guard') && c.keywords.includes('shield')) keys.push('combo:shieldOnGuard');
  for (const a of c.abilities) {
    if (a.when !== 'play') keys.push(`trigger:${a.when}`);
    for (const e of a.effects) keys.push(`fx:${effectKey(e, a.target)}`);
  }
  return [...new Set(keys)];
}

/** Multiply one price key by f, bounded to DRIFT around `anchor`'s value. */
export function scaleKey(key: string, f: number, anchor: Coefficients) {
  const bound = (v: number, s: number) => Math.min(s * DRIFT[1], Math.max(s * DRIFT[0], v));
  const [kind, name] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (kind === 'vanilla') {
    // Starts at zero, so it moves by points, not by a factor.
    K.vanilla = Math.max(-0.5, Math.min(2, K.vanilla + 4 * (f - 1)));
  } else if (kind === 'kw') {
    const k = name as keyof typeof K.keywords;
    K.keywords[k] = K.keywords[k].map((v, i) => bound(v * f, anchor.keywords[k][i])) as never;
  } else if (kind === 'combo') K.shieldOnGuard = bound(K.shieldOnGuard * f, anchor.shieldOnGuard);
  else if (kind === 'trigger') {
    const t = K.triggers as Record<string, number>;
    t[name] = bound(t[name] * f, (anchor.triggers as Record<string, number>)[name]);
  } else if (kind === 'fx') {
    const fx = K.effects as Record<string, number>;
    if (fx[name] > 0) fx[name] = bound(fx[name] * f, (anchor.effects as Record<string, number>)[name]);
  }
}

export interface TuneOptions {
  rounds: number;
  games: number;
  seed: number;
  runner: Runner;
  /** Extra win-rate points per price key, from what evolved decks overuse (meta.ts). */
  pressure?: Record<string, number>;
  /**
   * Do not reject a round because a signature priced itself past its cost
   * (it falls back to a minimal body, catalog.ts); report it instead. For
   * rulesets where a signature's kit is worth more than in the duel game,
   * that is a redesign list, not a reason to stop tuning.
   */
  allowOverBudget?: boolean;
  /** Per-element budget offset bound (default ELEMENT_BUDGET_LIMIT, 1 point). */
  elementLimit?: number;
  /**
   * Also fit K.normalElementBudget from extra games between mono-element
   * all-normal decks (the free decks), a third as many as the main games.
   */
  normalOffsets?: boolean;
  /** Do not refit power against health. */
  fixStats?: boolean;
  /**
   * Also fit the tier bonus to the collection gap: extra games between a
   * whole-pool deck and an all-normal deck of the same element, a third as
   * many as the main games, toward gapTarget (default 0.5). Fitted in the
   * same rounds as normalOffsets, so the two do not undo each other.
   */
  fitTiers?: boolean;
  gapTarget?: number;
  log?: (line: string) => void;
}

type Tally = { games: number; wins: number };

async function playRound(seed: number, games: number, runner: Runner, normalGames = 0, gapGames = 0) {
  const rng = new Rng(seed);
  const tasks: GameTask[] = [];
  const els: [Element[], Element[]][] = [];
  const pick = (): Element[] => {
    const a = rng.pick(ELEMENTS);
    const b = rng.pick(ELEMENTS);
    return a === b ? [a] : [a, b];
  };
  for (let g = 0; g < games; g++) {
    const ea = pick();
    const eb = pick();
    els.push([ea, eb]);
    tasks.push({
      a: buildDeck({ elements: ea, tiers: ALL, maxRenowned: rng.float() < 0.5 }, rng),
      b: buildDeck({ elements: eb, tiers: ALL, maxRenowned: rng.float() < 0.5 }, rng),
      seed: rng.int(2 ** 31),
    });
  }
  const normals = new Set(['normal']);
  const normalEls: [Element, Element][] = [];
  for (let g = 0; g < normalGames; g++) {
    const ea = rng.pick(ELEMENTS);
    const eb = rng.pick(ELEMENTS.filter(e => e !== ea));
    normalEls.push([ea, eb]);
    tasks.push({ a: buildDeck({ elements: [ea], tiers: normals }, rng), b: buildDeck({ elements: [eb], tiers: normals }, rng), seed: rng.int(2 ** 31) });
  }
  // Collector gap: a deck from the whole pool (renowned slots filled half the
  // time) against an all-normal deck of the same element, seats alternating.
  for (let g = 0; g < gapGames; g++) {
    const el = rng.pick(ELEMENTS);
    const vet = buildDeck({ elements: [el], tiers: ALL, maxRenowned: rng.float() < 0.5 }, rng);
    const free = buildDeck({ elements: [el], tiers: normals }, rng);
    tasks.push(g % 2 ? { a: free, b: vet, seed: rng.int(2 ** 31) } : { a: vet, b: free, seed: rng.int(2 ** 31) });
  }
  const all = await runner.play(tasks);
  const results = all.slice(0, games);
  const gap = { games: 0, wins: 0 };
  all.slice(games + normalGames).forEach((r, g) => {
    const vetSide = g % 2 ? 1 : 0;
    gap.games++;
    gap.wins += r.winner === vetSide ? 1 : r.winner === null ? 0.5 : 0;
  });
  const byNormalEl = new Map<Element, Tally>();
  all.slice(games, games + normalGames).forEach((r, g) => {
    if (r.winner === null) return;
    for (const side of [0, 1] as const) {
      const t = byNormalEl.get(normalEls[g][side]) ?? { games: 0, wins: 0 };
      t.games++;
      if (r.winner === side) t.wins++;
      byNormalEl.set(normalEls[g][side], t);
    }
  });
  const byCard = new Map<string, Tally>();
  const byEl = new Map<Element, Tally>();
  results.forEach((r, g) => {
    if (r.winner === null) return;
    for (const side of [0, 1] as const) {
      const e = els[g][side];
      if (e.length === 1) {
        const t = byEl.get(e[0]) ?? { games: 0, wins: 0 };
        t.games++;
        if (r.winner === side) t.wins++;
        byEl.set(e[0], t);
      }
      for (const slug of new Set(r.played[side])) {
        const t = byCard.get(slug) ?? { games: 0, wins: 0 };
        t.games++;
        if (r.winner === side) t.wins++;
        byCard.set(slug, t);
      }
    }
  });
  return { byCard, byEl, byNormalEl, gap };
}

/**
 * Refit the prices in K in place, starting from its current values, and
 * leave K (and the catalog) at the best round found. Returns that round's
 * score: the widest mono-element spread plus half the worst key's miss.
 */
export async function tunePrices(opts: TuneOptions): Promise<{ score: number; round: number; overBudget: string[] }> {
  const over = new Set<string>();
  const log = opts.log ?? (() => {});
  const anchor = structuredClone(K);
  let best: { score: number; round: number; k: string } | null = null;
  for (let round = 1; round <= opts.rounds; round++) {
    const snapshot = JSON.stringify(K);
    rebuildCatalog();
    await opts.runner.configure({ coefficients: K });
    if (OVER_BUDGET.length) log(`  over budget this round: ${OVER_BUDGET.join(', ')}`);
    for (const s of OVER_BUDGET) over.add(s);
    const defs = new Map(allCards().map(c => [c.slug, c]));
    const { byCard, byEl, byNormalEl, gap } = await playRound(
      opts.seed + round, opts.games, opts.runner,
      opts.normalOffsets ? Math.round(opts.games / 3) : 0, opts.fitTiers ? Math.round(opts.games / 3) : 0,
    );
    const gapRate = gap.games ? gap.wins / gap.games : 0.5;
    let tw = 0, tg = 0;
    const groups = new Map<string, Tally>();
    const shape = { hi: { games: 0, wins: 0 }, lo: { games: 0, wins: 0 } };
    for (const [slug, t] of byCard) {
      tw += t.wins; tg += t.games;
      const c = defs.get(slug)!;
      for (const k of priceKeys(c)) {
        const x = groups.get(k) ?? { games: 0, wins: 0 };
        x.games += t.games; x.wins += t.wins; groups.set(k, x);
      }
      const share = (K.stats.power * c.power) / (K.stats.power * c.power + K.stats.health * c.health);
      const bucket = share > 0.55 ? shape.hi : share < 0.45 ? shape.lo : null;
      if (bucket) { bucket.games += t.games; bucket.wins += t.wins; }
    }
    const base = tw / tg;
    const moves: string[] = [];
    let worst = 0;
    for (const [k, t] of groups) {
      if (t.games < MIN_SAMPLES) continue;
      const dev = t.wins / t.games - base + (opts.pressure?.[k] ?? 0);
      worst = Math.max(worst, Math.abs(dev));
      scaleKey(k, Math.min(1.25, Math.max(0.8, 1 + ETA * dev)), anchor);
      if (Math.abs(dev) > 0.03) moves.push(`${k} ${(100 * dev).toFixed(1)}`);
    }
    const elRate = (e: Element) => { const t = byEl.get(e); return t && t.games ? t.wins / t.games : 0.5; };
    let spread = 0;
    for (const e of ELEMENTS) spread = Math.max(spread, Math.abs(elRate(e) - 0.5));
    let normalSpread = opts.fitTiers ? Math.abs(gapRate - (opts.gapTarget ?? 0.5)) : 0;
    for (const t of byNormalEl.values()) normalSpread = Math.max(normalSpread, Math.abs(t.wins / Math.max(1, t.games) - 0.5));
    const score = spread + worst / 2 + normalSpread + (OVER_BUDGET.length && !opts.allowOverBudget ? 1 : 0);
    if (!best || score < best.score) best = { score, round, k: snapshot };
    const lim = opts.elementLimit ?? ELEMENT_BUDGET_LIMIT;
    for (const e of ELEMENTS) {
      const next = K.elementBudget[e] - 3 * (elRate(e) - 0.5);
      K.elementBudget[e] = Math.max(-lim, Math.min(lim, next));
    }
    if (opts.fitTiers) {
      // One shared move for every non-normal tier: the premium that keeps
      // rarer cards from being traps is the lever on the collection gap.
      const step = 2 * (gapRate - (opts.gapTarget ?? 0.5));
      for (const t of Object.keys(K.tierBonus) as (keyof typeof K.tierBonus)[]) {
        if (t === 'normal' || t === 'token') continue;
        K.tierBonus[t] = Math.max(-1.5, Math.min(1.5, K.tierBonus[t] - step));
      }
      log(`  collection gap: ${(100 * gapRate).toFixed(0)}% -> tier bonus ${JSON.stringify(Object.fromEntries(Object.entries(K.tierBonus).map(([k, v]) => [k, +v.toFixed(2)])))}`);
    }
    if (opts.normalOffsets) {
      const nb = (K.normalElementBudget ??= { ...K.elementBudget });
      for (const e of ELEMENTS) {
        const t = byNormalEl.get(e);
        const wr = t && t.games ? t.wins / t.games : 0.5;
        // A smaller step than the all-tier offset: a free deck is 20 cards of
        // one element, so a point moves its win rate a long way.
        nb[e] = Math.max(-lim, Math.min(lim, nb[e] - 1.2 * (wr - 0.5)));
      }
      log(`  free decks: ${ELEMENTS.map(e => { const t = byNormalEl.get(e); return `${e} ${t ? (100 * t.wins / t.games).toFixed(0) : '-'}%`; }).join(', ')}`);
    }
    const shapeDev = shape.hi.wins / Math.max(1, shape.hi.games) - shape.lo.wins / Math.max(1, shape.lo.games);
    // Held fixed when a ruleset sets its pace another way (war healthMult):
    // otherwise this fit keeps making health cheaper and units tankier.
    if (!opts.fixStats) {
      K.stats.power *= 1 + (ETA * shapeDev) / 2;
      K.stats.health *= 1 - (ETA * shapeDev) / 2;
    }
    const els = ELEMENTS.map(e => `${e} ${(100 * elRate(e)).toFixed(0)}%`).join(', ');
    log(`round ${round}: worst key ${(100 * worst).toFixed(1)} pts off; power-vs-health ${(100 * shapeDev).toFixed(1)}; mono ${els}\n  ${moves.join('; ')}`);
  }
  const chosen = JSON.parse(best!.k) as Coefficients;
  for (const key of new Set([...Object.keys(K), ...Object.keys(chosen)]) as Set<keyof Coefficients>) (K as Record<string, unknown>)[key] = chosen[key];
  rebuildCatalog();
  await opts.runner.configure({ coefficients: K });
  log(`best round: ${best!.round}`);
  return { score: best!.score, round: best!.round, overBudget: [...over] };
}

/** Round every number to 3 places, for a readable JSON diff. */
export function rounded<T>(x: T): T {
  const r = (v: unknown): unknown =>
    typeof v === 'number' ? Math.round(v * 1000) / 1000 : Array.isArray(v) ? v.map(r) : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([k, w]) => [k, r(w)])) : v;
  return r(x) as T;
}
