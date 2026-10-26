// Learns the practice bot's evaluation weights (ai-weights.json) by
// self-play: a (1+1) evolution strategy with paired games.
//
// Each iteration perturbs one to three weights of the current champion and
// plays the challenger against the champion on the same decks and seeds,
// each pairing twice with the seats swapped, so luck of the draw cancels
// out. The challenger replaces the champion only when it wins by a margin
// well outside the noise. Every balance number in this directory comes from
// bot games, so a bot that misplays a mechanic makes that mechanic look
// weak; retrain after rule changes.

import { WEIGHTS, type BotWeights } from './ai';
import type { GameTask, Runner } from './lab';
import { score } from './lab';
import { ALL_TIERS } from './meta';
import { Rng } from './rng';
import { buildDeck } from './sim';
import type { Element } from './types';
import { ELEMENTS } from './types';

export interface TrainOptions {
  runner: Runner;
  seed: number;
  iterations: number;
  /** Deck pairings per iteration (each played twice). */
  games: number;
  log?: (line: string) => void;
}

/** Challenger's score against the champion, seats swapped on the same seed. */
export async function duel(challenger: BotWeights, champion: BotWeights, games: number, seed: number, runner: Runner): Promise<number> {
  const rng = new Rng(seed);
  const tiers = new Set(ALL_TIERS);
  const normals = new Set(['normal']);
  const tasks: GameTask[] = [];
  const pick = (): Element[] => { const a = rng.pick(ELEMENTS); const b = rng.pick(ELEMENTS); return a === b ? [a] : [a, b]; };
  for (let g = 0; g < games; g++) {
    const a = buildDeck({ elements: pick(), tiers: rng.float() < 0.3 ? normals : tiers, maxRenowned: rng.float() < 0.5 }, rng);
    const b = buildDeck({ elements: pick(), tiers: rng.float() < 0.3 ? normals : tiers, maxRenowned: rng.float() < 0.5 }, rng);
    const s = rng.int(2 ** 31);
    tasks.push({ a, b, seed: s, opts: { bots: [challenger, champion] } });
    tasks.push({ a, b, seed: s, opts: { bots: [champion, challenger] } });
  }
  const results = await runner.play(tasks);
  return results.reduce((w, r, i) => w + score(r, (i % 2) as 0 | 1), 0) / results.length;
}

export async function trainBot(opts: TrainOptions): Promise<BotWeights> {
  const log = opts.log ?? (() => {});
  const rng = new Rng(opts.seed);
  const start = { ...WEIGHTS };
  let champ = { ...WEIGHTS };
  // width is the search setting, not a weight.
  const keys = (Object.keys(champ) as (keyof BotWeights)[]).filter(k => k !== 'width');
  // Noise in the win rate is about 0.5 / sqrt(2 * games); demand ~2 of it.
  const margin = 1 / Math.sqrt(2 * opts.games);
  let sigma = 0.35;
  for (let it = 1; it <= opts.iterations; it++) {
    const cand = { ...champ };
    const n = 1 + rng.int(3);
    const touched: string[] = [];
    for (let i = 0; i < n; i++) {
      const k = rng.pick(keys);
      // Multiplicative steps keep a weight's sign; a small additive part
      // lets a weight that sits at zero move at all.
      const step = Math.exp(sigma * (rng.float() * 2 - 1));
      cand[k] = +(cand[k] * step + (rng.float() - 0.5) * 0.1).toFixed(3);
      touched.push(`${k} ${champ[k]}->${cand[k]}`);
    }
    const r = await duel(cand, champ, opts.games, opts.seed + it, opts.runner);
    const won = r > 0.5 + margin;
    if (won) champ = cand;
    // One-fifth rule: widen the search while it keeps finding improvements.
    sigma = Math.min(0.8, Math.max(0.08, sigma * (won ? 1.3 : 0.93)));
    log(`iter ${it}: ${(100 * r).toFixed(1)}% ${won ? 'ACCEPT' : 'reject'} (${touched.join(', ')})`);
  }
  const vsStart = await duel(champ, start, opts.games * 2, opts.seed + 99991, opts.runner);
  log(`trained weights vs starting weights: ${(100 * vsStart).toFixed(1)}%`);
  Object.assign(WEIGHTS, champ);
  await opts.runner.configure({ bot: champ });
  return champ;
}
