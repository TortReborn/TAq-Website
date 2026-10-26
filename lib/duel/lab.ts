// Plumbing shared by the balance loops (tune.ts, evolve.ts, train.ts,
// meta.ts): a "runner" plays batches of bot games under a given
// configuration. serialRunner plays them in this thread (vitest entries);
// scripts/duel-lab.mjs supplies a worker-thread runner with the same
// interface, which is what makes the meta loop affordable.
//
// A configuration is everything a game depends on besides the decks and the
// seed: which ruleset (the duel game, Three-Front War or Warfront), the
// balance coefficients (which regenerate every card), each ruleset's
// constants and its bot's settings. The loops above never look inside a
// game; a ruleset only has to turn (deck, deck, seed) into a GameResult. Workers apply it to their own copy of the
// module state, so it must be plain JSON.

import { K, type Coefficients } from './balance';
import { WEIGHTS, type BotWeights } from './ai';
import { rebuildCatalog, SIGNATURE_OVERRIDES } from './catalog';
import type { Signature } from './signatures';
import { RULES, type Rules } from './engine';
import { playGame, type GameResult, type PlayOptions } from './sim';
import { WAR_BOT, type WarBotParams } from './war/ai';
import { WAR, type WarConfig } from './war/config';
import { playWarGame } from './war/sim';
import { GRID_BOT, GRID_EVAL, type GridBotParams, type GridEval } from './grid/ai';
import { GRID, GRID_PRESETS, type GridConfig } from './grid/config';
import { playGridGame } from './grid/sim';
import { GRID_PRICES } from './grid/cards';
import { WAR_PRICES } from './war/cards';

export type Ruleset = 'duel' | 'war' | 'grid';

/** Which ruleset playTasks runs (per thread; set through applyConfig). */
export const LAB: { ruleset: Ruleset } = { ruleset: 'duel' };

export interface LabConfig {
  ruleset?: Ruleset;
  war?: Partial<WarConfig>;
  warBot?: Partial<WarBotParams>;
  grid?: Partial<GridConfig>;
  /** Warfront per-size presets (grid/config.ts GRID_PRESETS), replaced whole per size given. */
  gridPresets?: Partial<Record<5 | 7, Partial<GridConfig>>>;
  gridBot?: Partial<GridBotParams>;
  gridEval?: Partial<GridEval>;
  /** Replacement hand-written cards for this ruleset (catalog.ts SIGNATURE_OVERRIDES). */
  signatures?: Record<string, Signature>;
  coefficients?: Coefficients;
  rules?: Partial<Rules>;
  bot?: BotWeights;
}

export interface GameTask {
  a: string[];
  b: string[];
  seed: number;
  opts?: PlayOptions;
}

export interface Runner {
  /** Apply a configuration here and in every worker. */
  configure(cfg: LabConfig): Promise<void>;
  play(tasks: GameTask[]): Promise<GameResult[]>;
  close(): Promise<void>;
}

/** Load a configuration into this thread's module state. */
export function applyConfig(cfg: LabConfig) {
  if (cfg.ruleset) LAB.ruleset = cfg.ruleset;
  // Warfront reads the live catalog during lab runs, so the prices being fitted are the ones played.
  if (cfg.ruleset) GRID_PRICES.live = cfg.ruleset === 'grid';
  // War likewise (war/cards.ts).
  if (cfg.ruleset) WAR_PRICES.live = cfg.ruleset === 'war';
  if (cfg.war) Object.assign(WAR, structuredClone(cfg.war));
  if (cfg.warBot) Object.assign(WAR_BOT, cfg.warBot);
  if (cfg.grid) Object.assign(GRID, structuredClone(cfg.grid));
  if (cfg.gridPresets) for (const [k, v] of Object.entries(cfg.gridPresets)) if (v) GRID_PRESETS[Number(k) as 5 | 7] = structuredClone(v);
  if (cfg.gridBot) Object.assign(GRID_BOT, cfg.gridBot);
  if (cfg.gridEval) Object.assign(GRID_EVAL, cfg.gridEval);
  if (cfg.rules) Object.assign(RULES, cfg.rules);
  if (cfg.bot) Object.assign(WEIGHTS, cfg.bot);
  if (cfg.signatures) {
    for (const k of Object.keys(SIGNATURE_OVERRIDES)) delete SIGNATURE_OVERRIDES[k];
    Object.assign(SIGNATURE_OVERRIDES, structuredClone(cfg.signatures));
    if (!cfg.coefficients) rebuildCatalog();
  }
  if (cfg.coefficients) {
    // Every key either side has: optional ones (normalElementBudget) come and go.
    for (const key of new Set([...Object.keys(K), ...Object.keys(cfg.coefficients)]) as Set<keyof Coefficients>) {
      (K as Record<string, unknown>)[key] = structuredClone(cfg.coefficients[key]);
    }
    rebuildCatalog();
  }
}

/** The whole current configuration, for handing to workers. */
export function currentConfig(): Required<LabConfig> {
  return {
    ruleset: LAB.ruleset, war: structuredClone(WAR), warBot: { ...WAR_BOT }, grid: structuredClone(GRID), gridPresets: structuredClone(GRID_PRESETS), gridBot: { ...GRID_BOT }, gridEval: { ...GRID_EVAL }, signatures: structuredClone(SIGNATURE_OVERRIDES),
    coefficients: structuredClone(K), rules: { ...RULES }, bot: { ...WEIGHTS },
  };
}

export function playTasks(tasks: GameTask[]): GameResult[] {
  if (LAB.ruleset === 'grid') return tasks.map(t => playGridGame(t.a, t.b, t.seed, { trace: t.opts?.trace, bots: t.opts?.gridBots, grid: t.opts?.grid }));
  if (LAB.ruleset === 'war') return tasks.map(t => playWarGame(t.a, t.b, t.seed, { trace: t.opts?.trace, bots: t.opts?.warBots }));
  return tasks.map(t => playGame(t.a, t.b, t.seed, t.opts));
}

export function serialRunner(): Runner {
  return {
    async configure(cfg) { applyConfig(cfg); },
    async play(tasks) { return playTasks(tasks); },
    async close() {},
  };
}

/** Win rate of the deck in seat `mine` (0 = a, 1 = b), draws as half. */
export function score(r: GameResult, mine: 0 | 1): number {
  return r.winner === mine ? 1 : r.winner === null ? 0.5 : 0;
}
