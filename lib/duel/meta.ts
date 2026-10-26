// The meta loop: the outermost balance loop, above the price tuner.
//
//   structure  budget curve, tier bonus, hero health, Tank costs
//     -> prices   refit every mechanic price by self-play (tune.ts), with
//                 extra pressure on mechanics the last season's best decks
//                 overused
//     -> season   evolve a league of new-player and veteran decks and the
//                 five starter decks (evolve.ts), then measure them
//     -> health   score the season against the targets below
//   keep the structure with the best health, perturb it, repeat.
//
// Health targets (README, "Balance method"): best veteran deck beats best
// free deck at most ~58%; every element among the elite decks and none over
// 40%; elite average cost in a midrange band with every cost used; no card
// in over half the elite decks; starters within 40-60% of each other; the
// first player winning 47-53%.
//
// Runs through scripts/duel-lab.mjs (all cores); far too slow serially.

import { K, type Coefficients } from './balance';
import { WEIGHTS } from './ai';
import { getCard } from './catalog';
import { RULES, tankElement, type Rules } from './engine';
import { evolve, headToHead, poolFor, type Individual } from './evolve';
import { currentConfig, type GameTask, type Runner } from './lab';
import { engagement, type Engagement } from './metrics';
import { Rng } from './rng';
import { buildDeck, type GameResult } from './sim';
import { priceKeys, tunePrices } from './tune';
import { summarizeWar, type WarSummary } from './war/sim';
import { summarizeGrid, type GridSummary } from './grid/sim';
import type { Element } from './types';
import { ELEMENTS } from './types';

export const ALL_TIERS = ['normal', 'unique', 'rare', 'legendary', 'fabled', 'mythic'];

export interface SeasonOptions {
  runner: Runner;
  seed: number;
  generations: number;
  popSize: number;
  gamesPerDeck: number;
  /** Traced games for the engagement numbers (default 2000). */
  tracedGames?: number;
  log?: (line: string) => void;
}

export interface DeckSummary {
  fitness: number;
  avgCost: number;
  elements: Record<string, number>;
  tank: Element;
  deck: string[];
}

export interface SeasonReport {
  bestNew: DeckSummary;
  bestVeteran: DeckSummary;
  /** Best veteran against best new deck. */
  vetVsNew: number;
  /**
   * Mean over the top five of each side, every pairing. Far steadier than
   * best-against-best, whose two decks change from run to run; health uses
   * this one.
   */
  vetVsNewTop: number;
  eliteMainElements: Record<string, number>;
  eliteAvgCost: { all: number; new: number; veteran: number };
  /** Share of elite deck slots at each cost (6 = 6 or more). */
  eliteCostShare: Record<number, number>;
  /** Cards in the most elite decks, as a share of elite decks. */
  topCards: { slug: string; name: string; tier: string; share: number }[];
  starters: Record<Element, string[]>;
  /** starterMatrix[i][j]: starter i's win rate against starter j. */
  starterMatrix: (number | null)[][];
  engagementElite: Engagement;
  engagementRandom: Engagement;
  /** League fitness of the best deck in each niche (new-<element>, vet-<element>). */
  nicheBest: Record<string, number>;
  /** Three-Front War only: order mix, lanes, reads, perks (war/sim.ts). */
  war?: WarSummary;
  /** Warfront only: orders, movement, nodes, snipes (grid/sim.ts). */
  grid?: GridSummary;
  pressure: Record<string, number>;
}

/** The deck's tank element, which is also what "main element" means here. */
function mainElement(deck: string[]): Element {
  return tankElement(deck.map(s => getCard(s)!));
}

function summary(ind: Individual): DeckSummary {
  const defs = ind.deck.map(s => getCard(s)!);
  const elements: Record<string, number> = {};
  for (const c of defs) elements[c.element] = (elements[c.element] ?? 0) + 1;
  return {
    fitness: +ind.fitness.toFixed(3),
    avgCost: +(defs.reduce((a, c) => a + c.cost, 0) / defs.length).toFixed(2),
    elements,
    tank: mainElement(ind.deck),
    deck: ind.deck.slice().sort(),
  };
}

/**
 * Pressure on each price key from what the best decks chose: a mechanic the
 * elites pick far more often than the pool offers it is under-priced even if
 * random decks do not show it (random decks rarely assemble the curve that
 * exploits it). Returned as a win-rate-point bonus the tuner adds to that
 * key's measured deviation.
 */
function elitePressure(elites: Individual[], pools: Record<string, ReturnType<typeof poolFor>>): Record<string, number> {
  const used = new Map<string, number>();
  const offered = new Map<string, number>();
  let slots = 0;
  let offeredTotal = 0;
  for (const ind of elites) {
    for (const s of ind.deck) {
      slots++;
      for (const k of priceKeys(getCard(s)!)) used.set(k, (used.get(k) ?? 0) + 1);
    }
    for (const c of pools[ind.pop]) {
      offeredTotal++;
      for (const k of priceKeys(c)) offered.set(k, (offered.get(k) ?? 0) + 1);
    }
  }
  const out: Record<string, number> = {};
  for (const [k, n] of offered) {
    const u = (used.get(k) ?? 0) / slots;
    const b = n / offeredTotal;
    if (b < 0.01) continue; // a handful of signature cards; too few to judge
    out[k] = Math.max(-0.05, Math.min(0.05, 0.03 * Math.log((u + 0.005) / (b + 0.005))));
  }
  return out;
}

async function tracedGames(decks: string[][], games: number, seed: number, runner: Runner): Promise<GameResult[]> {
  const rng = new Rng(seed);
  const tasks: GameTask[] = [];
  for (let g = 0; g < games; g++) {
    const a = rng.pick(decks);
    let b = rng.pick(decks);
    for (let k = 0; k < 5 && b === a; k++) b = rng.pick(decks);
    tasks.push({ a, b, seed: rng.int(2 ** 31), opts: { trace: true } });
  }
  return runner.play(tasks);
}

/** Random curve-built decks from the whole pool, for engagement numbers comparable across rules. */
export async function randomEngagement(runner: Runner, games: number, seed: number): Promise<Engagement> {
  const rng = new Rng(seed);
  const tiers = new Set(ALL_TIERS);
  const tasks: GameTask[] = [];
  for (let g = 0; g < games; g++) {
    const pick = (): Element[] => { const a = rng.pick(ELEMENTS); const b = rng.pick(ELEMENTS); return a === b ? [a] : [a, b]; };
    tasks.push({ a: buildDeck({ elements: pick(), tiers }, rng), b: buildDeck({ elements: pick(), tiers }, rng), seed: rng.int(2 ** 31), opts: { trace: true } });
  }
  return engagement(await runner.play(tasks));
}

export async function season(opts: SeasonOptions): Promise<SeasonReport> {
  const { runner } = opts;
  const log = opts.log ?? (() => {});
  // One niche per tank element in each population (evolve.ts, "tank"),
  // all playing in one league. Free decks are mono-element, so the best free
  // deck of each element is also that element's starter deck.
  const normals = poolFor(['normal']);
  const everything = poolFor(ALL_TIERS);
  const specs = [
    ...ELEMENTS.map(el => ({ name: `new-${el}`, pool: normals.filter(c => c.element === el), size: opts.popSize - 2, elements: [el] })),
    ...ELEMENTS.map(el => ({ name: `vet-${el}`, pool: everything, size: opts.popSize, tank: el })),
  ];
  const pools = Object.fromEntries(specs.map(sp => [sp.name, sp.pool]));
  const meta = await evolve(specs, {
    runner, generations: opts.generations, gamesPerDeck: opts.gamesPerDeck,
    elites: Math.max(2, Math.round(opts.popSize / 3)), hallOfFame: 30, seed: opts.seed,
  });
  const ranked = (prefix: string) => Object.entries(meta.pops).filter(([n]) => n.startsWith(prefix)).flatMap(([, p]) => p).sort((x, y) => y.fitness - x.fitness);
  const newTop = ranked('new-').slice(0, 10);
  const vetTop = ranked('vet-').slice(0, 10);
  const elites = [...newTop, ...vetTop];
  const vetVsNew = await headToHead(vetTop[0].deck, newTop[0].deck, 600, opts.seed + 1, runner);
  let top = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) top += await headToHead(vetTop[i].deck, newTop[j].deck, 100, opts.seed + 10 + i * 5 + j, runner);
  top /= 25;
  log(`  league: best veteran vs best new ${(100 * vetVsNew).toFixed(1)}%, top-5 ${(100 * top).toFixed(1)}%`);
  const nicheBest = Object.fromEntries(Object.entries(meta.pops).map(([n, p]) => [n, +p[0].fitness.toFixed(3)]));

  const eliteMainElements: Record<string, number> = {};
  for (const ind of elites) { const e = mainElement(ind.deck); eliteMainElements[e] = (eliteMainElements[e] ?? 0) + 1; }
  const avg = (xs: Individual[]) => xs.reduce((a, i) => a + i.deck.reduce((b, s) => b + getCard(s)!.cost, 0), 0) / (xs.length * 20);
  const eliteCostShare: Record<number, number> = {};
  for (const ind of elites) for (const s of ind.deck) { const c = Math.min(6, getCard(s)!.cost); eliteCostShare[c] = (eliteCostShare[c] ?? 0) + 1 / (elites.length * 20); }
  for (const c of Object.keys(eliteCostShare)) eliteCostShare[+c] = +eliteCostShare[+c].toFixed(3);
  const freq = new Map<string, number>();
  for (const ind of elites) for (const s of new Set(ind.deck)) freq.set(s, (freq.get(s) ?? 0) + 1);
  const topCards = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([slug, n]) => ({ slug, name: getCard(slug)!.name, tier: getCard(slug)!.tier, share: +(n / elites.length).toFixed(2) }));

  const starters = Object.fromEntries(ELEMENTS.map(el => [el, meta.pops[`new-${el}`][0].deck.slice().sort()])) as Record<Element, string[]>;
  const starterMatrix: (number | null)[][] = ELEMENTS.map(() => ELEMENTS.map(() => null));
  for (let i = 0; i < ELEMENTS.length; i++) {
    for (let j = i + 1; j < ELEMENTS.length; j++) {
      const r = await headToHead(starters[ELEMENTS[i]], starters[ELEMENTS[j]], 300, opts.seed + 100 + i * 5 + j, runner);
      starterMatrix[i][j] = +r.toFixed(3);
      starterMatrix[j][i] = +(1 - r).toFixed(3);
    }
  }
  const eliteGames = await tracedGames(elites.map(i => i.deck), opts.tracedGames ?? 2000, opts.seed + 5, runner);
  const engagementElite = engagement(eliteGames);
  const engagementRandom = await randomEngagement(runner, opts.tracedGames ?? 2000, opts.seed + 6);
  return {
    bestNew: summary(newTop[0]),
    bestVeteran: summary(vetTop[0]),
    vetVsNew: +vetVsNew.toFixed(3),
    vetVsNewTop: +top.toFixed(3),
    eliteMainElements,
    eliteAvgCost: { all: +avg(elites).toFixed(2), new: +avg(newTop).toFixed(2), veteran: +avg(vetTop).toFixed(2) },
    eliteCostShare,
    topCards,
    starters,
    starterMatrix,
    engagementElite,
    engagementRandom,
    nicheBest,
    ...(eliteGames[0]?.war ? { war: summarizeWar(eliteGames) } : {}),
    ...(eliteGames[0]?.grid ? { grid: summarizeGrid(eliteGames) } : {}),
    pressure: elitePressure(elites, pools),
  };
}

export interface Health {
  score: number;
  parts: Record<string, number>;
}

/** 0 is every target met; each part is how far outside its target the season landed. */
export function health(r: SeasonReport): Health {
  const parts: Record<string, number> = {};
  parts.vetVsNew = Math.max(0, r.vetVsNewTop - 0.58);
  const total = Object.values(r.eliteMainElements).reduce((a, b) => a + b, 0);
  const shares = ELEMENTS.map(e => (r.eliteMainElements[e] ?? 0) / total);
  parts.elements = shares.filter(s => s === 0).length * 0.05 + Math.max(0, Math.max(...shares) - 0.4);
  // Normals only go up to cost 5, so the free decks are cheaper by
  // construction; the band is on the veteran elites.
  const vc = r.eliteAvgCost.veteran;
  parts.cost = Math.max(0, 3.2 - vc) / 4 + Math.max(0, vc - 4.2) / 4;
  parts.curve = [1, 2, 3, 4, 5, 6].reduce((a, c) => a + Math.max(0, 0.04 - (r.eliteCostShare[c] ?? 0)), 0);
  parts.concentration = Math.max(0, (r.topCards[0]?.share ?? 0) - 0.5);
  let spread = 0;
  for (const row of r.starterMatrix) for (const x of row) if (x !== null) spread = Math.max(spread, Math.abs(x - 0.5));
  parts.starters = Math.max(0, spread - 0.1);
  parts.firstPlayer = Math.max(0, Math.abs(r.engagementElite.firstPlayerWin - 0.5) - 0.03);
  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(parts)) parts[k] = +parts[k].toFixed(3);
  return { score: +score.toFixed(3), parts };
}

// --- The outer loop ---------------------------------------------------------

export interface Structure {
  budget: Coefficients['budget'];
  /** Multiplies every non-zero tier bonus. */
  tierScale: number;
  heroHp: number;
  startHand: Rules['startHand'];
  tankCost: Rules['tankCost'];
}

export function currentStructure(): Structure {
  return { budget: { ...K.budget }, tierScale: 1, heroHp: RULES.heroHp, startHand: [...RULES.startHand], tankCost: { ...RULES.tankCost } };
}

export interface MetaOptions {
  runner: Runner;
  iterations: number;
  tuneRounds: number;
  tuneGames: number;
  season: Omit<SeasonOptions, 'runner' | 'seed' | 'log'>;
  seed: number;
  log: (line: string) => void;
  /** Called with every evaluated candidate (for writing progress to disk). */
  onCandidate?: (c: MetaCandidate) => void;
}

export interface MetaCandidate {
  iteration: number;
  structure: Structure;
  health: Health;
  report: SeasonReport;
  config: ReturnType<typeof currentConfig>;
}

function applyStructure(st: Structure, baseTier: Coefficients['tierBonus']) {
  K.budget = { ...st.budget };
  for (const t of Object.keys(K.tierBonus) as (keyof Coefficients['tierBonus'])[]) K.tierBonus[t] = +(baseTier[t] * st.tierScale).toFixed(3);
  RULES.heroHp = st.heroHp;
  RULES.startHand = [...st.startHand];
  RULES.tankCost = { ...st.tankCost };
}

/**
 * One structural change at a time, aimed at the worst-missed target (ties
 * and several candidate moves are broken at random).
 */
function propose(st: Structure, h: Health, r: SeasonReport, rng: Rng, tried: Set<string>): Structure {
  let next: Structure = structuredClone(st);
  const movesFor = (part: string): (() => void)[] => {
    const moves: (() => void)[] = [];
    const tank = (e: Element, d: number) => {
      const v = next.tankCost[e] + d;
      if (v >= 1 && v <= 3) moves.push(() => { next.tankCost[e] = v; });
    };
    switch (part) {
      case 'vetVsNew':
        if (next.tierScale > 0) moves.push(() => { next.tierScale = +Math.max(0, next.tierScale - 0.25).toFixed(2); });
        break;
      case 'cost': case 'curve': {
        // Too cheap a meta: make big cards better per tide, or small ones worse.
        const low = r.eliteAvgCost.veteran < 3.7;
        moves.push(() => { next.budget.quad = +Math.max(0, next.budget.quad + (low ? 0.03 : -0.03)).toFixed(3); });
        moves.push(() => { next.budget.base = +(next.budget.base + (low ? -0.25 : 0.25)).toFixed(2); });
        if (low && next.heroHp < 30) moves.push(() => { next.heroHp += 5; });
        break;
      }
      case 'elements': {
        // An element over-represented among the elites: its Tank ability
        // costs a tide more; an absent one, a tide less.
        const total = Object.values(r.eliteMainElements).reduce((x, y) => x + y, 0);
        for (const e of ELEMENTS) {
          const share = (r.eliteMainElements[e] ?? 0) / total;
          if (share > 0.4) tank(e, 1);
          if (share === 0) tank(e, -1);
        }
        break;
      }
      case 'starters': {
        const mean = r.starterMatrix.map(row => row.filter((x): x is number => x !== null).reduce((x, y) => x + y, 0) / 4);
        tank(ELEMENTS[mean.indexOf(Math.max(...mean))], 1);
        tank(ELEMENTS[mean.indexOf(Math.min(...mean))], -1);
        break;
      }
      case 'firstPlayer': {
        // Seat balance: the second player's opening hand is the lever.
        const fp = r.engagementElite.firstPlayerWin;
        if (fp < 0.5 && next.startHand[1] > 3) moves.push(() => { next.startHand[1]--; });
        if (fp > 0.5 && next.startHand[1] < 6) moves.push(() => { next.startHand[1]++; });
        break;
      }
    }
    return moves;
  };
  const parts = Object.entries(h.parts).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1] + (rng.float() - 0.5) * 0.05);
  // Aim at the worst miss first, skipping structures already evaluated.
  for (const [part] of parts) {
    for (const move of rng.shuffle(movesFor(part))) {
      move();
      if (!tried.has(JSON.stringify(next))) return next;
      next = structuredClone(st);
    }
  }
  next.budget.quad = +Math.max(0, next.budget.quad + (rng.float() < 0.5 ? 0.02 : -0.02)).toFixed(3);
  return next;
}

export async function metaLoop(opts: MetaOptions): Promise<MetaCandidate> {
  const rng = new Rng(opts.seed);
  const baseTier = { ...K.tierBonus };
  const startK = structuredClone(K);
  let structure = currentStructure();
  let pressure: Record<string, number> = {};
  let best: MetaCandidate | null = null;
  const tried = new Set<string>();
  for (let it = 0; it < opts.iterations; it++) {
    // Every candidate refits from the same starting prices, so candidates
    // differ by structure (and the pressure), not by tuning history.
    for (const key of new Set([...Object.keys(K), ...Object.keys(startK)]) as Set<keyof Coefficients>) (K as Record<string, unknown>)[key] = structuredClone(startK[key]);
    applyStructure(structure, baseTier);
    await opts.runner.configure({ coefficients: K, rules: RULES, bot: WEIGHTS });
    opts.log(`\n== iteration ${it}: ${JSON.stringify(structure)}`);
    await tunePrices({ rounds: opts.tuneRounds, games: opts.tuneGames, seed: opts.seed + 1000 * it, runner: opts.runner, pressure, log: l => opts.log('  ' + l.split('\n')[0]) });
    const report = await season({ ...opts.season, runner: opts.runner, seed: opts.seed + 17 * it, log: opts.log });
    const h = health(report);
    opts.log(`  health ${h.score} ${JSON.stringify(h.parts)}`);
    opts.log(`  elements ${JSON.stringify(report.eliteMainElements)} cost ${JSON.stringify(report.eliteAvgCost)} top card ${report.topCards[0]?.name} ${report.topCards[0]?.share}`);
    const cand: MetaCandidate = { iteration: it, structure: structuredClone(structure), health: h, report, config: currentConfig() };
    opts.onCandidate?.(cand);
    if (!best || h.score < best.health.score) best = cand;
    pressure = best.report.pressure;
    tried.add(JSON.stringify(structure));
    structure = propose(best.structure, best.health, best.report, rng, tried);
  }
  return best!;
}
