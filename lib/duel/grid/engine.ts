// Warfront rules engine. Pure like the duel and war engines: applyGridAction
// returns a new state and never touches the one it was given.
//
// Rules in brief (full text in README.md here; every number is a knob in
// config.ts):
//   - A 7x7 (or 5x5) board, point-symmetric. Each side has an HQ in the
//     middle of its back row; the rest of that row is its deploy zone.
//   - Turns alternate. Upkeep: emeralds, a card, perks, and the HQ fires at
//     one adjacent enemy. Then up to GRID.orders orders: one unit moves (its
//     element's pattern) and may then attack, use its move ability or brace;
//     the tank (HQ) ability is an order too. Deploying costs emeralds, not
//     an order. Then end turn.
//   - Melee defenders that survive strike back. Flanking adds damage.
//   - Ending your turn on a node with no enemy next to it claims it. A node
//     linked to your HQ by an orthogonal chain of your units and nodes is
//     connected: +1 emerald a turn, forward deploys next to it, and +1 HQ
//     armour. Destroy the enemy HQ to win.
//   - Rules v3 (GRID.scoreTarget): at the start of your turn each connected
//     node you hold scores a point (the city more, the rotating objective
//     more); reach the target score to win. At the turn limit the higher
//     score wins, then HQ health.
//
// Effect remapping (duel effect target -> grid):
//   | duel target        | grid                                                      |
//   |--------------------|-----------------------------------------------------------|
//   | chosen 'enemy'     | a visible enemy unit or the enemy HQ (tile)               |
//   | chosen 'ally'      | one of your units or your HQ                              |
//   | chosen *_unit      | a unit (enemies: visible ones only)                       |
//   |   (range)          | within GRID.effectRange of the source (0 = anywhere)      |
//   | self               | the source unit                                           |
//   | enemy_hero         | the enemy HQ (armour applies)                             |
//   | ally_hero          | your HQ                                                   |
//   | all_enemy_units    | every enemy unit on the board                             |
//   | all/other_ally     | your units (other: not the source)                        |
//   | all_other_units    | every unit but the source                                 |
//   | random_enemy(_unit)| a random enemy unit (or the enemy HQ)                     |
//   | chain n            | n times 1 damage to random_enemy                          |
//   | summon             | an empty tile next to the source, nearest the enemy HQ   |
//   | tide n             | n emeralds (bank cap applies)                             |
//   | freeze             | cannot act (or strike back) through its side's next turn  |
//   | bounce             | back to its owner's hand (tokens vanish)                  |
// Keywords: Guard = zone of control (moving next to it ends a move); Rush
// acts the turn it arrives; Ranged hits in a line up to 2 away and is never
// struck back; Stealth cannot be targeted until it attacks or uses its
// ability, or an enemy ends a move next to it; Shield soaks the first hit;
// Drain heals your HQ by the attack damage it deals; Pierce also hits
// whatever enemy stands straight behind the target; Regen heals 2 at the
// start of your turn.

import { Rng } from '../rng';
import { tankAbility, tankElement } from '../rules';
import type { Ability, CardDef, Effect, EffectTarget, Side, TargetSpec } from '../types';
import { TERRITORIES } from '../war/config';
import type { Territory } from '../war/types';
import {
  armouredDamage, atUnitCap, attackTargets, backRow, behind, canStartOrder, connectedNodes, deployTiles, distance, flankBonus, gridDef,
  GridError, gridHealth, gridSpeed, hqSideAt, isAdjacent, isBraced, isFrozen, isRanged, moveOptions, neighbours, nodeAt,
  occupancy, other, braceShare, outnumberedBonus, reinforced, rulesOf, scoreOf, scoringNodes, tileOf, tileXY, unitById, type GridBoard,
} from './board';
import { gridCard } from './cards';
import { GRID, GRID_PRESETS, GRID_RULES_VERSION, gridEmeraldCost, gridMoveCost, gridRulesFor, type GridConfig } from './config';
import { LAYOUTS, type LayoutDef } from './layouts';
import type {
  GridAction, GridEndReason, GridEvent, GridNode, GridPlayer, GridState, GridUnit, HitRef, Terrain,
} from './types';

export { GridError, other } from './board';

export const moveOf = (d: CardDef) => d.abilities.find(a => a.when === 'move');
export const playOf = (d: CardDef) => d.abilities.find(a => a.when === 'play');

/** The tank's (HQ) ability with its cost in emeralds. */
export function gridHqAbility(p: Pick<GridPlayer, 'tank'>, g: GridConfig = GRID): Ability {
  const a = tankAbility(p.tank);
  return { ...a, cost: gridEmeraldCost(a.cost ?? 0, g) };
}

/** A unit's move ability cost in emeralds. */
export function abilityCost(def: CardDef, g: GridConfig = GRID): number {
  return gridMoveCost(moveOf(def)?.cost ?? 0, g);
}

/** The discount on `side`'s cards now: setback (its own turn only) and reinforcements (fewer units on the board). */
export function deployDiscount(b: Pick<GridBoard, 'cfg' | 'active' | 'units'> & { setback?: boolean }, side: Side): number {
  const g = rulesOf(b);
  let d = 0;
  if (b.setback && g.setbackDiscount > 0 && side === b.active) d += g.setbackDiscount;
  if (g.reinforceDiscount > 0 && reinforced(b, side)) d += g.reinforceDiscount;
  return d;
}

/**
 * What a hand card costs `side` (default: the side to move) to deploy now,
 * in emeralds: its price less deployDiscount, never below 1.
 */
export const cardCost = (b: Pick<GridBoard, 'extraDefs' | 'cfg' | 'active' | 'units'> & { setback?: boolean }, slug: string, side?: Side) => {
  const full = gridEmeraldCost(gridDef(slug, b.extraDefs).cost, rulesOf(b));
  const d = deployDiscount(b, side ?? b.active);
  return d > 0 ? Math.max(Math.min(full, 1), full - d) : full;
};

// --- Setup ---------------------------------------------------------------------

export interface GridSetup {
  name: string;
  avatar: string;
  deck: string[];
  tank?: CardDef['element'];
}

export interface GridOptions {
  size?: 5 | 7;
  layout?: string;
}

/** Parse a layout into terrain, node tiles and the two HQ tiles. */
export function parseLayout(l: LayoutDef): { width: number; height: number; terrain: Terrain[]; nodes: { tile: number; city: boolean }[]; hq: [number, number] } {
  const height = l.rows.length;
  const width = l.rows[0].length;
  const terrain: Terrain[] = [];
  const nodes: { tile: number; city: boolean }[] = [];
  const hq: number[] = [];
  l.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const t = y * width + x;
    terrain.push(ch === 'm' ? 'mountain' : ch === '~' ? 'water' : 'plain');
    if (ch === 'n' || ch === 'c') nodes.push({ tile: t, city: ch === 'c' });
    if (ch === 'H') hq.push(t);
  }));
  // hq[0] is side 0's, on the bottom row.
  return { width, height, terrain, nodes, hq: [Math.max(...hq), Math.min(...hq)] };
}

export function findLayout(size: 5 | 7, name: string): LayoutDef | undefined {
  return LAYOUTS[size].find(l => l.name.toLowerCase() === name.toLowerCase());
}

/**
 * Real territories for the nodes: a city for the city node, and for each
 * point-symmetric pair two territories with the same resource, so the
 * perks are mirrored too.
 */
function nameNodes(rng: Rng, width: number, height: number, raw: { tile: number; city: boolean }[]): GridNode[] {
  const pool = rng.shuffle(TERRITORIES.filter(t => t.resource).slice());
  const used = new Set<string>();
  const take = (f: (t: Territory) => boolean): Territory => {
    const t = pool.find(x => !used.has(x.name) && f(x)) ?? pool.find(x => !used.has(x.name))!;
    used.add(t.name);
    return t;
  };
  const mirror = (t: number) => width * height - 1 - t;
  const out = new Map<number, GridNode>();
  for (const n of raw) {
    if (out.has(n.tile)) continue;
    if (n.city) {
      const t = take(x => x.city);
      out.set(n.tile, { tile: n.tile, name: t.name, city: true, resource: t.resource, owner: null });
      continue;
    }
    const a = take(x => !x.city);
    const b = take(x => !x.city && x.resource === a.resource);
    out.set(n.tile, { tile: n.tile, name: a.name, city: false, resource: a.resource, owner: null });
    const m = mirror(n.tile);
    if (raw.some(r => r.tile === m)) out.set(m, { tile: m, name: b.name, city: false, resource: a.resource, owner: null });
  }
  return [...out.values()].sort((x, y) => x.tile - y.tile);
}

export function createGrid(seed: number, setups: [GridSetup, GridSetup], extraDefs?: Record<string, CardDef>, opts: GridOptions = {}): GridState {
  const rng = new Rng(seed >>> 0);
  const size = opts.size ?? GRID.size;
  // A size with its own preset keeps its whole config in the state (GridState.cfg).
  const cfg = Object.keys(GRID_PRESETS[size] ?? {}).length ? gridRulesFor(size) : undefined;
  const G = cfg ?? GRID;
  const want = opts.layout ?? G.layout;
  const layout = (want && findLayout(size, want)) || rng.pick(LAYOUTS[size]);
  const board = parseLayout(layout);
  const nodes = nameNodes(rng, board.width, board.height, board.nodes);
  let uid = 1;
  const def = (slug: string) => extraDefs?.[slug] ?? gridCard(slug);
  const players = setups.map(p => {
    const deck = rng.shuffle(p.deck.map(slug => ({ uid: `c${uid++}`, slug })));
    const player: GridPlayer = {
      name: p.name, avatar: p.avatar,
      tank: p.tank ?? tankElement(p.deck.map(s => def(s)!).filter(Boolean)),
      hp: G.hqHp, emeralds: G.startEmeralds, deck, hand: deck.splice(0, G.startHand), graveyard: [], mulliganed: false, timeouts: 0,
      ...(G.scoreTarget > 0 ? { score: 0 } : {}),
    };
    return player;
  }) as [GridPlayer, GridPlayer];
  const first = rng.int(2) as Side;
  players[other(first)].emeralds += G.secondBonus;
  const s: GridState = {
    rules: GRID_RULES_VERSION, rng: rng.state, phase: 'mulligan', turn: 0, active: first, first,
    width: board.width, height: board.height, layout: layout.name, terrain: board.terrain, nodes, hq: board.hq,
    players, units: [], ordersLeft: 0, pending: null, hqUsed: false,
    winner: null, endReason: null, nextUid: uid, log: [{ k: 'start', first, layout: layout.name }], logBase: 0,
  };
  if (extraDefs && Object.keys(extraDefs).length) s.extraDefs = extraDefs;
  if (cfg) s.cfg = cfg;
  return s;
}

// --- Context -------------------------------------------------------------------

class Ctx {
  rng: Rng;
  /** Units destroyed by surround capture (their death event says so). */
  captured = new Set<string>();
  /** The rules this game plays under (its stored preset, else GRID). */
  g: GridConfig;
  constructor(public s: GridState) { this.rng = new Rng(s.rng); this.g = rulesOf(s); }
  def(slug: string) { return gridDef(slug, this.s.extraDefs); }
  log(e: GridEvent) { if (!this.s.quiet) this.s.log.push(e); }
  uid() { return `c${this.s.nextUid++}`; }
  finish(): GridState {
    this.s.rng = this.rng.state;
    if (this.s.log.length > 600) {
      const drop = this.s.log.length - 600;
      this.s.log = this.s.log.slice(drop);
      this.s.logBase += drop;
    }
    return this.s;
  }
}

/** A copy safe to mutate. Keyword arrays are shared: the engine replaces them, never edits them. */
export function cloneGrid(s: GridState): GridState {
  const p = (x: GridPlayer): GridPlayer => ({ ...x, deck: x.deck.slice(), hand: x.hand.slice(), graveyard: x.graveyard.slice() });
  return {
    ...s, players: [p(s.players[0]), p(s.players[1])], units: s.units.map(u => ({ ...u })),
    nodes: s.nodes.map(n => ({ ...n })), log: s.quiet ? s.log : s.log.slice(),
  };
}

function makeUnit(def: CardDef, uid: string, side: Side, tile: number, g: GridConfig): GridUnit {
  const health = gridHealth(def, g);
  return {
    uid, slug: def.slug, side, element: def.element, tile, power: def.power, health, maxHealth: health, keywords: def.keywords,
    speed: gridSpeed(def, g), shield: def.keywords.includes('shield'), stealth: def.keywords.includes('stealth'),
    frozenUntil: 0, acted: false, fresh: true, bracedUntil: 0, aura: 0, boost: 0,
  };
}

// --- Primitives --------------------------------------------------------------------

type Hit = { unit: GridUnit } | { hq: Side };

const hitRef = (h: Hit): HitRef => ('unit' in h ? { unit: h.unit.uid } : { hq: h.hq });
const hitTile = (s: GridState, h: Hit) => ('unit' in h ? h.unit.tile : s.hq[h.hq]);

/** Deal n damage; returns what got through. */
function damage(c: Ctx, h: Hit, n: number): number {
  if (n <= 0) return 0;
  const s = c.s;
  if ('hq' in h) {
    const p = s.players[h.hq];
    if (p.hp <= 0) return 0;
    const got = armouredDamage(s, h.hq, n);
    p.hp -= got;
    c.log({ k: 'damage', target: { hq: h.hq }, tile: s.hq[h.hq], n: got, hp: p.hp, ...(got < n ? { armour: n - got } : {}) });
    // GRID.scoreHq: every scoreHq damage on an HQ scores a point for its enemy.
    if (c.g.scoreTarget > 0 && c.g.scoreHq > 0 && got > 0) {
      const lost = (hp: number) => Math.floor(Math.max(0, c.g.hqHp - Math.max(0, hp)) / c.g.scoreHq);
      const pts = lost(p.hp) - lost(p.hp + got);
      if (pts > 0) {
        const foe = s.players[other(h.hq)];
        foe.score = scoreOf(foe) + pts;
        c.log({ k: 'score', side: other(h.hq), n: pts, total: foe.score, nodes: [], hq: true });
      }
    }
    return got;
  }
  const u = h.unit;
  if (u.health <= 0) return 0;
  const braced = isBraced(s, u);
  if (braced) n = Math.floor(n * braceShare(s, u));
  if (n <= 0) return 0;
  if (u.shield) {
    u.shield = false;
    c.log({ k: 'shield', uid: u.uid });
    return 0;
  }
  u.health -= n;
  c.log({ k: 'damage', target: { unit: u.uid }, tile: u.tile, n, hp: u.health, ...(braced ? { braced } : {}) });
  return n;
}

function heal(c: Ctx, h: Hit, n: number) {
  const s = c.s;
  if ('hq' in h) {
    const p = s.players[h.hq];
    const got = Math.min(Math.floor(n * c.g.hqHealShare), c.g.hqHp - p.hp);
    if (got <= 0 || p.hp <= 0) return;
    p.hp += got;
    c.log({ k: 'heal', target: { hq: h.hq }, tile: s.hq[h.hq], n: got, hp: p.hp });
    return;
  }
  const u = h.unit;
  const got = Math.min(Math.round(n * c.g.healthMult), u.maxHealth - u.health);
  if (got <= 0 || u.health <= 0) return;
  u.health += got;
  c.log({ k: 'heal', target: { unit: u.uid }, tile: u.tile, n: got, hp: u.health });
}

function draw(c: Ctx, side: Side, n: number) {
  const p = c.s.players[side];
  let got = 0;
  for (let i = 0; i < n; i++) {
    // An empty deck just stops drawing; the HQs and the turn limit are the clock.
    const card = p.deck.shift();
    if (!card) break;
    if (p.hand.length >= c.g.handMax) {
      p.graveyard.push(card.slug);
      c.log({ k: 'burn', side, slug: card.slug });
      continue;
    }
    p.hand.push(card);
    got++;
  }
  if (got) c.log({ k: 'draw', side, n: got });
}

/** Units next to their own HQ get GRID.hqAura extra health; leaving takes it away (never below 1). */
function refreshAura(c: Ctx) {
  const s = c.s;
  if (c.g.hqAura <= 0 && !s.units.some(u => u.aura)) return;
  for (const u of s.units) {
    const want = c.g.hqAura > 0 && isAdjacent(s, u.tile, s.hq[u.side]) ? c.g.hqAura : 0;
    if (want === u.aura) continue;
    const d = want - u.aura;
    u.maxHealth += d;
    u.health = Math.max(u.health > 0 ? 1 : u.health, u.health + d);
    u.aura = want;
  }
}

/** An enemy unit that ends a move (or arrives) next to a stealthed unit reveals it. */
function revealAround(c: Ctx, mover: GridUnit) {
  for (const v of c.s.units) {
    if (v.side !== mover.side && v.stealth && isAdjacent(c.s, v.tile, mover.tile)) {
      v.stealth = false;
      c.log({ k: 'reveal', uid: v.uid });
    }
  }
}

/** An empty tile next to `from`, nearest the enemy HQ (ties by tile), or -1. */
function freeNear(s: GridState, from: number, side: Side): number {
  const occ = occupancy(s);
  const foeHq = s.hq[other(side)];
  const xs = neighbours(s, from).filter(t => !occ[t] && s.terrain[t] !== 'mountain' && hqSideAt(s, t) === null);
  xs.sort((a, b) => distance(s, a, foeHq) - distance(s, b, foeHq) || a - b);
  return xs[0] ?? -1;
}

interface Source { uid: string | null; side: Side; tile: number }

/** Tiles a targeted effect may name, for a source on `from` (GRID.effectRange). */
export function specTiles(b: GridBoard, side: Side, spec: TargetSpec, from: number, excludeUid?: string): number[] {
  const out: number[] = [];
  const range = rulesOf(b).effectRange;
  const inRange = (t: number) => range <= 0 || distance(b, from, t) <= range;
  const unit = (enemy: boolean) => b.units.filter(u => (enemy ? u.side !== side && !u.stealth : u.side === side) && u.uid !== excludeUid && u.health > 0);
  const add = (t: number) => { if (inRange(t) && !out.includes(t)) out.push(t); };
  if (spec === 'enemy' || spec === 'enemy_unit' || spec === 'any_unit') for (const u of unit(true)) add(u.tile);
  if (spec === 'ally' || spec === 'ally_unit' || spec === 'any_unit') for (const u of unit(false)) add(u.tile);
  if (spec === 'enemy') add(b.hq[other(side)]);
  if (spec === 'ally') add(b.hq[side]);
  return out.sort((x, y) => x - y);
}

function effectTargets(c: Ctx, src: Source, t: EffectTarget, spec: TargetSpec | undefined, chosen?: number): Hit[] {
  const s = c.s;
  const me = src.side;
  const foe = other(me);
  const units = (side: Side) => s.units.filter(u => u.side === side && u.health > 0).map(u => ({ unit: u }) as Hit);
  switch (t) {
    case 'chosen': {
      if (chosen === undefined) return [];
      const u = s.units.find(x => x.tile === chosen && x.health > 0);
      if (u) return u.side !== me && u.stealth ? [] : [{ unit: u }];
      const h = hqSideAt(s, chosen);
      if (h === null) return [];
      if ((spec === 'enemy' && h === foe) || (spec === 'ally' && h === me)) return [{ hq: h }];
      return [];
    }
    case 'self': {
      const u = src.uid ? unitById(s, src.uid) : undefined;
      return u && u.health > 0 ? [{ unit: u }] : [];
    }
    case 'enemy_hero': return [{ hq: foe }];
    case 'ally_hero': return [{ hq: me }];
    case 'all_enemy_units': return units(foe);
    case 'all_ally_units': return units(me);
    case 'other_ally_units': return units(me).filter(h => 'unit' in h && h.unit.uid !== src.uid);
    case 'all_other_units': return [...units(me), ...units(foe)].filter(h => 'unit' in h && h.unit.uid !== src.uid);
    case 'random_enemy_unit': { const xs = units(foe).filter(h => 'unit' in h && !h.unit.stealth); return xs.length ? [c.rng.pick(xs)] : []; }
    case 'random_enemy': {
      const xs: Hit[] = [...units(foe).filter(h => 'unit' in h && !h.unit.stealth), { hq: foe }];
      return [c.rng.pick(xs)];
    }
  }
}

function freeze(c: Ctx, u: GridUnit) {
  const s = c.s;
  // Through the owner's next turn: this one too if it is theirs now.
  u.frozenUntil = Math.max(u.frozenUntil, s.active === u.side ? s.turn + 2 : s.turn + 1);
  c.log({ k: 'freeze', uid: u.uid, until: u.frozenUntil });
}

function applyEffect(c: Ctx, src: Source, e: Effect, spec: TargetSpec | undefined, chosen?: number) {
  const s = c.s;
  const units = (t: EffectTarget) => effectTargets(c, src, t, spec, chosen).filter((h): h is { unit: GridUnit } => 'unit' in h);
  switch (e.k) {
    case 'damage': for (const h of effectTargets(c, src, e.t, spec, chosen)) damage(c, h, e.n); return;
    case 'heal': for (const h of effectTargets(c, src, e.t, spec, chosen)) heal(c, h, e.n); return;
    case 'buff':
      for (const { unit } of units(e.t)) {
        const hp = Math.round(e.hp * c.g.healthMult);
        unit.power += e.atk; unit.health += hp; unit.maxHealth += hp;
      }
      return;
    case 'draw': draw(c, src.side, e.n); return;
    case 'freeze': for (const { unit } of units(e.t)) freeze(c, unit); return;
    case 'bounce':
      for (const { unit } of units(e.t)) {
        const def = c.def(unit.slug);
        if (e.maxCost !== undefined && def.cost > e.maxCost) continue;
        s.units = s.units.filter(x => x !== unit);
        c.log({ k: 'bounce', uid: unit.uid, slug: unit.slug, tile: unit.tile });
        if (def.tier === 'token') continue;
        const owner = s.players[unit.side];
        if (owner.hand.length >= c.g.handMax) owner.graveyard.push(unit.slug);
        else owner.hand.push({ uid: c.uid(), slug: unit.slug });
      }
      return;
    case 'summon':
      for (let i = 0; i < e.n; i++) {
        const t = freeNear(s, src.tile, src.side);
        if (t < 0 || atUnitCap(s, src.side)) return;
        const u = makeUnit(c.def(e.token), c.uid(), src.side, t, c.g);
        s.units.push(u);
        c.log({ k: 'summon', side: src.side, uid: u.uid, slug: e.token, tile: t });
        revealAround(c, u);
      }
      return;
    case 'tide': {
      const p = s.players[src.side];
      p.emeralds = Math.min(c.g.bankCap, p.emeralds + e.n);
      return;
    }
    case 'grant':
      for (const { unit } of units(e.t)) {
        if (!unit.keywords.includes(e.kw)) unit.keywords = [...unit.keywords, e.kw];
        if (e.kw === 'shield') unit.shield = true;
        if (e.kw === 'stealth') unit.stealth = true;
      }
      return;
    case 'destroy':
      for (const { unit } of units(e.t)) if (e.maxPower === undefined || unit.power <= e.maxPower) unit.health = 0;
      return;
    case 'chain':
      for (let i = 0; i < e.n; i++) for (const h of effectTargets(c, src, 'random_enemy', undefined)) damage(c, h, 1);
      return;
  }
}

function runAbility(c: Ctx, src: Source, a: Ability, chosen?: number) {
  for (const e of a.effects) applyEffect(c, src, e, a.target, chosen);
}

function resolveDeaths(c: Ctx) {
  const s = c.s;
  for (let guard = 0; guard < 50; guard++) {
    const dead = s.units.filter(u => u.health <= 0);
    if (!dead.length) break;
    s.units = s.units.filter(u => u.health > 0);
    if (s.pending && dead.some(u => u.uid === s.pending)) s.pending = null;
    for (const u of dead) {
      const def = c.def(u.slug);
      if (def.tier !== 'token') {
        s.players[u.side].graveyard.push(u.slug);
        if (c.g.deathRebate > 0) s.players[u.side].emeralds = Math.min(c.g.bankCap, s.players[u.side].emeralds + c.g.deathRebate);
      }
      c.log({ k: 'death', side: u.side, uid: u.uid, slug: u.slug, tile: u.tile, ...(c.captured.has(u.uid) ? { captured: true } : {}) });
      for (const a of def.abilities) if (a.when === 'death') runAbility(c, { uid: null, side: u.side, tile: u.tile }, a);
    }
  }
  refreshAura(c);
}

function end(c: Ctx, winner: Side | null, reason: GridEndReason) {
  c.s.phase = 'over';
  c.s.winner = winner;
  c.s.endReason = reason;
  c.s.pending = null;
  c.log({ k: 'end', winner, reason });
}

function checkEnd(c: Ctx): boolean {
  const s = c.s;
  if (s.phase === 'over') return true;
  const dead = s.players.map(p => p.hp <= 0);
  if (dead[0] || dead[1]) { end(c, dead[0] && dead[1] ? null : dead[0] ? 1 : 0, 'hq'); return true; }
  // GRID.scoreTarget: reaching the target wins (both at once: the higher score, then the side to move).
  const T = c.g.scoreTarget;
  if (T > 0) {
    const sc = s.players.map(scoreOf);
    if (sc[0] >= T || sc[1] >= T) {
      end(c, sc[0] >= T && sc[1] >= T ? (sc[0] > sc[1] ? 0 : sc[1] > sc[0] ? 1 : s.active) : sc[0] >= T ? 0 : 1, 'score');
      return true;
    }
  }
  return false;
}

/**
 * At the turn limit. With the territory score (GRID.scoreTarget): the higher
 * score, then HQ health. Without it: most connected nodes, then HQ health.
 * Then a draw.
 */
export function judgeGrid(s: GridState): Side | null {
  const lead = rulesOf(s).scoreTarget > 0
    ? scoreOf(s.players[0]) - scoreOf(s.players[1])
    : connectedNodes(s, 0).length - connectedNodes(s, 1).length;
  const d = lead || s.players[0].hp - s.players[1].hp;
  return d > 0 ? 0 : d < 0 ? 1 : null;
}

/** Score `side`'s nodes now (GRID.scoreTarget): add their points and log them. */
function scoreNodes(c: Ctx, side: Side) {
  if (c.g.scoreTarget <= 0) return;
  const nodes = scoringNodes(c.s, side);
  let n = 0;
  for (const x of nodes) n += x.n;
  if (n <= 0) return;
  const p = c.s.players[side];
  p.score = scoreOf(p) + n;
  c.log({ k: 'score', side, n, total: p.score, nodes });
}

/** The player-turn objective number k starts on (GRID.objectiveFirst, then every objectiveEvery). */
const objectiveStart = (g: GridConfig, k: number) => Math.max(1, g.objectiveFirst) + k * g.objectiveEvery;

/**
 * The rotating objective (GRID.objectiveEvery), at the start of a turn: the
 * announced one starts when its turn comes, and the next one is named
 * objectiveWarn player-turns ahead, a node other than the current objective.
 */
function rotateObjective(c: Ctx) {
  const s = c.s;
  const g = c.g;
  if (g.objectiveEvery <= 0 || !s.nodes.length) return;
  if (s.nextObjective && s.turn >= s.nextObjective.from) {
    s.objective = s.nextObjective;
    s.nextObjective = null;
    c.log({ k: 'objective', ...s.objective });
  }
  if (s.objective && s.turn > s.objective.until) s.objective = null;
  if (s.nextObjective) return;
  let k = 0;
  while (objectiveStart(g, k) <= s.turn) k++;
  const from = objectiveStart(g, k);
  if (from - Math.max(0, g.objectiveWarn) > s.turn) return;
  const pool = s.nodes.filter(n => n.tile !== s.objective?.tile);
  const n = c.rng.pick(pool.length ? pool : s.nodes);
  s.nextObjective = { tile: n.tile, name: n.name, from, until: from + g.objectiveEvery - 1 };
  c.log({ k: 'objective', ...s.nextObjective, announced: true });
  // A warning of 0 turns: it starts at once.
  if (from <= s.turn) rotateObjective(c);
}

/** Log any change in either side's connected nodes since the last check. */
function logConnections(c: Ctx, before: [number[], number[]]) {
  if (c.s.quiet) return;
  for (const side of [0, 1] as Side[]) {
    const now = connectedNodes(c.s, side);
    if (now.join(',') !== before[side].join(',')) c.log({ k: 'connection', side, nodes: now });
  }
}

const snapshot = (s: GridState): [number[], number[]] => (s.quiet ? [[], []] : [connectedNodes(s, 0), connectedNodes(s, 1)]);

// --- Turns ---------------------------------------------------------------------

/** What an HQ with `hp` health fires for (GRID.hqFire, plus the ramp). */
export function hqFirePower(hp: number, g: GridConfig = GRID): number {
  if (g.hqFire <= 0) return 0;
  return g.hqFire + (g.hqFireRamp > 0 ? Math.floor(Math.max(0, g.hqHp - hp) / g.hqFireRamp) : 0);
}

/** Turns this side has started, counting the current one. */
export const ownTurns = (s: Pick<GridState, 'turn' | 'first'>, side: Side) => (side === s.first ? Math.ceil(s.turn / 2) : Math.floor(s.turn / 2));

/**
 * Did the enemy's last turn set this side back (GRID.setbackOn)? Compares its
 * connected nodes and HQ health now with when it last ended a turn.
 */
export function setbackOf(s: Pick<GridState, 'marks'> & GridBoard & { players: { hp: number }[] }, side: Side, g: GridConfig = rulesOf(s)): 'node' | 'hq' | null {
  if (g.setbackOn === 'off') return null;
  const m = s.marks?.[side];
  if (!m) return null;
  if ((g.setbackOn === 'node' || g.setbackOn === 'either') && connectedNodes(s, side).length < m.nodes) return 'node';
  if ((g.setbackOn === 'hq' || g.setbackOn === 'either') && m.hp - s.players[side].hp >= g.setbackHq) return 'hq';
  return null;
}

function startTurn(c: Ctx, side: Side) {
  const s = c.s;
  const before = snapshot(s);
  s.turn++;
  s.phase = 'main';
  s.active = side;
  s.pending = null;
  s.hqUsed = false;
  const sb = setbackOf(s, side, c.g);
  if (sb) s.setback = true; else delete s.setback;
  s.ordersLeft = (s.turn === 1 ? c.g.firstOrders : c.g.orders) + (c.g.rally > 0 && s.players[side].hp * 2 <= c.g.hqHp ? c.g.rally : 0)
    + (sb ? c.g.setbackOrders : 0);
  c.log({ k: 'turn', side, turn: s.turn, orders: s.ordersLeft });
  if (sb) c.log({ k: 'setback', side, reason: sb, orders: c.g.setbackOrders, emeralds: c.g.setbackEmeralds, discount: c.g.setbackDiscount });
  const p = s.players[side];
  if (c.g.lastStand > 0 && !p.stood && p.hp > 0 && p.hp <= c.g.lastStandAt * c.g.hqHp) {
    p.stood = true;
    const n = Math.min(c.g.lastStand, c.g.hqHp - p.hp);
    p.hp += n;
    c.log({ k: 'laststand', side, n, hp: p.hp });
  }
  for (const u of s.units) if (u.side === side) { u.acted = false; u.fresh = false; u.boost = 0; if (u.fought) delete u.fought; if (u.usedAbility) delete u.usedAbility; }
  const linked = connectedNodes(s, side);
  const nodes = linked.length * c.g.nodeIncome;
  let city = 0;
  if (c.g.perks) for (const t of linked) if (nodeAt(s, t)!.city) city += c.g.perk.city;
  const behind = c.g.catchUp > 0 && linked.length < connectedNodes(s, other(side)).length ? c.g.catchUp : 0;
  const base = c.g.income + (c.g.incomeStep > 0 ? Math.floor((ownTurns(s, side) - 1) / c.g.incomeStep) : 0) + behind
    + (sb ? c.g.setbackEmeralds : 0);
  const got = Math.min(c.g.bankCap - p.emeralds, base + nodes + city);
  p.emeralds += Math.max(0, got);
  c.log({ k: 'income', side, n: Math.max(0, got), base, nodes, city });
  // Territory score (GRID.scoreWhen 'start'): the nodes this side held through the enemy's turn.
  rotateObjective(c);
  if (c.g.scoreWhen === 'start') {
    scoreNodes(c, side);
    if (checkEnd(c)) return;
  }
  if (s.turn > 1) draw(c, side, c.g.draw);
  if (c.g.perks) {
    for (const t of linked) {
      const n = nodeAt(s, t)!;
      const on = s.units.find(u => u.tile === t && u.side === side);
      if (n.city) c.log({ k: 'perk', side, tile: t, perk: 'city' });
      if (!n.resource) continue;
      if (n.resource === 'ore' && on && c.g.perk.ore) { on.boost += c.g.perk.ore; c.log({ k: 'perk', side, tile: t, perk: 'ore', uid: on.uid }); }
      if (n.resource === 'crops' && on && c.g.perk.crops) { c.log({ k: 'perk', side, tile: t, perk: 'crops', uid: on.uid }); heal(c, { unit: on }, c.g.perk.crops); }
      if (n.resource === 'fish' && c.g.perk.fish && ownTurns(s, side) % Math.max(1, c.g.fishEvery) === 0) { c.log({ k: 'perk', side, tile: t, perk: 'fish' }); draw(c, side, c.g.perk.fish); }
      if (n.resource === 'wood' && c.g.perk.wood && p.hp < c.g.hqHp) { c.log({ k: 'perk', side, tile: t, perk: 'wood' }); heal(c, { hq: side }, c.g.perk.wood); }
    }
  }
  for (const u of s.units.slice()) {
    if (u.side !== side || u.health <= 0) continue;
    if (u.keywords.includes('regen')) heal(c, { unit: u }, 2);
    for (const a of c.def(u.slug).abilities) if (a.when === 'turn_start') runAbility(c, { uid: u.uid, side, tile: u.tile }, a);
  }
  resolveDeaths(c);
  // The HQ fires at enemies in reach (GRID.hqFireReach, hqFireShots): one it can kill, else the strongest.
  const fire = hqFirePower(p.hp, c.g);
  if (fire > 0 && (s.phase as GridState['phase']) !== 'over') {
    const reach = Math.max(1, c.g.hqFireReach);
    const xs = s.units.filter(u => u.side !== side && !u.stealth && u.tile !== s.hq[side] && distance(s, u.tile, s.hq[side]) <= reach);
    const dealt = (u: GridUnit) => (u.shield ? 0 : isBraced(s, u) ? Math.floor(fire * braceShare(s, u)) : fire);
    xs.sort((a, b) => Number(dealt(b) >= b.health) - Number(dealt(a) >= a.health) || b.power - a.power || a.tile - b.tile);
    for (const t of xs.slice(0, Math.max(1, c.g.hqFireShots))) {
      c.log({ k: 'hqfire', side, target: t.uid, tile: t.tile });
      damage(c, { unit: t }, fire);
    }
    if (xs.length) resolveDeaths(c);
  }
  logConnections(c, before);
  checkEnd(c);
}

function endTurn(c: Ctx) {
  const s = c.s;
  const side = s.active;
  const before = snapshot(s);
  s.pending = null;
  // Claims: your unit on a node, no enemy next to it (GRID.claimAdjacent: enemies next to it do not matter).
  for (const n of s.nodes) {
    const u = s.units.find(x => x.tile === n.tile);
    if (!u || u.side !== side || n.owner === side) continue;
    if (!c.g.claimAdjacent && s.units.some(v => v.side !== side && isAdjacent(s, v.tile, n.tile))) continue;
    c.log({ k: 'claim', side, tile: n.tile, name: n.name, from: n.owner });
    n.owner = side;
  }
  // Surround capture: an enemy unit with no free orthogonal neighbour is destroyed.
  if (c.g.surround) {
    const occ = occupancy(s);
    for (const u of s.units) {
      if (u.side === side) continue;
      const [x, y] = tileXY(s, u.tile);
      const free = [[0, -1], [-1, 0], [1, 0], [0, 1]].some(([dx, dy]) => {
        const t = tileOf(s, x + dx, y + dy);
        if (t < 0 || s.terrain[t] === 'mountain') return false;
        const h = hqSideAt(s, t);
        if (h !== null) return h === u.side;
        const v = occ[t];
        return !v || v.side === u.side;
      });
      if (!free) { u.health = 0; c.captured.add(u.uid); }
    }
    resolveDeaths(c);
  }
  // The free stance (GRID.autoBrace): units that sat this turn out are braced through the enemy's turn.
  if (c.g.autoBrace !== 'off') {
    for (const u of s.units) {
      if (u.side !== side || u.health <= 0 || u.bracedUntil > s.turn) continue;
      if (u.acted && (c.g.autoBrace === 'idle' || u.fought)) continue;
      u.bracedUntil = s.turn + 1;
      if (c.g.autoBraceTaken !== c.g.braceTaken) u.stance = true;
      c.log({ k: 'brace', uid: u.uid, until: u.bracedUntil, auto: true });
    }
  }
  if (c.g.scoreWhen === 'end') scoreNodes(c, side);
  if (c.g.setbackOn !== 'off') {
    const marks: NonNullable<GridState['marks']> = s.marks ? [s.marks[0], s.marks[1]] : [null, null];
    marks[side] = { nodes: connectedNodes(s, side).length, hp: s.players[side].hp };
    s.marks = marks;
  }
  delete s.setback;
  c.log({ k: 'end_turn', side, turn: s.turn });
  logConnections(c, before);
  if (checkEnd(c)) return;
  if (s.turn >= 2 * c.g.turnLimit) { end(c, judgeGrid(s), 'turn_limit'); return; }
  startTurn(c, other(side));
}

// --- Validation helpers (shared with the client) ------------------------------------------

function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new GridError(msg);
}

/** Orders a brace in place uses: none while idle units brace for free anyway (GRID.autoBrace). */
export const braceCost = (g: GridConfig) => (g.autoBrace !== 'off' ? 0 : g.braceOrders);

/** The unit that may still attack after its move, if any. */
function pendingUnit(s: GridState, side: Side, uid: string): GridUnit | null {
  if (s.pending !== uid) return null;
  const u = unitById(s, uid);
  return u && u.side === side ? u : null;
}

/** Start the order of `u` (not already moved): uses `cost` orders, closes any pending unit. */
function startOrder(c: Ctx, u: GridUnit, cost: number) {
  const s = c.s;
  need(canStartOrder(s, u), u.acted ? 'That unit has already acted this turn' : u.fresh ? 'Units cannot act the turn they arrive (unless they have Rush)' : 'That unit is frozen');
  need(s.ordersLeft >= cost, 'No orders left this turn');
  s.ordersLeft -= cost;
  u.acted = true;
  s.pending = null;
}

function reveal(c: Ctx, u: GridUnit) {
  if (!u.stealth) return;
  u.stealth = false;
  c.log({ k: 'reveal', uid: u.uid });
}

function resolveAttack(c: Ctx, u: GridUnit, target: number) {
  const s = c.s;
  const t = attackTargets(s, u, u.tile).find(x => x.tile === target);
  need(t, 'That is not a target in reach');
  reveal(c, u);
  const flank = flankBonus(s, u.side, u.uid, target);
  const power = u.power + u.boost + outnumberedBonus(s, u.side);
  const ranged = isRanged(u);
  const victim = t.unit ? unitById(s, t.unit)! : null;
  c.log({ k: 'attack', side: u.side, uid: u.uid, from: u.tile, tile: target, target: victim ? { unit: victim.uid } : { hq: t.hq! }, ranged, flank });
  let dealt = damage(c, victim ? { unit: victim } : { hq: t.hq! }, power + flank);
  // Pierce: whatever enemy stands straight behind the target is hit too.
  if (u.keywords.includes('pierce') && c.g.pierceShare > 0) {
    const b = behind(s, u.tile, target);
    if (b >= 0) {
      const v = s.units.find(x => x.tile === b && x.side !== u.side && x.health > 0 && !x.stealth);
      const h = hqSideAt(s, b);
      const hit: Hit | null = v ? { unit: v } : h !== null && h !== u.side ? { hq: h } : null;
      if (hit) {
        c.log({ k: 'pierce', uid: u.uid, tile: b });
        dealt += damage(c, hit, Math.max(1, Math.ceil(power * c.g.pierceShare - 1e-9)));
      }
    }
  }
  // A melee defender that survives strikes back.
  if (victim && c.g.retaliation && !ranged && !isRanged(victim) && victim.health > 0 && victim.power > 0 && !isFrozen(s, victim) && u.health > 0) {
    c.log({ k: 'retaliate', uid: victim.uid, target: u.uid });
    damage(c, { unit: u }, victim.power);
  }
  if (u.keywords.includes('drain') && dealt > 0) heal(c, { hq: u.side }, dealt);
}

// --- Actions -------------------------------------------------------------------

export function applyGridAction(state: GridState, side: Side, action: GridAction): GridState {
  const c = new Ctx(cloneGrid(state));
  const s = c.s;
  need(s.phase !== 'over', 'The game is over');
  if (action.type === 'concede') { end(c, other(side), 'concede'); return c.finish(); }
  if (s.phase === 'mulligan') {
    if (action.type === 'timeout') {
      for (const p of s.players) p.mulliganed = true;
      startTurn(c, s.first);
      return c.finish();
    }
    need(action.type === 'mulligan', 'Choose which cards to keep first');
    const p = s.players[side];
    need(!p.mulliganed, 'You already chose');
    const replace = new Set(action.replace);
    need([...replace].every(uid => p.hand.some(h => h.uid === uid)), 'Unknown card');
    const back = p.hand.filter(h => replace.has(h.uid));
    p.hand = p.hand.filter(h => !replace.has(h.uid));
    p.deck.push(...back);
    c.rng.shuffle(p.deck);
    p.hand.push(...p.deck.splice(0, back.length));
    p.mulliganed = true;
    if (s.players.every(x => x.mulliganed)) startTurn(c, s.first);
    return c.finish();
  }
  if (action.type === 'timeout') {
    const p = s.players[s.active];
    p.timeouts++;
    if (p.timeouts >= 3) { end(c, other(s.active), 'timeout'); return c.finish(); }
    endTurn(c);
    return c.finish();
  }
  need(s.active === side, 'Not your turn');
  const p = s.players[side];
  const before = snapshot(s);
  switch (action.type) {
    case 'end_turn':
      p.timeouts = 0;
      endTurn(c);
      return c.finish();
    case 'deploy': {
      const idx = p.hand.findIndex(h => h.uid === action.uid);
      need(idx >= 0, 'That card is not in your hand');
      const def = c.def(p.hand[idx].slug);
      const cost = cardCost(s, def.slug, side);
      need(p.emeralds >= cost, 'Not enough emeralds');
      const spot = deployTiles(s, side).find(d => d.tile === action.tile);
      need(spot, 'You cannot deploy there');
      const a = playOf(def);
      if (a?.target) {
        const valid = specTiles(s, side, a.target, action.tile);
        need(!valid.length || (action.target !== undefined && valid.includes(action.target)), 'Not a valid target for that card');
      }
      const ready = c.g.reinforceReady && reinforced(s, side);
      p.emeralds -= cost;
      p.hand.splice(idx, 1);
      const u = makeUnit(def, action.uid, side, action.tile, c.g);
      if (ready) u.fresh = false;
      s.units.push(u);
      c.log({ k: 'deploy', side, uid: u.uid, slug: def.slug, tile: u.tile, forward: spot.forward, ...(ready ? { ready } : {}) });
      refreshAura(c);
      revealAround(c, u);
      if (a) runAbility(c, { uid: u.uid, side, tile: u.tile }, a, a.target ? action.target : undefined);
      break;
    }
    case 'move': {
      const u = unitById(s, action.uid);
      need(u && u.side === side, 'Not your unit');
      need(s.pending !== u.uid, 'That unit has already moved');
      const opt = moveOptions(s, u).find(o => o.to === action.to);
      // Validate before spending the order, so a bad click costs nothing.
      need(canStartOrder(s, u), u.acted ? 'That unit has already acted this turn' : u.fresh ? 'Units cannot act the turn they arrive (unless they have Rush)' : 'That unit is frozen');
      need(opt, 'It cannot move there');
      startOrder(c, u, 1);
      const from = u.tile;
      u.tile = opt.to;
      s.pending = u.uid;
      c.log({ k: 'move', side, uid: u.uid, from, to: opt.to, path: opt.path, ...(opt.stopped ? { stopped: true } : {}) });
      refreshAura(c);
      revealAround(c, u);
      break;
    }
    case 'attack': {
      const u = unitById(s, action.uid);
      need(u && u.side === side, 'Not your unit');
      need(attackTargets(s, u, u.tile).some(t => t.tile === action.target), 'That is not a target in reach');
      if (!pendingUnit(s, side, u.uid)) startOrder(c, u, 1);
      s.pending = null;
      if (c.g.autoBrace === 'passive') u.fought = true;
      resolveAttack(c, u, action.target);
      break;
    }
    case 'ability': {
      const u = unitById(s, action.uid);
      need(u && u.side === side, 'Not your unit');
      const def = c.def(u.slug);
      const m = moveOf(def);
      need(m, 'That unit has no move ability');
      need(!u.usedAbility, 'That unit has already used its ability this turn');
      const cost = abilityCost(def, c.g);
      need(p.emeralds >= cost, 'Not enough emeralds');
      if (m.target) {
        const valid = specTiles(s, side, m.target, u.tile, u.uid);
        need(action.target !== undefined && valid.includes(action.target), 'Not a valid target');
      }
      if (!pendingUnit(s, side, u.uid)) startOrder(c, u, 1);
      // GRID.abilityAttack: the order stays open, so the unit may still attack or brace.
      s.pending = c.g.abilityAttack ? u.uid : null;
      if (c.g.abilityAttack) u.usedAbility = true;
      if (c.g.autoBrace === 'passive') u.fought = true;
      p.emeralds -= cost;
      reveal(c, u);
      c.log({ k: 'ability', side, uid: u.uid, name: m.name ?? 'Move', ...(m.target ? { target: action.target } : {}) });
      runAbility(c, { uid: u.uid, side, tile: u.tile }, m, m.target ? action.target : undefined);
      break;
    }
    case 'brace': {
      const u = unitById(s, action.uid);
      need(u && u.side === side, 'Not your unit');
      // A brace in place while the stance is free is that stance, taken early; after a move it is a full brace.
      const inPlace = !pendingUnit(s, side, u.uid);
      if (inPlace) startOrder(c, u, braceCost(c.g));
      s.pending = null;
      u.bracedUntil = s.turn + 1;
      if (inPlace && c.g.autoBrace !== 'off' && c.g.autoBraceTaken !== c.g.braceTaken) u.stance = true;
      else if (u.stance) delete u.stance;
      c.log({ k: 'brace', uid: u.uid, until: u.bracedUntil });
      break;
    }
    case 'hq': {
      need(!s.hqUsed, 'The HQ has already acted this turn');
      need(s.ordersLeft >= 1, 'No orders left this turn');
      const a = gridHqAbility(p, c.g);
      need(p.emeralds >= (a.cost ?? 0), 'Not enough emeralds');
      if (a.target) need(action.target !== undefined && specTiles(s, side, a.target, s.hq[side]).includes(action.target), 'Not a valid target');
      s.ordersLeft--;
      s.hqUsed = true;
      s.pending = null;
      p.emeralds -= a.cost ?? 0;
      c.log({ k: 'hq', side, name: a.name ?? 'HQ', ...(a.target ? { target: action.target } : {}) });
      runAbility(c, { uid: null, side, tile: s.hq[side] }, a, a.target ? action.target : undefined);
      break;
    }
    default:
      throw new GridError('Unknown action');
  }
  resolveDeaths(c);
  logConnections(c, before);
  checkEnd(c);
  return c.finish();
}

// --- Legal actions -------------------------------------------------------------------

/**
 * The parts of a GridState, or of a player's GridView, that legal-action
 * enumeration reads, so the browser lists exactly what the server accepts
 * (hand: your own side only).
 */
export interface GridPlay extends GridBoard {
  phase: GridState['phase'];
  ordersLeft: number;
  pending: string | null;
  hqUsed: boolean;
  players: [GridPlaySide, GridPlaySide];
}
export interface GridPlaySide {
  tank: GridPlayer['tank'];
  hp: number;
  emeralds: number;
  hand?: GridPlayer['hand'];
}

/** Deploys a side could make now: each affordable card, each deploy tile, each target it needs. */
export function deployActions(s: GridPlay, side: Side): GridAction[] {
  const p = s.players[side];
  const g = rulesOf(s);
  const out: GridAction[] = [];
  const tiles = deployTiles(s, side);
  const seen = new Set<string>();
  for (const h of p.hand ?? []) {
    const def = gridDef(h.slug, s.extraDefs);
    if (cardCost(s, h.slug, side) > p.emeralds || seen.has(h.slug)) continue;
    seen.add(h.slug);
    const a = playOf(def);
    for (const { tile } of tiles) {
      const ts = a?.target ? specTiles(s, side, a.target, tile) : [];
      if (ts.length) for (const target of ts) out.push({ type: 'deploy', uid: h.uid, tile, target });
      else out.push({ type: 'deploy', uid: h.uid, tile });
    }
  }
  return out;
}

/**
 * Every legal action for `side` now (end_turn included; concede left out).
 * Identical hand cards are listed once.
 */
export function legalGridActions(s: GridPlay, side: Side): GridAction[] {
  if (s.phase !== 'main' || s.active !== side) return [];
  const out: GridAction[] = [...deployActions(s, side)];
  const p = s.players[side];
  const g = rulesOf(s);
  for (const u of s.units) {
    if (u.side !== side) continue;
    const pend = s.pending === u.uid;
    const fresh = canStartOrder(s, u) && s.ordersLeft >= 1;
    if (!pend && !fresh) {
      if (canStartOrder(s, u) && braceCost(g) === 0) out.push({ type: 'brace', uid: u.uid });
      continue;
    }
    if (fresh) for (const m of moveOptions(s, u)) out.push({ type: 'move', uid: u.uid, to: m.to });
    for (const t of attackTargets(s, u, u.tile)) out.push({ type: 'attack', uid: u.uid, target: t.tile });
    const def = gridDef(u.slug, s.extraDefs);
    const m = moveOf(def);
    if (m && !u.usedAbility && abilityCost(def, g) <= p.emeralds) {
      if (m.target) for (const t of specTiles(s, side, m.target, u.tile, u.uid)) out.push({ type: 'ability', uid: u.uid, target: t });
      else out.push({ type: 'ability', uid: u.uid });
    }
    if (pend || s.ordersLeft >= braceCost(g)) out.push({ type: 'brace', uid: u.uid });
  }
  const a = gridHqAbility(p, g);
  if (!s.hqUsed && s.ordersLeft >= 1 && p.emeralds >= (a.cost ?? 0)) {
    if (a.target) for (const t of specTiles(s, side, a.target, s.hq[side])) out.push({ type: 'hq', target: t });
    else out.push({ type: 'hq' });
  }
  out.push({ type: 'end_turn' });
  return out;
}

export { backRow, deployTiles };
