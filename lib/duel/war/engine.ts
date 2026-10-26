// Three-Front War rules engine. Pure like the duel engine: applyWarAction
// returns a new state and never touches the one it was given.
//
// Rules v0 in brief (full text and numbers in README.md here; every number
// is a knob in config.ts):
//   - Three lanes (left, centre, right), each in front of a real Wynncraft
//     territory. Each side has one active slot per lane, a garrison of 2,
//     and a tower per lane. Destroy 2 of the enemy's 3 towers to win.
//   - Rounds are simultaneous. Both sides plan in secret, then the round
//     resolves: switches and shifts, then deploys, then every attack, move
//     and tank (HQ) order by speed (Rush first; ties by a seeded coin).
//   - Attacks target SLOTS and resolve against whoever stands there then.
//     An empty slot is a miss, except the slot straight opposite, where the
//     attack hits that lane's tower. That is what makes switching a read.
//   - No retaliation, except Brace: a braced unit that survives a hit
//     strikes back (v3, WAR.braceCounter). Otherwise a unit only deals
//     damage with its own action.
//   - v3 comeback rules (README "Rules v3"): income grows over the war, a
//     fallen tower can be retaken once, and the side behind on towers wins
//     speed ties and deploys first.
//
// Effect remapping (duel effect target -> war):
//   | duel target        | war                                                    |
//   |--------------------|--------------------------------------------------------|
//   | chosen 'enemy'     | an enemy slot; if empty, the enemy tower in that lane  |
//   | chosen 'ally'      | your slot; if empty, your tower in that lane           |
//   | chosen *_unit      | a slot's unit; empty slot = no effect                  |
//   | self               | the source unit                                        |
//   | enemy_hero         | the enemy tower in the source's lane (tank: none)      |
//   | ally_hero          | your tower in the source's lane (tank: most damaged)   |
//   | all_enemy_units    | the enemy's active units (never the garrison)          |
//   | all/other_ally     | your active units (other: not the source)              |
//   | all_other_units    | every active unit but the source                       |
//   | random_enemy_unit  | a random enemy active unit                             |
//   | random_enemy       | a random enemy active unit, or the enemy tower in the   |
//   |                    | source's lane (tank: any enemy tower)                  |
//   | chain n            | n times 1 damage to random_enemy                       |
//   | summon             | the source's lane if empty, else the first empty slot, |
//   |                    | else the garrison, else nothing                        |
//   | tide n             | n emeralds (bank cap applies)                          |
//   | freeze             | loses its action this round if it has not acted yet,   |
//   |                    | otherwise next round's                                 |
// Drain heals your tower in the attacker's lane; Pierce overflow hits the
// tower in the target's lane; Regen heals 2 at upkeep.

import { hash, Rng } from '../rng';
import { tankAbility, tankElement } from '../rules';
import type { Ability, CardDef, Effect, EffectTarget, Side, TargetSpec } from '../types';
import { warCard } from './cards';
import { emeraldCost, moveCost, TERRITORIES, WAR, WAR_RULES_VERSION } from './config';
import type {
  Deploy, Lane, Order, Plan, SlotRef, Territory, WarAction, WarEndReason, WarEvent, WarPlayer, WarState, WarUnit,
} from './types';
import { LANES } from './types';

export class WarError extends Error {}

export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export function defOf(slug: string, extra?: Record<string, CardDef>): CardDef {
  // War prices (cards.ts); member cards come in extraDefs.
  const d = extra?.[slug] ?? warCard(slug);
  if (!d) throw new WarError(`Unknown card ${slug}`);
  return d;
}

export const moveOf = (d: CardDef) => d.abilities.find(a => a.when === 'move');
export const playOf = (d: CardDef) => d.abilities.find(a => a.when === 'play');

/** The tank's ability with its cost in emeralds. */
export function hqAbility(p: Pick<WarPlayer, 'tank'>): Ability {
  // War-only tank variants (config.ts airTank, earthTank); tide costs, converted below.
  const a: Ability = p.tank === 'air' && WAR.airTank === 'gust'
    ? { when: 'move', name: 'Gust', cost: 2, target: 'enemy_unit', effects: [{ k: 'bounce', t: 'chosen', maxCost: 3 }] }
    : p.tank === 'earth' && WAR.earthTank === 'fortify'
      ? { when: 'move', name: 'Fortify', cost: 2, target: 'ally_unit', effects: [{ k: 'buff', atk: 0, hp: 2, t: 'chosen' }] }
      : tankAbility(p.tank);
  return { ...a, cost: emeraldCost(a.cost ?? 0) };
}

/** Where the tank's (HQ) order sits in the resolution order: its element's speed. */
export function hqSpeed(p: Pick<WarPlayer, 'tank'>): number {
  return WAR.speed[p.tank];
}

/** Lanes a unit in `lane` can attack. */
export function reachOf(lane: Lane, ranged: boolean): Lane[] {
  if (ranged || WAR.lanes === 'soft' && lane === 1) return LANES;
  return WAR.lanes === 'soft' ? [lane, 1].filter((x, i, a) => a.indexOf(x) === i) as Lane[] : [lane];
}

/** A hand card's emerald cost. */
/**
 * The parts of a WarState, or of a player's WarView, that the planning
 * helpers below read, so the browser can build and check a plan from its
 * view with the same code the server runs (hand: your own side only).
 */
export interface WarBoard {
  round: number;
  extraDefs?: Record<string, CardDef>;
  players: [WarBoardSide, WarBoardSide];
}
export interface WarBoardSide {
  tank: CardDef['element'];
  towers: number[];
  emeralds: number;
  active: (WarUnit | null)[];
  garrison: WarUnit[];
  hand?: { uid: string; slug: string }[];
}

export const emeraldCostOf = (s: Pick<WarBoard, 'extraDefs'>, slug: string) => emeraldCost(defOf(slug, s.extraDefs).cost);

export const towerAlive = (p: Pick<WarBoardSide, 'towers'>, lane: Lane) => p.towers[lane] > 0;
export const towersDown = (p: Pick<WarBoardSide, 'towers'>) => p.towers.filter(t => t <= 0).length;

// --- Setup -------------------------------------------------------------------

export interface WarSetup {
  name: string;
  avatar: string;
  deck: string[];
  tank?: CardDef['element'];
}

/** Three distinct territories; a city in the centre when the draw allows. */
export function drawTerritories(rng: Rng): Territory[] {
  const pool = rng.shuffle(TERRITORIES.slice());
  const centre = pool.find(t => t.city) ?? pool[0];
  const flanks = pool.filter(t => t !== centre).slice(0, 2);
  return [flanks[0], centre, flanks[1]];
}

export function createWar(seed: number, setups: [WarSetup, WarSetup], extraDefs?: Record<string, CardDef>): WarState {
  const rng = new Rng(seed >>> 0);
  let uid = 1;
  const territories = drawTerritories(rng);
  const players = setups.map(p => {
    const deck = rng.shuffle(p.deck.map(slug => ({ uid: `c${uid++}`, slug })));
    const player: WarPlayer = {
      name: p.name, avatar: p.avatar,
      tank: p.tank ?? tankElement(p.deck.map(s => defOf(s, extraDefs))),
      towers: [WAR.towerHp, WAR.towerHp, WAR.towerHp], emeralds: 0,
      deck, hand: deck.splice(0, WAR.startHand), active: [null, null, null], garrison: [], graveyard: [],
      mulliganed: false, timeouts: 0, plan: null, towerLost: 0,
    };
    return player;
  }) as [WarPlayer, WarPlayer];
  const s: WarState = {
    rules: WAR_RULES_VERSION, rng: rng.state, phase: 'mulligan', round: 0, territories, players,
    winner: null, endReason: null, nextUid: uid, log: [], logBase: 0,
  };
  if (extraDefs && Object.keys(extraDefs).length) s.extraDefs = extraDefs;
  return s;
}

// --- Context -----------------------------------------------------------------

type UnitHit = { unit: WarUnit; side: Side; lane: Lane };
type Hit = UnitHit | { tower: true; side: Side; lane: Lane };

class Ctx {
  rng: Rng;
  /** Units braced this round. */
  braced = new Set<string>();
  /** Units whose stance was ordered this round ('next' stances do not cover it). */
  freshStance = new Set<string>();
  /** Units whose action this round has not resolved yet. */
  pending = new Set<string>();
  /** Slots emptied by a bounce this round ("side:lane"), open to attack (WAR.bounceOpens). */
  opened = new Set<string>();
  /** Who stood in each slot when orders were given: [side][lane] uid. */
  planned: (string | null)[][] = [[], []];
  constructor(public s: WarState) { this.rng = new Rng(s.rng); }
  def(slug: string) { return defOf(slug, this.s.extraDefs); }
  log(e: WarEvent) { if (!this.s.quiet) this.s.log.push(e); }
  uid() { return `c${this.s.nextUid++}`; }
  finish(): WarState {
    this.s.rng = this.rng.state;
    if (this.s.log.length > 300) {
      const drop = this.s.log.length - 300;
      this.s.log = this.s.log.slice(drop);
      this.s.logBase += drop;
    }
    return this.s;
  }
}

function clonePlayer(p: WarPlayer): WarPlayer {
  const u = (x: WarUnit) => ({ ...x, keywords: x.keywords.slice() });
  return {
    ...p, towers: p.towers.slice(), deck: p.deck.slice(), hand: p.hand.slice(),
    active: p.active.map(x => (x ? u(x) : null)), garrison: p.garrison.map(u), graveyard: p.graveyard.slice(),
  };
}

export function cloneWar(s: WarState): WarState {
  return { ...s, players: [clonePlayer(s.players[0]), clonePlayer(s.players[1])], log: s.quiet ? s.log : s.log.slice() };
}

export function findUnit(s: WarState, uid: string): { side: Side; lane: Lane | null; unit: WarUnit } | null {
  for (const side of [0, 1] as Side[]) {
    const p = s.players[side];
    for (const lane of LANES) if (p.active[lane]?.uid === uid) return { side, lane, unit: p.active[lane]! };
    const g = p.garrison.find(x => x.uid === uid);
    if (g) return { side, lane: null, unit: g };
  }
  return null;
}

/** A card's war speed: its element's (v0) or its own tier (v1; see WAR.speedMode). */
export function warSpeed(def: CardDef): number {
  if (WAR.speedMode === 'element') return WAR.speed[def.element];
  if (def.tier === 'token') return 2;
  const roll = (hash(`speed:${def.slug}`) % 1000) / 1000;
  return roll < WAR.fastShare ? 3 : roll < 2 * WAR.fastShare ? 1 : 2;
}

/** A card's health in war: scaled by healthMult, and paying for (or paid for) its speed. */
export function warHealth(def: CardDef): number {
  const base = Math.round(def.health * WAR.healthMult);
  if (WAR.speedMode === 'element') return base;
  return Math.max(1, base - (warSpeed(def) - 2) * WAR.speedHealth);
}

function makeUnit(def: CardDef, uid: string): WarUnit {
  const health = warHealth(def);
  return {
    uid, slug: def.slug, power: Math.round(def.power * WAR.powerMult), health, maxHealth: health, keywords: def.keywords.slice(),
    speed: warSpeed(def), shield: def.keywords.includes('shield'), stealth: def.keywords.includes('stealth'),
    frozenRound: 0, boost: 0,
  };
}

// --- Primitives --------------------------------------------------------------

function damage(c: Ctx, h: Hit, n: number): number {
  if (n <= 0) return 0;
  const p = c.s.players[h.side];
  if ('tower' in h) {
    if (!towerAlive(p, h.lane)) return 0;
    p.towerLost += Math.min(n, p.towers[h.lane]);
    p.towers[h.lane] = Math.max(0, p.towers[h.lane] - n);
    c.log({ k: 'damage', target: { side: h.side, lane: h.lane }, tower: true, n, hp: p.towers[h.lane] });
    if (p.towers[h.lane] <= 0) towerFell(c, h.side, h.lane);
    return n;
  }
  if (h.unit.health <= 0) return 0;
  const braced = isBraced(c, h.unit);
  if (braced) n = Math.floor(n * WAR.braceTaken);
  if (n <= 0) return 0;
  if (h.unit.shield) {
    h.unit.shield = false;
    c.log({ k: 'shield', uid: h.unit.uid });
    return 0;
  }
  h.unit.health -= n;
  c.log({ k: 'damage', target: { side: h.side, lane: h.lane }, tower: false, n, hp: h.unit.health, uid: h.unit.uid, ...(braced ? { braced } : {}) });
  return n;
}

/** A tower just fell: log it, then the owner's bounty and last stand (WAR.fallBounty, WAR.lastStand). */
function towerFell(c: Ctx, side: Side, lane: Lane) {
  const p = c.s.players[side];
  c.log({ k: 'tower', side, lane });
  if (towersDown(p) >= WAR.towersToWin) return;
  if (WAR.fallBounty > 0) {
    p.emeralds = Math.min(WAR.bankCap, p.emeralds + WAR.fallBounty);
    c.log({ k: 'bounty', side, n: WAR.fallBounty });
  }
  if (WAR.lastStand > 0) {
    for (const l of LANES) if (towerAlive(p, l)) p.towers[l] += WAR.lastStand;
    c.log({ k: 'laststand', side, n: WAR.lastStand });
  }
}

/** Braced now: by this round's order, a switch-in, or a standing stance (WAR.braceStance). */
function isBraced(c: Ctx, u: WarUnit): boolean {
  return c.braced.has(u.uid) || (WAR.braceStance !== 'off' && (u.bracedUntil ?? 0) >= c.s.round && !c.freshStance.has(u.uid));
}

/** What a braced unit strikes back for (WAR.braceCounter, WAR.braceCounterFlat). */
export function counterDamage(u: Pick<WarUnit, 'power'>): number {
  if (u.power <= 0) return 0;
  if (WAR.braceCounterFlat > 0) return WAR.braceCounterFlat;
  return WAR.braceCounter > 0 ? Math.ceil(u.power * WAR.braceCounter - 1e-9) : 0;
}

function heal(c: Ctx, h: Hit, n: number) {
  const p = c.s.players[h.side];
  if ('tower' in h) {
    if (!towerAlive(p, h.lane)) return;
    const got = Math.min(n, WAR.towerHp - p.towers[h.lane]);
    if (got <= 0) return;
    p.towers[h.lane] += got;
    c.log({ k: 'heal', target: { side: h.side, lane: h.lane }, tower: true, n: got, hp: p.towers[h.lane] });
    return;
  }
  // Unit healing scales with unit health (WAR.healthMult).
  const got = Math.min(Math.round(n * WAR.healthMult), h.unit.maxHealth - h.unit.health);
  if (got <= 0 || h.unit.health <= 0) return;
  h.unit.health += got;
  c.log({ k: 'heal', target: { side: h.side, lane: h.lane }, tower: false, n: got, hp: h.unit.health });
}

function draw(c: Ctx, side: Side, n: number) {
  const p = c.s.players[side];
  let got = 0;
  for (let i = 0; i < n; i++) {
    // An empty deck just stops drawing; towers are the only clock.
    const card = p.deck.shift();
    if (!card) break;
    if (p.hand.length >= WAR.handMax) {
      p.graveyard.push(card.slug);
      c.log({ k: 'burn', side, slug: card.slug });
      continue;
    }
    p.hand.push(card);
    got++;
  }
  if (got) c.log({ k: 'draw', side, n: got });
}

/** Put a unit on the board: `prefer` lane if empty, else the first empty slot, else the garrison. */
function place(c: Ctx, side: Side, unit: WarUnit, prefer: Lane | null, garrisonOk = true): Lane | 'garrison' | null {
  const p = c.s.players[side];
  const lanes = prefer === null ? LANES : [prefer, ...LANES.filter(l => l !== prefer)];
  for (const l of lanes) if (!p.active[l]) { p.active[l] = unit; return l; }
  if (garrisonOk && p.garrison.length < WAR.garrison) { p.garrison.push(unit); return 'garrison'; }
  return null;
}

const unitHit = (s: WarState, side: Side, lane: Lane): UnitHit | null => {
  const u = s.players[side].active[lane];
  return u && u.health > 0 ? { unit: u, side, lane } : null;
};

interface Source { uid: string | null; side: Side; lane: Lane | null }

function effectTargets(c: Ctx, src: Source, t: EffectTarget, spec: TargetSpec | undefined, chosen?: SlotRef): Hit[] {
  const s = c.s;
  const me = src.side;
  const foe = other(me);
  const actives = (side: Side) => LANES.flatMap(l => { const h = unitHit(s, side, l); return h ? [h] : []; });
  const tower = (side: Side, lane: Lane): Hit[] => (towerAlive(s.players[side], lane) ? [{ tower: true, side, lane }] : []);
  switch (t) {
    case 'chosen': {
      if (!chosen) return [];
      const h = unitHit(s, chosen.side, chosen.lane);
      if (h) return chosen.side !== me && h.unit.stealth ? [] : [h];
      return spec === 'enemy' || spec === 'ally' ? tower(chosen.side, chosen.lane) : [];
    }
    case 'self': {
      const f = src.uid ? findUnit(s, src.uid) : null;
      return f && f.lane !== null && f.unit.health > 0 ? [{ unit: f.unit, side: f.side, lane: f.lane }] : [];
    }
    case 'enemy_hero': return src.lane === null ? [] : tower(foe, src.lane);
    case 'ally_hero': {
      if (src.lane !== null) return tower(me, src.lane);
      const alive = LANES.filter(l => towerAlive(s.players[me], l)).sort((a, b) => s.players[me].towers[a] - s.players[me].towers[b]);
      return alive.length ? tower(me, alive[0]) : [];
    }
    case 'all_enemy_units': return actives(foe);
    case 'all_ally_units': return actives(me);
    case 'other_ally_units': return actives(me).filter(h => 'unit' in h && h.unit.uid !== src.uid);
    case 'all_other_units': return [...actives(me), ...actives(foe)].filter(h => 'unit' in h && h.unit.uid !== src.uid);
    case 'random_enemy_unit': { const xs = actives(foe); return xs.length ? [c.rng.pick(xs)] : []; }
    case 'random_enemy': {
      const towers = src.lane === null ? LANES.flatMap(l => tower(foe, l)) : tower(foe, src.lane);
      const xs = [...actives(foe), ...towers];
      return xs.length ? [c.rng.pick(xs)] : [];
    }
  }
}

function applyEffect(c: Ctx, src: Source, e: Effect, spec: TargetSpec | undefined, chosen?: SlotRef) {
  const units = (t: EffectTarget) => effectTargets(c, src, t, spec, chosen).filter((h): h is Hit & { unit: WarUnit } => 'unit' in h);
  switch (e.k) {
    case 'damage': for (const h of effectTargets(c, src, e.t, spec, chosen)) damage(c, h, e.n); return;
    case 'heal': for (const h of effectTargets(c, src, e.t, spec, chosen)) heal(c, h, e.n); return;
    case 'buff':
      for (const h of units(e.t)) {
        const hp = Math.round(e.hp * WAR.healthMult);
        h.unit.power += e.atk; h.unit.health += hp; h.unit.maxHealth += hp;
      }
      return;
    case 'draw': draw(c, src.side, e.n); return;
    case 'freeze':
      for (const h of units(e.t)) {
        h.unit.frozenRound = Math.max(h.unit.frozenRound, c.pending.has(h.unit.uid) ? c.s.round : c.s.round + 1);
        c.log({ k: 'freeze', uid: h.unit.uid });
      }
      return;
    case 'bounce':
      for (const h of units(e.t)) {
        const def = c.def(h.unit.slug);
        if (e.maxCost !== undefined && def.cost > e.maxCost) continue;
        const owner = c.s.players[h.side];
        owner.active[h.lane] = null;
        c.pending.delete(h.unit.uid);
        if (WAR.bounceOpens) c.opened.add(`${h.side}:${h.lane}`);
        c.log({ k: 'bounce', uid: h.unit.uid, slug: h.unit.slug });
        if (def.tier === 'token') continue;
        if (owner.hand.length >= WAR.handMax) owner.graveyard.push(h.unit.slug);
        else owner.hand.push({ uid: c.uid(), slug: h.unit.slug });
      }
      return;
    case 'summon':
      for (let i = 0; i < e.n; i++) {
        const u = makeUnit(c.def(e.token), c.uid());
        const where = place(c, src.side, u, src.lane);
        if (where !== null) c.log({ k: 'deploy', side: src.side, slug: e.token, uid: u.uid, to: where });
      }
      return;
    case 'tide': {
      const p = c.s.players[src.side];
      p.emeralds = Math.min(WAR.bankCap, p.emeralds + e.n);
      return;
    }
    case 'grant':
      for (const h of units(e.t)) {
        if (!h.unit.keywords.includes(e.kw)) h.unit.keywords.push(e.kw);
        if (e.kw === 'shield') h.unit.shield = true;
        if (e.kw === 'stealth') h.unit.stealth = true;
      }
      return;
    case 'destroy':
      for (const h of units(e.t)) if (e.maxPower === undefined || h.unit.power <= e.maxPower) h.unit.health = 0;
      return;
    case 'chain':
      for (let i = 0; i < e.n; i++) for (const h of effectTargets(c, src, 'random_enemy', undefined)) damage(c, h, 1);
      return;
  }
}

function runAbility(c: Ctx, src: Source, a: Ability, chosen?: SlotRef) {
  for (const e of a.effects) applyEffect(c, src, e, a.target, chosen);
}

function resolveDeaths(c: Ctx) {
  for (let guard = 0; guard < 50; guard++) {
    const pending: { src: Source; a: Ability }[] = [];
    for (const side of [0, 1] as Side[]) {
      const p = c.s.players[side];
      for (const lane of LANES) {
        const u = p.active[lane];
        if (!u || u.health > 0) continue;
        p.active[lane] = null;
        c.pending.delete(u.uid);
        const def = c.def(u.slug);
        if (def.tier !== 'token') p.graveyard.push(u.slug);
        c.log({ k: 'death', side, slug: u.slug, uid: u.uid, lane });
        for (const a of def.abilities) if (a.when === 'death') pending.push({ src: { uid: null, side, lane }, a });
      }
    }
    if (!pending.length) return;
    for (const { src, a } of pending) runAbility(c, src, a);
  }
}

function end(c: Ctx, winner: Side | null, reason: WarEndReason) {
  c.s.phase = 'over';
  c.s.winner = winner;
  c.s.endReason = reason;
  c.log({ k: 'end', winner, reason });
}

/** Towers destroyed, then total tower health, then a draw. */
function judge(s: WarState): Side | null {
  const [a, b] = s.players;
  const down = towersDown(b) - towersDown(a);
  if (down) return down > 0 ? 0 : 1;
  const hp = (p: WarPlayer) => p.towers.reduce((x, t) => x + Math.max(0, t), 0);
  const d = WAR.limitJudge === 'damage' ? b.towerLost - a.towerLost : hp(a) - hp(b);
  return d ? (d > 0 ? 0 : 1) : null;
}

function checkEnd(c: Ctx): boolean {
  if (c.s.phase === 'over') return true;
  if (c.s.players.some(p => towersDown(p) >= WAR.towersToWin)) { end(c, judge(c.s), 'towers'); return true; }
  return false;
}

// --- Rounds ------------------------------------------------------------------

/** Who holds each lane's front: an active unit there and none opposite. */
export function frontHolder(s: WarBoard, lane: Lane): Side | null {
  const [a, b] = s.players.map(p => !!p.active[lane]);
  return a && !b ? 0 : b && !a ? 1 : null;
}

function upkeep(c: Ctx, side: Side) {
  const s = c.s;
  const p = s.players[side];
  for (const u of [...p.active, ...p.garrison]) if (u) u.boost = 0;
  let income = WAR.income + (WAR.incomeStep > 0 ? Math.floor((s.round - 1) / WAR.incomeStep) : 0);
  const base = income;
  const chest = WAR.lostTowerIncome * towersDown(p);
  income += chest;
  // Retake: holding the front of a lane whose tower fell rebuilds it.
  if (WAR.rebuild > 0) {
    for (const lane of LANES) {
      if (towerAlive(p, lane) || frontHolder(s, lane) !== side || (p.rebuilds ?? 0) >= WAR.rebuildMax) continue;
      p.towers[lane] = WAR.rebuild;
      p.rebuilds = (p.rebuilds ?? 0) + 1;
      c.log({ k: 'rebuild', side, lane, hp: WAR.rebuild });
    }
  }
  if (WAR.perks) {
    for (const lane of LANES) {
      if (frontHolder(s, lane) !== side) continue;
      const t = s.territories[lane];
      const u = p.active[lane]!;
      if (t.city) { income += WAR.perk.city; c.log({ k: 'perk', side, lane, perk: 'city' }); }
      if (!t.resource) continue;
      c.log({ k: 'perk', side, lane, perk: t.resource });
      if (t.resource === 'ore') u.boost += WAR.perk.ore;
      if (t.resource === 'crops') heal(c, { unit: u, side, lane }, WAR.perk.crops);
      if (t.resource === 'fish') draw(c, side, WAR.perk.fish);
      if (t.resource === 'wood') heal(c, { tower: true, side, lane }, WAR.perk.wood);
    }
  }
  p.emeralds = Math.min(WAR.bankCap, p.emeralds + income);
  c.log({ k: 'income', side, n: income, perk: income > base + chest, ...(chest ? { chest } : {}) });
  if (s.round > 1) draw(c, side, WAR.draw);
  for (const lane of LANES) {
    const u = p.active[lane];
    if (!u) continue;
    if (u.keywords.includes('regen')) heal(c, { unit: u, side, lane }, 2);
    for (const a of c.def(u.slug).abilities) if (a.when === 'turn_start') runAbility(c, { uid: u.uid, side, lane }, a);
  }
}

function startRound(c: Ctx) {
  const s = c.s;
  s.round++;
  s.phase = 'plan';
  c.log({ k: 'round', round: s.round });
  for (const p of s.players) p.plan = null;
  upkeep(c, 0);
  upkeep(c, 1);
  resolveDeaths(c);
  checkEnd(c);
}

/** Can `lane`'s unit act this round (placed, not frozen)? */
export function canOrder(s: WarBoard, side: Side, lane: Lane): boolean {
  const u = s.players[side].active[lane];
  return !!u && u.frozenRound !== s.round;
}

interface Queued {
  side: Side; uid: string | null; order: Order | { k: 'hq'; target?: SlotRef }; rush: boolean; speed: number; tie: number;
  /** A shift's attack: resolves after everything else (WAR.shiftAttackTiming 'last') and at WAR.shiftAttackPower. */
  afterShift?: boolean;
}

function resolveAttack(c: Ctx, side: Side, unit: WarUnit, lane: Lane, target: SlotRef, fromStealth = false, mult = 1) {
  const s = c.s;
  const foe = other(side);
  const fp = s.players[foe];
  let aim = target;
  const reach = reachOf(lane, unit.keywords.includes('ranged'));
  const log = (hit: 'unit' | 'tower' | 'fizzle', t: SlotRef) => {
    const now = fp.active[t.lane]?.uid ?? null;
    const redirected = t.lane !== target.lane;
    c.log({
      k: 'attack', side, uid: unit.uid, from: lane, target: t, hit, swapped: now !== (c.planned[foe][t.lane] ?? null),
      ...(redirected ? { aimed: target, redirected } : {}),
    });
  };
  if (aim.side !== foe || !reach.includes(aim.lane)) return log('fizzle', aim);
  // Guard, applied now: a visible enemy Guard in reach must be the target.
  const guards = reach.filter(l => { const g = fp.active[l]; return g && g.health > 0 && !g.stealth && g.keywords.includes('guard') && (WAR.guard === 'reach' || l === lane); });
  const occ = fp.active[aim.lane];
  if (guards.length && !(occ && guards.includes(aim.lane)) && !(WAR.stealthStrike && fromStealth)) {
    const nearest = guards.slice().sort((x, y) => Math.abs(x - aim.lane) - Math.abs(y - aim.lane))[0];
    aim = { side: foe, lane: nearest };
  }
  const victim = fp.active[aim.lane];
  const base = unit.power + unit.boost;
  const power = mult === 1 || base <= 0 ? base : Math.max(1, Math.floor(base * mult));
  let dealt = 0;
  if (victim && victim.health > 0) {
    if (victim.stealth) return log('fizzle', aim);
    log('unit', aim);
    const before = victim.health;
    const shielded = victim.shield;
    dealt = damage(c, { unit: victim, side: foe, lane: aim.lane }, power);
    const tower: Hit = { tower: true, side: foe, lane: aim.lane };
    // Siege: fighting in a lane wears down its tower (WAR.siege). Pierce is
    // the overflow rule for one unit; under overflow siege it adds nothing.
    const overflow = WAR.siege === 'overflow' || WAR.siege === 'both' || unit.keywords.includes('pierce');
    if (overflow && !shielded && dealt > before) dealt += damage(c, tower, dealt - before);
    if ((WAR.siege === 'chip' || WAR.siege === 'both') && dealt > 0) damage(c, tower, WAR.chip);
    // Brace strikes back (WAR.braceCounter): a braced unit still standing hits its attacker.
    const back = counterDamage(victim);
    if (back > 0 && isBraced(c, victim) && victim.health > 0 && unit.health > 0) {
      c.log({ k: 'counter', uid: victim.uid, target: { side, lane } });
      damage(c, { unit, side, lane }, back);
    }
  } else if ((aim.lane === lane || c.opened.has(`${foe}:${aim.lane}`)) && towerAlive(fp, aim.lane)) {
    log('tower', aim);
    dealt = damage(c, { tower: true, side: foe, lane: aim.lane }, power);
  } else return log('fizzle', aim);
  if (unit.keywords.includes('drain') && dealt > 0) heal(c, { tower: true, side, lane }, dealt);
}

/** The side behind on towers: fewer standing, then (unless towersOnly) less tower health; null when level. */
export function underdog(s: WarBoard, towersOnly = false, maxGap = 0): Side | null {
  const standing = (p: WarBoardSide) => LANES.filter(l => towerAlive(p, l)).length;
  const hp = (p: WarBoardSide) => p.towers.reduce((a, t) => a + Math.max(0, t), 0);
  const [a, b] = s.players;
  const d = standing(a) - standing(b) || (towersOnly ? 0 : hp(a) - hp(b));
  if (maxGap > 0 && Math.abs(8 * (standing(a) - standing(b)) + hp(a) - hp(b)) > maxGap) return null;
  return d < 0 ? 0 : d > 0 ? 1 : null;
}

function resolveRound(c: Ctx) {
  const s = c.s;
  const plans = s.players.map(p => p.plan ?? { orders: [null, null, null], deploys: [] }) as [Plan, Plan];
  const queue: Queued[] = [];
  // 0. Orders are bound to the units standing in each slot now.
  for (const side of [0, 1] as Side[]) {
    const p = s.players[side];
    c.planned[side] = p.active.map(u => u?.uid ?? null);
    plans[side].orders.forEach((o, lane) => {
      const u = p.active[lane];
      if (!o || !u || !canOrder(s, side, lane as Lane)) return;
      if (o.k === 'brace' && WAR.brace) {
        if (WAR.braceStance !== 'next') c.braced.add(u.uid);
        if (WAR.braceStance !== 'off') { u.bracedUntil = s.round + 1; c.freshStance.add(u.uid); }
        c.log({ k: 'brace', uid: u.uid, ...(WAR.braceStance !== 'off' ? { until: s.round + 1 } : {}) });
      }
      const shiftHit = o.k === 'shift' && WAR.shiftAttack ? o.attack : undefined;
      if (o.k === 'attack' || o.k === 'move' || shiftHit) {
        const order: Order = shiftHit ? { k: 'attack', target: shiftHit } : o;
        queue.push({ side, uid: u.uid, order, rush: u.keywords.includes('rush'), speed: u.speed, tie: c.rng.float(), ...(shiftHit ? { afterShift: true } : {}) });
        c.pending.add(u.uid);
      }
    });
    const hq = plans[side].hq;
    if (hq) queue.push({ side, uid: null, order: { k: 'hq', target: hq.target }, rush: false, speed: hqSpeed(p), tie: c.rng.float() });
  }
  // 1. Switches, then shifts.
  for (const side of [0, 1] as Side[]) {
    const p = s.players[side];
    const movers = plans[side].orders.map((o, lane) => ({ o, u: p.active[lane] })).filter(x => x.o && x.u && canOrder(s, side, s.players[side].active.indexOf(x.u) as Lane));
    for (const { o, u } of movers) {
      if (o!.k !== 'switch') continue;
      const lane = p.active.indexOf(u!) as Lane;
      const g = p.garrison[o!.garrison];
      if (lane < 0 || !g) continue;
      p.active[lane] = g;
      p.garrison[o!.garrison] = u!;
      u!.bracedUntil = 0;
      c.log({ k: 'switch', side, lane, out: u!.uid, in: g.uid });
      if (WAR.switchBrace && WAR.brace) { c.braced.add(g.uid); c.log({ k: 'brace', uid: g.uid }); }
    }
    for (const { o, u } of movers) {
      if (o!.k !== 'shift') continue;
      const from = p.active.indexOf(u!) as Lane;
      if (from < 0) continue;
      const to = (from + o!.dir) as Lane;
      if (to < 0 || to > 2) continue;
      [p.active[from], p.active[to]] = [p.active[to], p.active[from]];
      for (const x of [p.active[from], p.active[to]]) if (x) x.bracedUntil = 0;
      c.log({ k: 'shift', side, from, to });
    }
  }
  // 2. Deploys, alternating sides from a coin flip.
  const coin = c.rng.int(2) as Side;
  const under = WAR.underdogInitiative ? underdog(s, WAR.underdogInitiative === 'fallen', WAR.initiativeMaxGap) : null;
  const firstDeploy: Side = under ?? coin;
  const lists = [plans[0].deploys.slice(), plans[1].deploys.slice()];
  for (let i = 0; lists[0].length || lists[1].length; i++) {
    const side = (i % 2 === 0 ? firstDeploy : other(firstDeploy)) as Side;
    const d = lists[side].shift();
    if (d) deploy(c, side, d);
    resolveDeaths(c);
  }
  // 3. Everything else by speed: Rush first, then fastest, ties by coin.
  const first = (q: Queued) => (under !== null && q.side === under ? 1 : 0);
  const late = (q: Queued) => (q.afterShift && WAR.shiftAttackTiming === 'last' ? 1 : 0);
  queue.sort((a, b) => late(a) - late(b) || Number(b.rush) - Number(a.rush) || b.speed - a.speed || first(b) - first(a) || a.tie - b.tie);
  for (const q of queue) {
    if (s.phase === 'over') break;
    const p = s.players[q.side];
    if (q.order.k === 'hq') {
      const a = hqAbility(p);
      if (p.emeralds < (a.cost ?? 0)) continue;
      if (a.target && !q.order.target) continue;
      p.emeralds -= a.cost ?? 0;
      c.log({ k: 'hq', side: q.side, name: a.name ?? 'HQ', ...(q.order.target ? { target: q.order.target } : {}) });
      runAbility(c, { uid: null, side: q.side, lane: null }, a, q.order.target);
    } else {
      const f = findUnit(s, q.uid!);
      c.pending.delete(q.uid!);
      if (!f || f.lane === null || f.unit.health <= 0) continue;
      if (f.unit.frozenRound === s.round) continue;
      const fromStealth = f.unit.stealth;
      f.unit.stealth = false;
      if (q.order.k === 'attack') resolveAttack(c, q.side, f.unit, f.lane, q.order.target, fromStealth, q.afterShift ? WAR.shiftAttackPower : 1);
      else if (q.order.k === 'move') {
        const m = moveOf(c.def(f.unit.slug));
        const cost = moveCost(m?.cost ?? 0);
        if (!m || p.emeralds < cost) continue;
        p.emeralds -= cost;
        c.log({ k: 'move', side: q.side, uid: f.unit.uid, name: m.name ?? 'Move', from: f.lane, ...(q.order.target ? { target: q.order.target } : {}) });
        runAbility(c, { uid: f.unit.uid, side: q.side, lane: f.lane }, m, q.order.target);
        if (WAR.moveAndAttack && q.order.attack) {
          resolveDeaths(c);
          const g = findUnit(s, f.unit.uid);
          if (g && g.lane !== null && g.unit.health > 0) resolveAttack(c, q.side, g.unit, g.lane, q.order.attack);
        }
      }
    }
    resolveDeaths(c);
    checkEnd(c);
  }
  c.log({ k: 'resolved', round: s.round });
  if (checkEnd(c)) return;
  if (s.round >= WAR.roundLimit) { end(c, judge(s), 'round_limit'); return; }
  startRound(c);
}

function deploy(c: Ctx, side: Side, d: Deploy) {
  const p = c.s.players[side];
  const idx = p.hand.findIndex(h => h.uid === d.uid);
  if (idx < 0) return;
  const def = c.def(p.hand[idx].slug);
  const cost = emeraldCost(def.cost);
  if (p.emeralds < cost) return;
  const unit = makeUnit(def, d.uid);
  const where = place(c, side, unit, d.to === 'garrison' ? null : d.to, true);
  // A lane taken by a shift since planning: the unit waits in the garrison.
  const placed = d.to === 'garrison'
    ? (p.garrison.length < WAR.garrison ? (p.garrison.push(unit), 'garrison' as const) : null)
    : where;
  if (d.to === 'garrison' && where !== null && where !== 'garrison') {
    // place() put it on the board; a garrison deploy must not. Undo.
    p.active[where] = null;
  } else if (d.to === 'garrison' && where === 'garrison') {
    p.garrison.pop();
  }
  if (placed === null) return;
  p.emeralds -= cost;
  p.hand.splice(idx, 1);
  c.log({ k: 'deploy', side, slug: def.slug, uid: unit.uid, to: placed });
  const a = playOf(def);
  if (a) runAbility(c, { uid: unit.uid, side, lane: placed === 'garrison' ? null : placed }, a, d.target);
}

// --- Validation ----------------------------------------------------------------

/** Slots a targeted effect may name, as seen at planning time. */
export function specSlots(s: WarBoard, side: Side, spec: TargetSpec, excludeUid?: string): SlotRef[] {
  const foe = other(side);
  const out: SlotRef[] = [];
  const add = (sd: Side, units: boolean, towers: boolean) => {
    const p = s.players[sd];
    for (const lane of LANES) {
      const u = p.active[lane];
      if (u) { if (u.uid !== excludeUid && (sd === side || !u.stealth) && units) out.push({ side: sd, lane }); }
      else if (towers && towerAlive(p, lane)) out.push({ side: sd, lane });
    }
  };
  switch (spec) {
    case 'enemy': add(foe, true, true); break;
    case 'enemy_unit': add(foe, true, false); break;
    case 'ally': add(side, true, true); break;
    case 'ally_unit': add(side, true, false); break;
    case 'any_unit': add(foe, true, false); add(side, true, false); break;
  }
  return out;
}

const sameSlot = (a: SlotRef | undefined, b: SlotRef) => !!a && a.side === b.side && a.lane === b.lane;

/** Every order the unit in `lane` could be given (not counting emeralds for moves). */
export function orderOptions(s: WarBoard, side: Side, lane: Lane): Order[] {
  if (!canOrder(s, side, lane)) return [];
  const p = s.players[side];
  const u = p.active[lane]!;
  const foe = other(side);
  const out: Order[] = [];
  if (u.power > 0) for (const l of reachOf(lane, u.keywords.includes('ranged'))) out.push({ k: 'attack', target: { side: foe, lane: l } });
  const m = moveOf(defOf(u.slug, s.extraDefs));
  if (m) {
    if (m.target) for (const t of specSlots(s, side, m.target, u.uid)) out.push({ k: 'move', target: t });
    else out.push({ k: 'move' });
  }
  if (WAR.brace) out.push({ k: 'brace' });
  p.garrison.forEach((_, g) => out.push({ k: 'switch', garrison: g }));
  if (lane > 0) out.push({ k: 'shift', dir: -1 });
  if (lane < 2) out.push({ k: 'shift', dir: 1 });
  return out;
}

export function planCost(s: WarBoard, side: Side, plan: Plan): number {
  const p = s.players[side];
  let cost = 0;
  plan.orders.forEach((o, lane) => {
    if (o?.k === 'move') cost += moveCost(moveOf(defOf(p.active[lane]!.slug, s.extraDefs))?.cost ?? 0);
  });
  for (const d of plan.deploys) {
    const h = p.hand?.find(x => x.uid === d.uid);
    if (h) cost += emeraldCost(defOf(h.slug, s.extraDefs).cost);
  }
  if (plan.hq) cost += hqAbility(p).cost ?? 0;
  return cost;
}

function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new WarError(msg);
}

/** Throws WarError with a readable reason if the plan is not legal now. */
export function validatePlan(s: WarBoard, side: Side, plan: Plan) {
  const p = s.players[side];
  need(Array.isArray(plan.orders) && plan.orders.length === 3, 'One order slot per lane');
  const switched = new Set<number>();
  plan.orders.forEach((o, i) => {
    if (!o) return;
    const lane = i as Lane;
    need(canOrder(s, side, lane), 'That slot has no unit able to act');
    const opts = orderOptions(s, side, lane);
    const ok = opts.some(x => x.k === o.k && (
      x.k === 'attack' ? sameSlot((o as typeof x).target, x.target)
        : x.k === 'move' ? (!x.target && !(o as typeof x).target) || (!!x.target && sameSlot((o as typeof x).target, x.target))
          : x.k === 'switch' ? (o as typeof x).garrison === x.garrison
            : x.k === 'shift' ? (o as typeof x).dir === x.dir : true));
    need(ok, `Not a legal order for lane ${lane}`);
    if (o.k === 'move' && o.attack) {
      need(WAR.moveAndAttack, 'A move cannot also attack');
      need(opts.some(x => x.k === 'attack' && sameSlot(o.attack, x.target)), `Not a legal attack for lane ${lane}`);
    }
    if (o.k === 'shift' && o.attack) {
      need(WAR.shiftAttack, 'A shift cannot also attack');
      const u = p.active[lane]!;
      const to = (lane + o.dir) as Lane;
      need(WAR.shiftAttack === true || !p.active[to], 'Only a shift into an empty slot can also attack');
      need(u.power > 0 && o.attack.side === other(side) && LANES.includes(o.attack.lane)
        && reachOf(to, u.keywords.includes('ranged')).includes(o.attack.lane), `Not a legal attack after that shift`);
    }
    if (o.k === 'switch') { need(!switched.has(o.garrison), 'Two switches with one garrison unit'); switched.add(o.garrison); }
  });
  const uids = new Set<string>();
  const lanes = new Set<Lane>();
  let toGarrison = 0;
  for (const d of plan.deploys) {
    need(!uids.has(d.uid), 'A card can only be deployed once');
    uids.add(d.uid);
    const h = p.hand?.find(x => x.uid === d.uid);
    need(h, 'That card is not in your hand');
    if (d.to === 'garrison') toGarrison++;
    else {
      need(LANES.includes(d.to) && !p.active[d.to] && !lanes.has(d.to), 'Deploy into an empty slot');
      lanes.add(d.to);
    }
    const a = playOf(defOf(h.slug, s.extraDefs));
    if (a?.target) {
      const valid = specSlots(s, side, a.target);
      need(!valid.length || valid.some(v => sameSlot(d.target, v)), 'Not a valid target for that card');
    }
  }
  need(p.garrison.length + toGarrison <= WAR.garrison, 'The garrison is full');
  if (plan.hq) {
    const a = hqAbility(p);
    if (a.target) need(specSlots(s, side, a.target).some(v => sameSlot(plan.hq!.target, v)), 'Not a valid target for the tank');
  }
  need(planCost(s, side, plan) <= p.emeralds, 'Not enough emeralds');
}

// --- Actions -------------------------------------------------------------------

export function applyWarAction(state: WarState, side: Side, action: WarAction): WarState {
  const c = new Ctx(cloneWar(state));
  const s = c.s;
  need(s.phase !== 'over', 'The war is over');
  if (action.type === 'concede') { end(c, other(side), 'concede'); return c.finish(); }
  if (s.phase === 'mulligan') {
    if (action.type === 'timeout') {
      for (const p of s.players) p.mulliganed = true;
      startRound(c);
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
    if (s.players.every(x => x.mulliganed)) startRound(c);
    return c.finish();
  }
  if (action.type === 'timeout') {
    // A player who runs out of time braces every unit that can act, and the
    // miss counts toward the three-in-a-row forfeit.
    s.players.forEach((p, side) => {
      if (p.plan) return;
      p.timeouts++;
      p.plan = { orders: LANES.map(l => (WAR.brace && canOrder(s, side as Side, l) ? { k: 'brace' as const } : null)), deploys: [] };
    });
    const out = s.players.findIndex(p => p.timeouts >= 3);
    if (out >= 0) { end(c, other(out as Side), 'timeout'); return c.finish(); }
    resolveRound(c);
    return c.finish();
  }
  need(action.type === 'plan', 'Unknown action');
  const p = s.players[side];
  need(!p.plan, 'Your orders are already in');
  validatePlan(s, side, action.plan);
  p.plan = structuredClone(action.plan);
  p.timeouts = 0;
  if (s.players.every(x => x.plan)) resolveRound(c);
  return c.finish();
}

/**
 * Resolve one round from both plans without validating them, on a copy.
 * For the bot's lookahead and the lab: callers build plans from
 * orderOptions/specSlots, and a quiet state skips the log.
 */
export function simulateRound(state: WarState, plans: [Plan, Plan], seed: number): WarState {
  const c = new Ctx(cloneWar({ ...state, rng: seed >>> 0 }));
  if (c.s.phase !== 'plan') return c.s;
  c.s.players[0].plan = plans[0];
  c.s.players[1].plan = plans[1];
  resolveRound(c);
  return c.finish();
}
