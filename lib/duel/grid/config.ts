// Every number in Warfront, in one object.
//
// GRID is mutable only so the balance lab can try variants in-process (the
// same pattern as WAR in ../war/config.ts and RULES in ../rules.ts). The
// controls the lab runs beside the main rules are knobs here too: element
// movement off, flanking off, surround capture on, the 5x5 board. The
// values the brief started from (rules v0) are in README.md, "Rules v1";
// every change from them was measured there.

import type { Element } from '../types';

export interface GridConfig {
  /** Board size for new games: 7 (default) or 5. */
  size: 5 | 7;
  /** A layout name from layouts.ts, or '' for a seeded pick among the size's layouts. */
  layout: string;
  hqHp: number;
  /** HQ fire: damage the HQ deals, at the start of its owner's turn, to one adjacent enemy (0 = off). */
  hqFire: number;
  /** HQ fire reach (Chebyshev tiles; 1 = adjacent only) and how many different enemies it hits each upkeep. */
  hqFireReach: number;
  hqFireShots: number;
  /** HQ fire ramp: +1 HQ fire for every this much HQ health lost (0 = off). */
  hqFireRamp: number;
  /** Rally: extra orders a turn while your HQ is at or below half health (0 = off). */
  rally: number;
  /** Share of healing an HQ receives (heals, Drain, the wood perk): 1 full, 0 none. */
  hqHealShare: number;
  /** Extra health for a unit standing next to its own HQ (0 = off). */
  hqAura: number;
  /** HQ armour per connected node: damage to an HQ is reduced by this much per node. */
  armourPerNode: number;
  /** The least damage a hit on an armoured HQ can do (0 or 1). */
  armourMin: number;
  /** HQ reach: any unit this close (Chebyshev) to the enemy HQ can attack it (1 = only adjacent, or a Ranged line). */
  hqReach: number;
  /** Orders a turn, and the first player's orders on turn 1. */
  orders: number;
  firstOrders: number;
  /** Emeralds both players start with, and the second player's extra. */
  startEmeralds: number;
  secondBonus: number;
  /** Turn limit, in turns per player. */
  turnLimit: number;
  /** Most units a side may have on the board (0 = no cap); deploys and summons past it are refused. */
  maxUnits: number;
  startHand: number;
  handMax: number;
  /** Cards drawn each upkeep (the first player skips it on turn 1). */
  draw: number;
  /** Base income each upkeep; each connected node adds nodeIncome. */
  income: number;
  /** Growing income: +1 base income every this many of your turns (0 = flat). */
  incomeStep: number;
  nodeIncome: number;
  /** Rebate: emeralds a side gets back when one of its units (not a token) dies. */
  deathRebate: number;
  /** Catch-up: extra emeralds at upkeep for the side with fewer connected nodes than its enemy. */
  catchUp: number;
  bankCap: number;
  /** Emerald cost = ceil(costScale * tide cost), for cards, moves and the tank ability. */
  costScale: number;
  moveCostScale: number;
  /** A card's grid health = round(card health x healthMult); heals and health buffs scale too. */
  healthMult: number;
  /**
   * 'element': each element moves its own way (README). 'uniform': the
   * control run, every unit moves up to 2 steps orthogonally.
   */
  movement: 'element' | 'uniform';
  /** Base range per element (earth and fire king steps, thunder line, air diagonal; water's is its river run). */
  range: Record<Element, number>;
  /** Card speed: a quarter of cards fast (+1 range), a quarter slow (-1, never below 1); rolled from the slug. */
  speed: boolean;
  fastShare: number;
  /** A fast unit gives up this much health, a slow one gains it. */
  speedHealth: number;
  /** Melee reach: 8 (the eight neighbours) or 4 (orthogonal only). */
  adjacency: 8 | 4;
  /** Ranged reach: a straight line (8 directions) up to this far, with line of sight. */
  rangedReach: number;
  /** Flanking: bonus damage per other friendly unit next to the target (0 = off). */
  flank: number;
  /** The most flanking can add to one attack. */
  flankCap: number;
  /** A melee defender that survives strikes back for its power. */
  retaliation: boolean;
  /** Share of damage a braced unit takes (rounded down). */
  braceTaken: number;
  /** Orders a brace uses (0: a free stance for any unit that has not acted, 1: an order). */
  braceOrders: number;
  /**
   * Free stance at the end of your turn: 'idle' braces every unit of yours
   * that did not act this turn (arrivals included); 'passive' also braces
   * units that only moved (no attack or ability); 'off' braces only on order.
   */
  autoBrace: 'off' | 'idle' | 'passive';
  /** Share of damage a unit in the free stance takes (a brace by order uses braceTaken). */
  autoBraceTaken: number;
  /** A unit's move ability leaves its order open: it may still attack (or brace) after it, once a turn. */
  abilityAttack: boolean;
  /** Air may also step this many tiles orthogonally, walking (blocked like anyone); 0 = diagonal flight only. */
  airStep: number;
  /**
   * Setback: at the start of your turn, if the enemy's last turn cost you a
   * connected node ('node'), or took at least setbackHq from your HQ ('hq'),
   * or either ('either'), you get setbackOrders extra orders and
   * setbackEmeralds extra emeralds this turn. 'off' disables it.
   */
  setbackOn: 'off' | 'node' | 'hq' | 'either';
  setbackHq: number;
  setbackOrders: number;
  setbackEmeralds: number;
  /** Setback deploys: while a setback is active, card costs drop by this much (never below 1). */
  setbackDiscount: number;
  /**
   * Reinforcements: while you have at least reinforceGap fewer units on the
   * board than your enemy, your cards cost reinforceDiscount less (never
   * below 1), and with reinforceReady a unit you deploy can act at once.
   */
  reinforceGap: number;
  reinforceDiscount: number;
  reinforceReady: boolean;
  /**
   * Last stand: once a game, at the start of your turn with your HQ at or
   * below lastStandAt of its health, it is repaired by lastStand (0 = off;
   * the one exception to "HQs cannot be healed").
   */
  lastStand: number;
  lastStandAt: number;
  /** Outnumbered: while you have fewer units on the board than your enemy, your attacks deal this much more. */
  outnumbered: number;
  /** Pierce: what the unit behind the target takes, as a share of the attacker's power. */
  pierceShare: number;
  /** Surround capture: a unit with no free orthogonal neighbour dies at the end of its enemy's turn. */
  surround: boolean;
  /** Contested ground: no deploying onto a tile next to an enemy unit. */
  contested: boolean;
  /** How far a targeted card effect reaches from its source (Chebyshev tiles, 0 = anywhere). */
  effectRange: number;
  /** Node perks for connected nodes (the war perk idea: a territory's main resource). */
  perks: boolean;
  perk: { city: number; ore: number; crops: number; fish: number; wood: number };
  /** Draws for the fish perk happen every this many of your turns. */
  fishEvery: number;
  /**
   * Territory score (rules v3). At the start of your turn each node you hold
   * scores scoreNode points (the city scoreCity); reach scoreTarget and you
   * win. 0 turns the score off (the v2 game: HQ only, nodes at the limit).
   */
  scoreTarget: number;
  scoreNode: number;
  scoreCity: number;
  /** A node on the enemy's half of the board scores this instead of scoreNode (raids pay). */
  scoreFar: number;
  /** Only nodes connected to your HQ score (false: every node you hold). */
  scoreConnected: boolean;
  /** When nodes score: 'start' of their owner's turn (held through the enemy's turn) or its 'end' (as soon as claimed). */
  scoreWhen: 'start' | 'end';
  /** HQ damage scores too: 1 point to the attacker for every this much damage on the enemy HQ (0 = off). */
  scoreHq: number;
  /**
   * Rotating objective (0 = off): one node at a time is the objective for
   * objectiveEvery player-turns and scores objectiveBonus extra. The next
   * one is announced objectiveWarn player-turns before it starts; the first
   * starts on player-turn objectiveFirst.
   */
  objectiveEvery: number;
  objectiveWarn: number;
  objectiveBonus: number;
  objectiveFirst: number;
  /** HQ armour grows with damage taken: +1 for every this much health lost (0 = off). */
  armourGrowth: number;
  /** Claims ignore enemies next to the node: end your turn on it and it is yours. */
  claimAdjacent: boolean;
  /** Rising stakes: every node scores +1 more for every this many rounds played (0 = off). */
  scoreRamp: number;
  /** Underdog: while your score is below the enemy's, your scoring nodes add this much more each turn (0 = off). */
  scoreBehind: number;
}

export const GRID: GridConfig = {
  size: 7,
  layout: '',
  hqHp: 12,
  hqFire: 2,
  hqFireRamp: 0,
  hqFireReach: 1,
  hqFireShots: 1,
  rally: 0,
  hqHealShare: 0,
  hqAura: 0,
  armourPerNode: 1,
  armourMin: 1,
  hqReach: 2,
  orders: 3,
  firstOrders: 2,
  startEmeralds: 0,
  secondBonus: 0,
  turnLimit: 16,
  maxUnits: 7,
  startHand: 4,
  handMax: 8,
  draw: 1,
  income: 2,
  incomeStep: 2,
  nodeIncome: 1,
  deathRebate: 0,
  catchUp: 1,
  bankCap: 8,
  costScale: 0.6,
  moveCostScale: 0.6,
  healthMult: 1.5,
  movement: 'element',
  range: { earth: 1, thunder: 3, air: 2, fire: 2, water: 3 },
  speed: true,
  fastShare: 0.25,
  speedHealth: 1,
  adjacency: 8,
  rangedReach: 2,
  flank: 1,
  flankCap: 3,
  retaliation: true,
  braceTaken: 0.5,
  braceOrders: 1,
  autoBrace: 'passive',
  autoBraceTaken: 0.75,
  airStep: 1,
  abilityAttack: true,
  setbackOn: 'off',
  setbackHq: 3,
  setbackOrders: 0,
  setbackEmeralds: 0,
  setbackDiscount: 0,
  reinforceGap: 1,
  reinforceDiscount: 3,
  reinforceReady: false,
  outnumbered: 0,
  lastStand: 0,
  lastStandAt: 0.5,
  pierceShare: 1,
  surround: false,
  contested: true,
  effectRange: 0,
  perks: true,
  perk: { city: 1, ore: 1, crops: 2, fish: 1, wood: 1 },
  fishEvery: 2,
  // Rules v3 (README "Rules v3"): first to 16 points wins; a battered HQ hardens. The rest measured and off.
  scoreTarget: 16,
  scoreNode: 1,
  scoreCity: 1,
  scoreFar: 1,
  scoreConnected: true,
  scoreWhen: 'start',
  scoreHq: 0,
  objectiveEvery: 0,
  objectiveWarn: 2,
  objectiveBonus: 1,
  objectiveFirst: 3,
  armourGrowth: 4,
  claimAdjacent: false,
  scoreRamp: 0,
  scoreBehind: 0,
};

/**
 * Per-size presets: the values a board size plays with where they differ from
 * GRID (7x7). A game made at a size with a non-empty preset stores its whole
 * config in GridState.cfg, so a 5x5 game keeps its own numbers for its whole
 * life and a GridView carries them to the browser. Mutable for the lab.
 */
export const GRID_PRESETS: Record<5 | 7, Partial<GridConfig>> = {
  7: {},
  // 5x5: siege only from next to the HQ; with 7x7's reach 2 a 5x5 game lasts 3.5 turns each (README "5x5").
  5: { hqReach: 1 },
};

/** The whole config a new game of this size plays with (GRID, then the size's preset). */
export function gridRulesFor(size: 5 | 7): GridConfig {
  return { ...structuredClone(GRID), ...structuredClone(GRID_PRESETS[size] ?? {}), size };
}

/**
 * grid-3: rules v3 (README "Rules v3"): the territory score win condition (plus the knobs it picked).
 * grid-2: rules v2: free stance, reinforcements, Air's step, ability then attack, size presets.
 * 7x7 games made under grid-2 keep v2 rules (board.ts rulesOf).
 */
export const GRID_RULES_VERSION = 'grid-3';

/** Friendly games: seconds a turn (the mulligan uses MULLIGAN_SECONDS). */
export const GRID_TURN_SECONDS = 60;

export function gridEmeraldCost(tide: number, g: GridConfig = GRID): number {
  return Math.ceil(g.costScale * tide - 1e-9);
}

export function gridMoveCost(tide: number, g: GridConfig = GRID): number {
  return Math.ceil(g.moveCostScale * tide - 1e-9);
}
