// Deck search by self-play: a small genetic algorithm run as a league.
//
// Decks are genomes (20 slugs). Each generation every deck plays games
// against opponents drawn from the whole league (every population plus a
// hall of fame of past champions, so a deck cannot win by beating only last
// generation's fashion). Win rate is fitness; the best survive, the rest are
// replaced by mutated and crossed-over children, always repaired back to a
// legal deck. Games run through a lab Runner (lab.ts), so the same search
// runs serially under vitest (evolve.test.ts) or on every core
// (scripts/duel-lab.mjs, and the meta loop in meta.ts).

import { allCards } from './catalog';
import { copyLimit, MAX_MYTHIC, MAX_RENOWNED, RENOWNED } from './deck';
import { DECK_SIZE, tankElement } from './engine';
import { score, type GameTask, type Runner } from './lab';
import { Rng } from './rng';
import { buildDeck } from './sim';
import type { CardDef, Element } from './types';
import { ELEMENTS } from './types';

export interface PopulationSpec {
  name: string;
  /** Cards this population may use. */
  pool: CardDef[];
  size: number;
  /** Restrict to these elements (a starter search); omit for any. */
  elements?: Element[];
  /**
   * Keep every deck on this tank element (splashes allowed). One population
   * per element is a niche: without niches the whole league collapses onto
   * whichever element is ahead early, and "is every element viable?" can
   * no longer be read off the result.
   */
  tank?: Element;
}

export interface Individual {
  id: number;
  pop: string;
  deck: string[];
  fitness: number;
  games: number;
  wins: number;
  born: number;
}

let nextId = 1;

/** Make any list of slugs a legal deck drawn from `pool`. */
export function repair(deck: string[], pool: CardDef[], rng: Rng): string[] {
  const by = new Map(pool.map(c => [c.slug, c]));
  const out: string[] = [];
  const count = new Map<string, number>();
  let renowned = 0;
  let mythic = 0;
  const tryAdd = (slug: string) => {
    const c = by.get(slug);
    if (!c || out.length >= DECK_SIZE) return false;
    if ((count.get(slug) ?? 0) >= copyLimit(c)) return false;
    if (RENOWNED.has(c.tier) && renowned >= MAX_RENOWNED) return false;
    if (c.tier === 'mythic' && mythic >= MAX_MYTHIC) return false;
    out.push(slug);
    count.set(slug, (count.get(slug) ?? 0) + 1);
    if (RENOWNED.has(c.tier)) renowned++;
    if (c.tier === 'mythic') mythic++;
    return true;
  };
  for (const s of deck) tryAdd(s);
  // Fill from the deck's own elements first so repairs do not drift a
  // deck's identity, then from anywhere.
  const els = new Set(out.map(s => by.get(s)!.element));
  const same = rng.shuffle(pool.filter(c => els.has(c.element)));
  for (const c of same) { if (out.length >= DECK_SIZE) break; tryAdd(c.slug); }
  for (const c of rng.shuffle(pool.slice())) { if (out.length >= DECK_SIZE) break; tryAdd(c.slug); }
  return out;
}

function mutate(deck: string[], pool: CardDef[], rng: Rng, elements?: Element[]): string[] {
  const d = deck.slice();
  const n = 1 + rng.int(3);
  const by = new Map(pool.map(c => [c.slug, c]));
  const els = elements ?? [...new Set(d.map(s => by.get(s)?.element).filter(Boolean))] as Element[];
  for (let i = 0; i < n; i++) {
    d.splice(rng.int(d.length), 1);
    // Mostly stay on-colour; sometimes try a splash.
    const choices = rng.float() < 0.8 || elements ? pool.filter(c => els.includes(c.element)) : pool;
    d.push(rng.pick(choices.length ? choices : pool).slug);
  }
  return d;
}

function crossover(a: string[], b: string[], rng: Rng): string[] {
  const cut = 5 + rng.int(DECK_SIZE - 10);
  return [...rng.shuffle(a.slice()).slice(0, cut), ...rng.shuffle(b.slice()).slice(0, DECK_SIZE - cut)];
}

/** Swap off-element cards for on-element ones until the deck's tank is `tank`. */
function holdTank(deck: string[], spec: PopulationSpec, rng: Rng): string[] {
  const tank = spec.tank;
  if (!tank) return deck;
  const by = new Map(spec.pool.map(c => [c.slug, c]));
  const onEl = spec.pool.filter(c => c.element === tank);
  let d = deck;
  for (let i = 0; i < 30 && tankElement(d.map(s => by.get(s)!)) !== tank; i++) {
    const off = d.map((s, k) => [s, k] as const).filter(([s]) => by.get(s)!.element !== tank);
    const next = d.slice();
    next[rng.pick(off)[1]] = rng.pick(onEl).slug;
    d = repair(next, spec.pool, rng);
  }
  return d;
}

function seed(spec: PopulationSpec, rng: Rng, gen: number): Individual {
  const main = spec.tank ?? rng.pick(ELEMENTS);
  const els = spec.elements ?? (rng.float() < 0.6 ? [main] : [main, rng.pick(ELEMENTS)]);
  const deck = buildDeck({ elements: [...new Set(els)], tiers: new Set(spec.pool.map(c => c.tier)), maxRenowned: rng.float() < 0.5 }, rng, spec.pool);
  return { id: nextId++, pop: spec.name, deck: holdTank(deck, spec, rng), fitness: 0, games: 0, wins: 0, born: gen };
}

export interface EvolveOptions {
  runner: Runner;
  generations: number;
  gamesPerDeck: number;
  elites: number;
  hallOfFame: number;
  seed: number;
  onGeneration?: (gen: number, pops: Record<string, Individual[]>) => void;
}

/** Play `games` games for each individual against league opponents; fills fitness. */
async function evaluate(all: Individual[], league: Individual[], games: number, rng: Rng, runner: Runner) {
  const tasks: GameTask[] = [];
  const owner: { ind: Individual; seat: 0 | 1 }[] = [];
  for (const ind of all) {
    const opponents = league.filter(o => o.id !== ind.id);
    for (let g = 0; g < games; g++) {
      const opp = rng.pick(opponents);
      const seat = (g % 2) as 0 | 1;
      tasks.push({ a: seat === 0 ? ind.deck : opp.deck, b: seat === 0 ? opp.deck : ind.deck, seed: rng.int(2 ** 31) });
      owner.push({ ind, seat });
    }
  }
  const results = await runner.play(tasks);
  for (const ind of all) { ind.games = 0; ind.wins = 0; }
  results.forEach((r, i) => {
    const { ind, seat } = owner[i];
    ind.games++;
    ind.wins += score(r, seat);
  });
  for (const ind of all) ind.fitness = ind.wins / Math.max(1, ind.games);
}

export async function evolve(specs: PopulationSpec[], opts: EvolveOptions): Promise<{ pops: Record<string, Individual[]>; hall: Individual[] }> {
  const rng = new Rng(opts.seed);
  const pops: Record<string, Individual[]> = {};
  for (const s of specs) pops[s.name] = Array.from({ length: s.size }, () => seed(s, rng, 0));
  const hall: Individual[] = [];
  for (let gen = 1; gen <= opts.generations; gen++) {
    const everyone = Object.values(pops).flat();
    await evaluate(everyone, [...everyone, ...hall], opts.gamesPerDeck, rng, opts.runner);
    for (const s of specs) {
      const pop = pops[s.name].sort((a, b) => b.fitness - a.fitness);
      hall.push({ ...pop[0], deck: pop[0].deck.slice() });
      if (hall.length > opts.hallOfFame) hall.shift();
      const elites = pop.slice(0, opts.elites);
      const children: Individual[] = [];
      while (elites.length + children.length < s.size) {
        const a = rng.pick(elites);
        let deck: string[];
        if (rng.float() < 0.35) {
          const b = rng.pick(elites);
          deck = crossover(a.deck, b.deck, rng);
        } else deck = mutate(a.deck, s.pool, rng, s.elements);
        // Keep a trickle of fresh blood so the search does not collapse onto one idea.
        if (rng.float() < 0.08) { children.push(seed(s, rng, gen)); continue; }
        children.push({ id: nextId++, pop: s.name, deck: holdTank(repair(deck, s.pool, rng), s, rng), fitness: 0, games: 0, wins: 0, born: gen });
      }
      pops[s.name] = [...elites, ...children];
    }
    opts.onGeneration?.(gen, pops);
  }
  // Final, careful evaluation of the survivors.
  const everyone = Object.values(pops).flat();
  await evaluate(everyone, [...everyone, ...hall], opts.gamesPerDeck * 3, rng, opts.runner);
  for (const s of specs) pops[s.name].sort((a, b) => b.fitness - a.fitness);
  return { pops, hall };
}

/** Head-to-head win rate of deck a against deck b, seats alternating. */
export async function headToHead(a: string[], b: string[], games: number, seedN: number, runner: Runner): Promise<number> {
  const rng = new Rng(seedN);
  const tasks: GameTask[] = [];
  for (let g = 0; g < games; g++) tasks.push(g % 2 === 0 ? { a, b, seed: rng.int(2 ** 31) } : { a: b, b: a, seed: rng.int(2 ** 31) });
  const results = await runner.play(tasks);
  return results.reduce((w, r, g) => w + score(r, (g % 2) as 0 | 1), 0) / games;
}

export function poolFor(tiers: string[]): CardDef[] {
  const t = new Set(tiers);
  return allCards().filter(c => t.has(c.tier));
}
