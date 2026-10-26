// Board geometry for Warfront: tiles, movement per element, attack reach,
// line of sight, connection to the HQ and deploy tiles. Pure functions of a
// GridBoard, which both the full GridState and a player's GridView satisfy,
// so the browser shows exactly the moves the server accepts.

import { gridCard } from './cards';
import { hash } from '../rng';
import type { CardDef, Element, Side } from '../types';
import { GRID, type GridConfig } from './config';
import type { GridNode, GridObjective, GridUnit, Terrain } from './types';

export interface GridBoard {
  width: number;
  height: number;
  terrain: Terrain[];
  nodes: GridNode[];
  hq: [number, number];
  units: GridUnit[];
  turn: number;
  active: Side;
  extraDefs?: Record<string, CardDef>;
  /** The game's own rules when they differ from GRID (a size preset, config.ts GRID_PRESETS); read through rulesOf. */
  cfg?: GridConfig;
  /** The rules version the game was made under (GRID_RULES_VERSION). */
  rules?: string;
  /** The rotating objective now (GRID.objectiveEvery), if any. */
  objective?: GridObjective | null;
  /** HQ health per side, where armour grows with damage taken (GRID.armourGrowth). */
  players?: readonly { hp: number; score?: number }[];
}

/**
 * The rules a board plays under: its stored preset, else the live GRID. A
 * 7x7 game made under rules v2 (rules 'grid-2', no stored preset) keeps
 * playing v2: the v3 score, objective and armour growth stay off for it.
 */
export const rulesOf = (b: { cfg?: GridConfig; rules?: string } | undefined): GridConfig =>
  b?.cfg ?? (b?.rules === 'grid-2' || b?.rules === 'grid-1' ? { ...GRID, ...V2_OFF } : GRID);

/** The v3 knobs as v2 games had them (off). */
const V2_OFF: Partial<GridConfig> = { scoreTarget: 0, objectiveEvery: 0, armourGrowth: 0, claimAdjacent: false, scoreRamp: 0, scoreBehind: 0, scoreHq: 0 };

export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export class GridError extends Error {}

export function gridDef(slug: string, extra?: Record<string, CardDef>): CardDef {
  const d = extra?.[slug] ?? gridCard(slug);
  if (!d) throw new GridError(`Unknown card ${slug}`);
  return d;
}

// --- Tiles -------------------------------------------------------------------

export const tileXY = (b: Pick<GridBoard, 'width'>, t: number): [number, number] => [t % b.width, Math.floor(t / b.width)];
export const tileOf = (b: Pick<GridBoard, 'width' | 'height'>, x: number, y: number): number =>
  (x < 0 || y < 0 || x >= b.width || y >= b.height ? -1 : y * b.width + x);

const DIRS8: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const DIRS4: [number, number][] = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const DIAG: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

const NEIGHBOURS = new Map<string, number[][]>();

/** A tile's neighbours (8 or orthogonal 4), cached per board shape. Do not mutate the result. */
export function neighbours(b: Pick<GridBoard, 'width' | 'height'>, t: number, n: 4 | 8 = 8): number[] {
  const key = `${b.width}x${b.height}:${n}`;
  let table = NEIGHBOURS.get(key);
  if (!table) {
    table = [];
    for (let i = 0; i < b.width * b.height; i++) {
      const [x, y] = tileXY(b, i);
      const out: number[] = [];
      for (const [dx, dy] of n === 8 ? DIRS8 : DIRS4) {
        const u = tileOf(b, x + dx, y + dy);
        if (u >= 0) out.push(u);
      }
      table.push(out);
    }
    NEIGHBOURS.set(key, table);
  }
  return table[t];
}

/** Chebyshev distance: king steps. */
export function distance(b: Pick<GridBoard, 'width'>, a: number, c: number): number {
  const [ax, ay] = tileXY(b, a);
  const [cx, cy] = tileXY(b, c);
  return Math.max(Math.abs(ax - cx), Math.abs(ay - cy));
}

export const isAdjacent = (b: Pick<GridBoard, 'width'>, a: number, c: number) => a !== c && distance(b, a, c) === 1;

/** Tile -> unit standing there. */
export function occupancy(b: Pick<GridBoard, 'width' | 'height' | 'units'>): (GridUnit | undefined)[] {
  const occ: (GridUnit | undefined)[] = new Array(b.width * b.height);
  for (const u of b.units) occ[u.tile] = u;
  return occ;
}

export const unitAt = (b: Pick<GridBoard, 'units'>, t: number) => b.units.find(u => u.tile === t);
export const unitById = (b: Pick<GridBoard, 'units'>, uid: string) => b.units.find(u => u.uid === uid);
export const hqSideAt = (b: Pick<GridBoard, 'hq'>, t: number): Side | null => (b.hq[0] === t ? 0 : b.hq[1] === t ? 1 : null);
export const nodeAt = (b: Pick<GridBoard, 'nodes'>, t: number) => b.nodes.find(n => n.tile === t);

/** The back row a side deploys onto: side 0 the bottom row, side 1 the top. */
export const backRow = (b: Pick<GridBoard, 'height'>, side: Side) => (side === 0 ? b.height - 1 : 0);

// --- Units -------------------------------------------------------------------

/** A card's speed: a quarter of cards fast (+1 range), a quarter slow (-1), rolled from its slug. */
export function gridSpeed(def: Pick<CardDef, 'slug' | 'tier'>, g: GridConfig = GRID): -1 | 0 | 1 {
  if (!g.speed || def.tier === 'token') return 0;
  const roll = (hash(`speed:${def.slug}`) % 1000) / 1000;
  return roll < g.fastShare ? 1 : roll < 2 * g.fastShare ? -1 : 0;
}

/** A card's health on the grid: scaled, and paying for (or paid for) its speed. */
export function gridHealth(def: CardDef, g: GridConfig = GRID): number {
  return Math.max(1, Math.round(def.health * g.healthMult) - gridSpeed(def, g) * g.speedHealth);
}

export function elementOf(_b: Pick<GridBoard, 'extraDefs'>, u: Pick<GridUnit, 'element'>): Element {
  return u.element;
}

/** How far a unit moves: its element's range, adjusted by its speed, never below 1. */
export function moveRange(el: Element, speed: number, g: GridConfig = GRID): number {
  if (g.movement === 'uniform') return 2;
  return Math.max(1, g.range[el] + speed);
}

export const isRanged = (u: Pick<GridUnit, 'keywords'>) => u.keywords.includes('ranged');

// --- Movement ------------------------------------------------------------------

export interface MoveOption {
  to: number;
  /** Tiles entered in order, ending at `to` (air: the landing tile only). */
  path: number[];
  /** A Guard's zone of control ended the move here. */
  stopped: boolean;
}

/** Tiles next to a visible enemy Guard: entering one ends a move. */
function zoneOfControl(b: GridBoard, side: Side): Set<number> {
  const z = new Set<number>();
  for (const g of b.units) {
    if (g.side === side || !g.keywords.includes('guard') || g.health <= 0) continue;
    for (const t of neighbours(b, g.tile)) z.add(t);
  }
  return z;
}

/**
 * Where a unit can move this order, with the path to each tile. Rules
 * (README "Movement"): earth 1 king step; thunder a straight orthogonal line;
 * air a diagonal line, flying over units and mountains, landing on an empty
 * tile; fire king steps; water 1 king step, or a run through water tiles.
 * Mountains, units and HQs block everyone but Air. Entering water ends a
 * move except for Water. Entering a tile next to an enemy Guard ends a move.
 */
export function moveOptions(b: GridBoard, u: GridUnit): MoveOption[] {
  const el = elementOf(b, u);
  const occ = occupancy(b);
  const zoc = zoneOfControl(b, u.side);
  const free = (t: number) => t >= 0 && b.terrain[t] !== 'mountain' && !occ[t] && b.hq[0] !== t && b.hq[1] !== t;
  const out = new Map<number, MoveOption>();
  const g = rulesOf(b);
  const range = moveRange(el, u.speed, g);
  const [x0, y0] = tileXY(b, u.tile);
  // Does a move that has just entered `t` have to stop there?
  const stops = (t: number, swimmer: boolean) => zoc.has(t) || (!swimmer && b.terrain[t] === 'water');

  const bfs = (dirs: 4 | 8, maxSteps: number, swimmer: boolean, canContinue: (t: number) => boolean) => {
    const seen = new Map<number, number[]>([[u.tile, []]]);
    let frontier = [u.tile];
    for (let step = 1; step <= maxSteps && frontier.length; step++) {
      const next: number[] = [];
      for (const t of frontier) {
        if (t !== u.tile && (stops(t, swimmer) || !canContinue(t))) continue;
        for (const v of neighbours(b, t, dirs)) {
          if (seen.has(v) || !free(v)) continue;
          const path = [...seen.get(t)!, v];
          seen.set(v, path);
          if (!out.has(v)) out.set(v, { to: v, path, stopped: zoc.has(v) });
          next.push(v);
        }
      }
      frontier = next;
    }
  };

  if (g.movement === 'uniform') {
    bfs(4, 2, false, () => true);
  } else if (el === 'earth' || el === 'fire') {
    bfs(8, range, false, () => true);
  } else if (el === 'water') {
    // One king step anywhere; from a water tile the unit may keep going, up to its river range.
    bfs(8, Math.max(1, range), true, t => b.terrain[t] === 'water');
  } else if (el === 'thunder') {
    for (const [dx, dy] of DIRS4) {
      const path: number[] = [];
      for (let d = 1; d <= range; d++) {
        const t = tileOf(b, x0 + dx * d, y0 + dy * d);
        if (!free(t)) break;
        path.push(t);
        out.set(t, { to: t, path: path.slice(), stopped: zoc.has(t) });
        if (stops(t, false)) break;
      }
    }
  } else {
    // Air flies: only the landing tile matters.
    for (const [dx, dy] of DIAG) {
      for (let d = 1; d <= range; d++) {
        const t = tileOf(b, x0 + dx * d, y0 + dy * d);
        if (t < 0) break;
        if (free(t)) out.set(t, { to: t, path: [t], stopped: false });
      }
    }
    // GRID.airStep: Air may also step orthogonally (walking, so blocked like anyone), which frees it from one colour of the board.
    if (g.airStep > 0) {
      for (const [dx, dy] of DIRS4) {
        const path: number[] = [];
        for (let d = 1; d <= g.airStep; d++) {
          const t = tileOf(b, x0 + dx * d, y0 + dy * d);
          if (!free(t)) break;
          path.push(t);
          if (!out.has(t)) out.set(t, { to: t, path: path.slice(), stopped: zoc.has(t) });
          if (stops(t, false)) break;
        }
      }
    }
  }
  return [...out.values()];
}

// --- Attacks -------------------------------------------------------------------

export type AttackTarget = { tile: number; unit?: string; hq?: Side };

/** A tile an enemy can target: a visible enemy unit, or the enemy HQ. */
function enemyTarget(b: GridBoard, occ: (GridUnit | undefined)[], side: Side, t: number): AttackTarget | null {
  const v = occ[t];
  if (v && v.side !== side && !v.stealth && v.health > 0) return { tile: t, unit: v.uid };
  const h = hqSideAt(b, t);
  if (h !== null && h !== side) return { tile: t, hq: h };
  return null;
}

/**
 * What a unit standing on `from` can attack. Melee: an adjacent tile (the
 * eight neighbours, or orthogonal only when GRID.adjacency is 4). Ranged: a
 * straight line in any of 8 directions up to GRID.rangedReach, every tile
 * between clear (no unit, HQ or mountain).
 */
export function attackTargets(b: GridBoard, u: Pick<GridUnit, 'side' | 'keywords' | 'power' | 'uid'>, from: number): AttackTarget[] {
  if (u.power <= 0) return [];
  const g = rulesOf(b);
  const occ = occupancy(b);
  const out: AttackTarget[] = [];
  if (isRanged(u)) {
    const [x0, y0] = tileXY(b, from);
    for (const [dx, dy] of DIRS8) {
      for (let d = 1; d <= g.rangedReach; d++) {
        const t = tileOf(b, x0 + dx * d, y0 + dy * d);
        if (t < 0 || b.terrain[t] === 'mountain') break;
        const hit = enemyTarget(b, occ, u.side, t);
        if (hit) out.push(hit);
        const blocked = (occ[t] && occ[t]!.uid !== u.uid) || hqSideAt(b, t) !== null;
        if (blocked) break;
      }
    }
    return withHqReach(b, u.side, from, out);
  }
  for (const t of neighbours(b, from, g.adjacency)) {
    const hit = enemyTarget(b, occ, u.side, t);
    if (hit) out.push(hit);
  }
  return withHqReach(b, u.side, from, out);
}

/** GRID.hqReach: the enemy HQ is a big target, attackable from this many tiles away (Chebyshev). */
function withHqReach(b: GridBoard, side: Side, from: number, out: AttackTarget[]): AttackTarget[] {
  const foe = other(side);
  const reach = rulesOf(b).hqReach;
  if (reach > 1 && !out.some(t => t.hq === foe) && distance(b, from, b.hq[foe]) <= reach) out.push({ tile: b.hq[foe], hq: foe });
  return out;
}

/** The tile straight behind `target` as seen from `from` (Pierce), or -1. */
export function behind(b: GridBoard, from: number, target: number): number {
  const [fx, fy] = tileXY(b, from);
  const [tx, ty] = tileXY(b, target);
  return tileOf(b, tx + Math.sign(tx - fx), ty + Math.sign(ty - fy));
}

/** Other friendly units next to the target: flanking bonus for an attack by `attacker`. */
export function flankBonus(b: GridBoard, side: Side, attackerUid: string, target: number): number {
  const g = rulesOf(b);
  if (g.flank <= 0) return 0;
  let n = 0;
  for (const v of b.units) if (v.side === side && v.uid !== attackerUid && v.health > 0 && isAdjacent(b, v.tile, target)) n++;
  return Math.min(g.flankCap, n * g.flank);
}

// --- Nodes and connection ------------------------------------------------------

/**
 * A side's network: every tile linked to its HQ by a chain of orthogonally
 * adjacent tiles, each holding one of its units or one of its nodes (a node
 * with an enemy unit standing on it does not count). Returns the tiles
 * reached and the node tiles among them, sorted.
 */
export function network(b: GridBoard, side: Side): { tiles: Set<number>; nodes: number[] } {
  const occ = occupancy(b);
  const own = new Set(b.nodes.filter(n => n.owner === side).map(n => n.tile));
  const pass = (t: number) => {
    const v = occ[t];
    if (v) return v.side === side;
    return own.has(t);
  };
  const seen = new Uint8Array(b.width * b.height);
  seen[b.hq[side]] = 1;
  const queue = [b.hq[side]];
  while (queue.length) {
    const t = queue.pop()!;
    for (const v of neighbours(b, t, 4)) {
      if (seen[v] || !pass(v)) continue;
      seen[v] = 1;
      queue.push(v);
    }
  }
  const tiles = new Set<number>();
  for (let i = 0; i < seen.length; i++) if (seen[i]) tiles.add(i);
  const nodes = [...own].filter(t => seen[t]).sort((x, y) => x - y);
  return { tiles, nodes };
}

/** The side's nodes connected to its HQ (tiles, sorted). */
export function connectedNodes(b: GridBoard, side: Side): number[] {
  if (!b.nodes.some(n => n.owner === side)) return [];
  return network(b, side).nodes;
}

/** Armour an HQ has grown from the damage it has taken (GRID.armourGrowth): +1 per armourGrowth health lost. */
export function armourGrown(b: Pick<GridBoard, 'cfg' | 'players'>, side: Side): number {
  const g = rulesOf(b);
  const hp = b.players?.[side]?.hp;
  if (g.armourGrowth <= 0 || hp === undefined) return 0;
  return Math.floor(Math.max(0, g.hqHp - hp) / g.armourGrowth);
}

/** Damage an HQ ignores per hit: GRID.armourPerNode for each connected node, plus what it has grown (GRID.armourGrowth). */
export const hqArmour = (b: GridBoard, side: Side) => rulesOf(b).armourPerNode * connectedNodes(b, side).length + armourGrown(b, side);

// --- Territory score (rules v3) ----------------------------------------------------

/** Is the territory score on (GRID.scoreTarget > 0)? */
export const scoring = (b: { cfg?: GridConfig } | undefined) => rulesOf(b).scoreTarget > 0;

/** A side's score so far (0 in games without one). */
export const scoreOf = (p: { score?: number } | undefined) => p?.score ?? 0;

/** Is the tile on `side`'s enemy's half of the board (past the middle row)? */
export function onEnemyHalf(b: Pick<GridBoard, 'width' | 'height'>, side: Side, t: number): boolean {
  const y = Math.floor(t / b.width);
  return side === 0 ? 2 * y < b.height - 1 : 2 * y > b.height - 1;
}

/**
 * What one node is worth to `side` when it scores: the city GRID.scoreCity,
 * a node on the enemy's half GRID.scoreFar, any other GRID.scoreNode, plus
 * the objective's bonus while it is the objective.
 */
export function nodeScore(b: Pick<GridBoard, 'cfg' | 'objective' | 'width' | 'height' | 'turn'>, n: Pick<GridNode, 'tile' | 'city'>, side: Side): { n: number; objective: boolean } {
  const g = rulesOf(b);
  const objective = !!b.objective && b.objective.tile === n.tile && g.objectiveEvery > 0;
  const base = n.city ? g.scoreCity : onEnemyHalf(b, side, n.tile) ? g.scoreFar : g.scoreNode;
  return { n: base + (base > 0 ? rampOf(b) : 0) + (objective ? g.objectiveBonus : 0), objective };
}

/** Rising stakes (GRID.scoreRamp): what every scoring node adds now, +1 per scoreRamp rounds played. */
export function rampOf(b: Pick<GridBoard, 'cfg' | 'turn'>): number {
  const r = rulesOf(b).scoreRamp;
  return r > 0 ? Math.floor((Math.ceil(Math.max(1, b.turn) / 2) - 1) / r) : 0;
}

/**
 * The nodes that would score for `side` now, with their points: the nodes it
 * holds, connected to its HQ when GRID.scoreConnected. Empty when the score is off.
 */
export function scoringNodes(b: GridBoard, side: Side): { tile: number; n: number; objective?: boolean }[] {
  const g = rulesOf(b);
  if (g.scoreTarget <= 0) return [];
  const tiles = g.scoreConnected ? connectedNodes(b, side) : b.nodes.filter(n => n.owner === side).map(n => n.tile);
  const out: { tile: number; n: number; objective?: boolean }[] = [];
  for (const t of tiles) {
    const v = nodeScore(b, nodeAt(b, t)!, side);
    if (v.n > 0) out.push({ tile: t, n: v.n, ...(v.objective ? { objective: true } : {}) });
  }
  // GRID.scoreBehind: the side behind on score gets its bonus on its first scoring node.
  if (g.scoreBehind > 0 && out.length && b.players && scoreOf(b.players[side]) < scoreOf(b.players[side === 0 ? 1 : 0])) out[0] = { ...out[0], n: out[0].n + g.scoreBehind };
  return out;
}

/** Points `side` would score now (the sum of scoringNodes). */
export function scoreRate(b: GridBoard, side: Side): number {
  let n = 0;
  for (const x of scoringNodes(b, side)) n += x.n;
  return n;
}

/** What a hit of n on the side's HQ actually does, after armour. */
export function armouredDamage(b: GridBoard, side: Side, n: number): number {
  if (n <= 0) return 0;
  return Math.max(Math.min(n, rulesOf(b).armourMin), n - hqArmour(b, side));
}

/**
 * Where a side may deploy: its back row (not the HQ, not a mountain), and
 * tiles next to a node it holds that is connected to its HQ. Empty tiles only.
 */
export function deployTiles(b: GridBoard, side: Side): { tile: number; forward: boolean }[] {
  if (atUnitCap(b, side)) return [];
  const occ = occupancy(b);
  // GRID.contested: a tile next to an enemy unit cannot take a deploy.
  const contested = new Set<number>();
  if (rulesOf(b).contested) for (const e of b.units) if (e.side !== side) for (const t of neighbours(b, e.tile)) contested.add(t);
  const ok = (t: number) => t >= 0 && !occ[t] && b.terrain[t] !== 'mountain' && hqSideAt(b, t) === null && !contested.has(t);
  const out = new Map<number, boolean>();
  const y = backRow(b, side);
  for (let x = 0; x < b.width; x++) { const t = tileOf(b, x, y); if (ok(t)) out.set(t, false); }
  for (const n of connectedNodes(b, side)) for (const t of neighbours(b, n)) if (ok(t) && !out.has(t)) out.set(t, true);
  return [...out.entries()].sort((a, c) => a[0] - c[0]).map(([tile, forward]) => ({ tile, forward }));
}

/** Reinforcements (GRID.reinforceGap): the side has at least that many fewer units on the board than its enemy. */
export function reinforced(b: Pick<GridBoard, 'units' | 'cfg'>, side: Side): boolean {
  const g = rulesOf(b);
  if (g.reinforceDiscount <= 0 && !g.reinforceReady) return false;
  let gap = 0;
  for (const u of b.units) gap += u.side === side ? -1 : 1;
  return gap >= Math.max(1, g.reinforceGap);
}

/** GRID.outnumbered: extra attack damage for a side with fewer units on the board than its enemy. */
export function outnumberedBonus(b: Pick<GridBoard, 'units' | 'cfg'>, side: Side): number {
  const n = rulesOf(b).outnumbered;
  if (n <= 0) return 0;
  let gap = 0;
  for (const u of b.units) gap += u.side === side ? -1 : 1;
  return gap > 0 ? n : 0;
}

/** GRID.maxUnits: the side already has as many units as it may. */
export const atUnitCap = (b: Pick<GridBoard, 'units' | 'cfg'>, side: Side) => {
  const max = rulesOf(b).maxUnits;
  return max > 0 && b.units.filter(u => u.side === side).length >= max;
};

/** Can the unit start an order now (its side's turn, not acted, not frozen, not just arrived unless Rush)? */
export function canStartOrder(b: GridBoard, u: GridUnit): boolean {
  return u.side === b.active && !u.acted && b.turn > u.frozenUntil && (!u.fresh || u.keywords.includes('rush'));
}

/** The share of damage a braced unit takes: GRID.braceTaken, or GRID.autoBraceTaken in the free stance. */
export const braceShare = (b: Pick<GridBoard, 'cfg'>, u: Pick<GridUnit, 'stance'>) => (u.stance ? rulesOf(b).autoBraceTaken : rulesOf(b).braceTaken);

/** A braced unit: takes braceShare of the damage until its side's next turn. */
export const isBraced = (b: Pick<GridBoard, 'turn'>, u: Pick<GridUnit, 'bracedUntil'>) => b.turn <= u.bracedUntil;
export const isFrozen = (b: Pick<GridBoard, 'turn'>, u: Pick<GridUnit, 'frozenUntil'>) => b.turn <= u.frozenUntil;
