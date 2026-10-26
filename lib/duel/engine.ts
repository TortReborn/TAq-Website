// The Tank Duels rules engine. Pure: applyAction(state, side, action) returns
// a new state and never touches the one it was given. The server is the only
// place a GameState exists in full; players get a GameView (view.ts).
//
// Rules in brief (full text in lib/duel/README.md):
//   - 20-card decks, heroes start at 20 health, first player draws 3 and
//     skips the turn-one draw, second draws 5 and holds the Pearl (+1 tide
//     once). Simulations put the first seat at 55% with anything less.
//   - Tide (mana) grows by 1 a turn to 10 and refills every turn.
//   - Up to 5 units on the board. A unit can act once a turn, attacking or
//     using its move, starting the turn after it is played (unless Rush).
//   - Guard units must be attacked first. Combat damage is simultaneous.
//   - Elements are identity (stat shape and ability pool), not a damage
//     wheel: a type-advantage bonus made mono-element matchups 80/20 in
//     simulation, decided before a card was played.

import { getCard } from './catalog';
import { Rng } from './rng';
import { RULES, tankAbility, tankElement } from './rules';
import type {
  Ability, Action, CardDef, CardInst, Effect, EffectTarget, Element, GameState,
  LogEvent, PlayerState, Side, TargetRef, TargetSpec, Unit,
} from './types';

export { MULLIGAN_SECONDS, RULES, tankAbility, tankElement, TURN_SECONDS, type Rules } from './rules';

export const RULES_VERSION = 2;
/** Shipped value; the engine reads RULES.heroHp so the balance lab can vary it. */
export const HERO_HP = RULES.heroHp;
export const DECK_SIZE = 20;
export const BOARD_SLOTS = 5;
export const MAX_HAND = 8;
export const MAX_TIDE = 10;
export const START_HAND: [number, number] = [...RULES.startHand];
/** Player-turns before the game is called on hero health. */
export const TURN_LIMIT = 50;
export const MAX_TIMEOUTS = 3;
const LOG_KEEP = 200;

export class ActionError extends Error {}

// --- Lookups ---------------------------------------------------------------

export type ExtraDefs = Record<string, CardDef>;

/** Cards outside the static catalog (member cards) ride along with the match. */
export function defOf(slug: string, extra?: ExtraDefs): CardDef {
  const d = extra?.[slug] ?? getCard(slug);
  if (!d) throw new ActionError(`Unknown card ${slug}`);
  return d;
}

/** The parts of a state or a view that target rules need. */
export interface BoardLike {
  turn: number;
  active: Side;
  phase: GameState['phase'];
  players: [{ board: Unit[]; tide: number }, { board: Unit[]; tide: number }];
}

export function other(side: Side): Side {
  return side === 0 ? 1 : 0;
}

export function findUnit(s: BoardLike, uid: string): { side: Side; index: number; unit: Unit } | null {
  for (const side of [0, 1] as Side[]) {
    const index = s.players[side].board.findIndex(u => u.uid === uid);
    if (index >= 0) return { side, index, unit: s.players[side].board[index] };
  }
  return null;
}

export function canAct(s: BoardLike, u: Unit): boolean {
  return u.ready && s.turn > u.frozenUntil;
}

export function moveOf(def: CardDef): Ability | undefined {
  return def.abilities.find(a => a.when === 'move');
}

export function playOf(def: CardDef): Ability | undefined {
  return def.abilities.find(a => a.when === 'play');
}

/** Targets `side` may choose for a spec. Enemy stealth units are never choosable. */
export function specTargets(s: BoardLike, side: Side, spec: TargetSpec, excludeUid?: string): TargetRef[] {
  const foe = other(side);
  const enemyUnits = s.players[foe].board.filter(u => !u.stealth).map(u => ({ kind: 'unit', uid: u.uid }) as TargetRef);
  const allyUnits = s.players[side].board.filter(u => u.uid !== excludeUid).map(u => ({ kind: 'unit', uid: u.uid }) as TargetRef);
  switch (spec) {
    case 'enemy': return [{ kind: 'hero', side: foe }, ...enemyUnits];
    case 'enemy_unit': return enemyUnits;
    case 'ally': return [{ kind: 'hero', side }, ...allyUnits];
    case 'ally_unit': return allyUnits;
    case 'any_unit': return [...enemyUnits, ...allyUnits];
  }
}

export function attackTargets(s: BoardLike, side: Side, uid: string): TargetRef[] {
  const found = findUnit(s, uid);
  if (!found || found.side !== side || !canAct(s, found.unit) || found.unit.power <= 0) return [];
  const foe = other(side);
  const visible = s.players[foe].board.filter(u => !u.stealth);
  const guards = visible.filter(u => u.keywords.includes('guard'));
  if (guards.length) return guards.map(u => ({ kind: 'unit', uid: u.uid }));
  return [{ kind: 'hero', side: foe }, ...visible.map(u => ({ kind: 'unit', uid: u.uid }) as TargetRef)];
}

export function sameTarget(a: TargetRef, b: TargetRef): boolean {
  return a.kind === 'hero' ? b.kind === 'hero' && b.side === a.side : b.kind === 'unit' && b.uid === a.uid;
}

// --- Setup -----------------------------------------------------------------

export interface PlayerSetup {
  name: string;
  avatar: string;
  deck: string[];
  /** Defaults to the deck's main element (tankElement). */
  tank?: Element;
}

/** The Tank ability a player can use now, if any (tide and board aside). */
export function tankOf(p: { tank?: Element | null }): Ability | undefined {
  return RULES.tanks && p.tank ? tankAbility(p.tank) : undefined;
}

/** Why the Tank ability cannot be used right now, or null if it can. */
export function tankBlocked(s: BoardLike, side: Side, p: { tank?: Element | null; tankUsed?: boolean; tide: number }): string | null {
  const a = tankOf(p);
  if (!a) return 'No Tank ability';
  if (s.phase !== 'main' || s.active !== side) return 'Not your turn';
  if (p.tankUsed) return 'Your tank has already acted this turn';
  if (p.tide < (a.cost ?? 0)) return 'Not enough tide';
  if (a.effects.some(e => e.k === 'summon') && s.players[side].board.length >= BOARD_SLOTS) return 'Your board is full';
  if (a.target && !specTargets(s, side, a.target).length) return 'No valid target';
  return null;
}

export function createGame(seed: number, setups: [PlayerSetup, PlayerSetup], extraDefs?: ExtraDefs): GameState {
  const rng = new Rng(seed >>> 0);
  let uid = 1;
  const first: Side = rng.int(2) as Side;
  const players = setups.map((p, i) => {
    const deck: CardInst[] = rng.shuffle(p.deck.map(slug => ({ uid: `c${uid++}`, slug })));
    const handSize = RULES.startHand[(i as Side) === first ? 0 : 1];
    const hand = deck.splice(0, handSize);
    const player: PlayerState = {
      name: p.name, avatar: p.avatar, hp: RULES.heroHp, tide: 0, maxTide: 0,
      deck, hand, board: [], graveyard: [], fatigue: 0,
      pearl: (i as Side) !== first, mulliganed: false, timeouts: 0,
      tank: p.tank ?? tankElement(p.deck.map(slug => defOf(slug, extraDefs))), tankUsed: false,
    };
    return player;
  }) as [PlayerState, PlayerState];
  const state: GameState = {
    rules: RULES_VERSION, rng: rng.state, phase: 'mulligan', turn: 0, active: first, first,
    players, winner: null, endReason: null, nextUid: uid, log: [{ k: 'start', first }], logBase: 0,
  };
  if (extraDefs && Object.keys(extraDefs).length) state.extraDefs = extraDefs;
  return state;
}

// --- Mutation context ------------------------------------------------------

class Ctx {
  rng: Rng;
  constructor(public s: GameState) {
    this.rng = new Rng(s.rng);
  }
  def(slug: string): CardDef {
    return defOf(slug, this.s.extraDefs);
  }
  log(e: LogEvent) {
    this.s.log.push(e);
  }
  uid(): string {
    return `c${this.s.nextUid++}`;
  }
  finish(): GameState {
    this.s.rng = this.rng.state;
    if (this.s.log.length > LOG_KEEP) {
      const drop = this.s.log.length - LOG_KEEP;
      this.s.log = this.s.log.slice(drop);
      this.s.logBase += drop;
    }
    return this.s;
  }
}

function clonePlayer(p: PlayerState): PlayerState {
  return {
    ...p,
    deck: p.deck.slice(),
    hand: p.hand.slice(),
    board: p.board.map(u => ({ ...u, keywords: u.keywords.slice() })),
    graveyard: p.graveyard.slice(),
  };
}

export function cloneState<T extends GameState>(s: T): T {
  return { ...s, players: [clonePlayer(s.players[0]), clonePlayer(s.players[1])], log: s.log.slice() };
}

// --- Primitives ------------------------------------------------------------

function makeUnit(def: CardDef, uid: string): Unit {
  return {
    uid, slug: def.slug, power: def.power, health: def.health, maxHealth: def.health,
    keywords: def.keywords.slice(), ready: def.keywords.includes('rush'),
    shield: def.keywords.includes('shield'), stealth: def.keywords.includes('stealth'), frozenUntil: 0,
  };
}

function resolveRef(c: Ctx, ref: TargetRef): { hero: Side } | { unit: Unit; side: Side } | null {
  if (ref.kind === 'hero') return { hero: ref.side };
  const f = findUnit(c.s, ref.uid);
  return f && f.unit.health > 0 ? { unit: f.unit, side: f.side } : null;
}

/** Returns damage actually dealt (0 if a shield took it). */
function damage(c: Ctx, ref: TargetRef, n: number): number {
  if (n <= 0) return 0;
  const r = resolveRef(c, ref);
  if (!r) return 0;
  if ('hero' in r) {
    c.s.players[r.hero].hp -= n;
    c.log({ k: 'damage', target: ref, n, hp: c.s.players[r.hero].hp });
    return n;
  }
  if (r.unit.shield) {
    r.unit.shield = false;
    c.log({ k: 'shield', uid: r.unit.uid });
    return 0;
  }
  r.unit.health -= n;
  c.log({ k: 'damage', target: ref, n, hp: r.unit.health });
  return n;
}

function heal(c: Ctx, ref: TargetRef, n: number) {
  const r = resolveRef(c, ref);
  if (!r || n <= 0) return;
  if ('hero' in r) {
    const p = c.s.players[r.hero];
    const got = Math.min(n, RULES.heroHp - p.hp);
    if (got > 0) {
      p.hp += got;
      c.log({ k: 'heal', target: ref, n: got, hp: p.hp });
    }
    return;
  }
  const got = Math.min(n, r.unit.maxHealth - r.unit.health);
  if (got > 0) {
    r.unit.health += got;
    c.log({ k: 'heal', target: ref, n: got, hp: r.unit.health });
  }
}

function draw(c: Ctx, side: Side, n: number) {
  const p = c.s.players[side];
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    const card = p.deck.shift();
    if (!card) {
      p.fatigue++;
      c.log({ k: 'fatigue', side, n: p.fatigue });
      damage(c, { kind: 'hero', side }, p.fatigue);
      continue;
    }
    if (p.hand.length >= MAX_HAND) {
      p.graveyard.push(card.slug);
      c.log({ k: 'burn', side, slug: card.slug });
      continue;
    }
    p.hand.push(card);
    drawn++;
  }
  if (drawn) c.log({ k: 'draw', side, n: drawn });
}

function summon(c: Ctx, side: Side, slug: string): Unit | null {
  const board = c.s.players[side].board;
  if (board.length >= BOARD_SLOTS) return null;
  const unit = makeUnit(c.def(slug), c.uid());
  board.push(unit);
  c.log({ k: 'play', side, slug, uid: unit.uid });
  return unit;
}

function unitRef(u: Unit): TargetRef {
  return { kind: 'unit', uid: u.uid };
}

function effectTargets(c: Ctx, side: Side, t: EffectTarget, sourceUid: string | null, chosen?: TargetRef): TargetRef[] {
  const foe = other(side);
  const alive = (u: Unit) => u.health > 0;
  switch (t) {
    case 'chosen': return chosen && resolveRef(c, chosen) ? [chosen] : [];
    case 'self': {
      const f = sourceUid ? findUnit(c.s, sourceUid) : null;
      return f && alive(f.unit) ? [unitRef(f.unit)] : [];
    }
    case 'enemy_hero': return [{ kind: 'hero', side: foe }];
    case 'ally_hero': return [{ kind: 'hero', side }];
    case 'all_enemy_units': return c.s.players[foe].board.filter(alive).map(unitRef);
    case 'all_ally_units': return c.s.players[side].board.filter(alive).map(unitRef);
    case 'other_ally_units': return c.s.players[side].board.filter(u => alive(u) && u.uid !== sourceUid).map(unitRef);
    case 'all_other_units':
      return [...c.s.players[side].board, ...c.s.players[foe].board].filter(u => alive(u) && u.uid !== sourceUid).map(unitRef);
    case 'random_enemy_unit': {
      const xs = c.s.players[foe].board.filter(alive);
      return xs.length ? [unitRef(c.rng.pick(xs))] : [];
    }
    case 'random_enemy': {
      const xs: TargetRef[] = [{ kind: 'hero', side: foe }, ...c.s.players[foe].board.filter(alive).map(unitRef)];
      return [c.rng.pick(xs)];
    }
  }
}

function freezeUntil(c: Ctx, owner: Side): number {
  return c.s.turn + (owner === c.s.active ? 2 : 1);
}

function applyEffect(c: Ctx, side: Side, e: Effect, sourceUid: string | null, chosen?: TargetRef) {
  switch (e.k) {
    case 'damage':
      for (const t of effectTargets(c, side, e.t, sourceUid, chosen)) damage(c, t, e.n);
      return;
    case 'heal':
      for (const t of effectTargets(c, side, e.t, sourceUid, chosen)) heal(c, t, e.n);
      return;
    case 'buff':
      for (const t of effectTargets(c, side, e.t, sourceUid, chosen)) {
        const r = resolveRef(c, t);
        if (!r || 'hero' in r) continue;
        r.unit.power += e.atk;
        r.unit.health += e.hp;
        r.unit.maxHealth += e.hp;
      }
      return;
    case 'draw':
      draw(c, side, e.n);
      return;
    case 'freeze':
      for (const t of effectTargets(c, side, e.t, sourceUid, chosen)) {
        const r = resolveRef(c, t);
        if (!r || 'hero' in r) continue;
        r.unit.frozenUntil = Math.max(r.unit.frozenUntil, freezeUntil(c, r.side));
        c.log({ k: 'freeze', uid: r.unit.uid });
      }
      return;
    case 'bounce':
      for (const t of effectTargets(c, side, e.t, sourceUid, chosen)) {
        const r = resolveRef(c, t);
        if (!r || 'hero' in r) continue;
        const def = c.def(r.unit.slug);
        if (e.maxCost !== undefined && def.cost > e.maxCost) continue;
        const owner = c.s.players[r.side];
        owner.board = owner.board.filter(u => u.uid !== r.unit.uid);
        c.log({ k: 'bounce', uid: r.unit.uid, slug: r.unit.slug });
        if (def.tier === 'token') continue;
        if (owner.hand.length >= MAX_HAND) {
          owner.graveyard.push(r.unit.slug);
          c.log({ k: 'burn', side: r.side, slug: r.unit.slug });
        } else {
          owner.hand.push({ uid: c.uid(), slug: r.unit.slug });
        }
      }
      return;
    case 'summon':
      for (let i = 0; i < e.n; i++) summon(c, side, e.token);
      return;
    case 'tide': {
      const p = c.s.players[side];
      p.tide = Math.min(MAX_TIDE, p.tide + e.n);
      return;
    }
    case 'grant':
      for (const t of effectTargets(c, side, e.t, sourceUid, chosen)) {
        const r = resolveRef(c, t);
        if (!r || 'hero' in r) continue;
        if (!r.unit.keywords.includes(e.kw)) r.unit.keywords.push(e.kw);
        if (e.kw === 'shield') r.unit.shield = true;
        if (e.kw === 'stealth') r.unit.stealth = true;
        if (e.kw === 'rush' && r.side === c.s.active) r.unit.ready = true;
      }
      return;
    case 'destroy':
      for (const t of effectTargets(c, side, e.t, sourceUid, chosen)) {
        const r = resolveRef(c, t);
        if (!r || 'hero' in r) continue;
        if (e.maxPower !== undefined && r.unit.power > e.maxPower) continue;
        r.unit.health = 0;
      }
      return;
    case 'chain':
      for (let i = 0; i < e.n; i++) {
        const foe = other(side);
        const xs: TargetRef[] = [{ kind: 'hero', side: foe }, ...c.s.players[foe].board.filter(u => u.health > 0).map(unitRef)];
        damage(c, c.rng.pick(xs), 1);
      }
      return;
  }
}

function runAbility(c: Ctx, side: Side, a: Ability, sourceUid: string | null, chosen?: TargetRef) {
  for (const e of a.effects) applyEffect(c, side, e, sourceUid, chosen);
}

/** Remove dead units (active side first, left to right), then fire their death abilities. */
function resolveDeaths(c: Ctx) {
  for (let guard = 0; guard < 50; guard++) {
    const pending: { side: Side; ability: Ability }[] = [];
    for (const side of [c.s.active, other(c.s.active)]) {
      const p = c.s.players[side];
      const dead = p.board.filter(u => u.health <= 0);
      if (!dead.length) continue;
      p.board = p.board.filter(u => u.health > 0);
      for (const u of dead) {
        const def = c.def(u.slug);
        if (def.tier !== 'token') p.graveyard.push(u.slug);
        c.log({ k: 'death', side, slug: u.slug, uid: u.uid });
        for (const a of def.abilities) if (a.when === 'death') pending.push({ side, ability: a });
      }
    }
    if (!pending.length) return;
    for (const { side, ability } of pending) runAbility(c, side, ability, null);
  }
}

function checkWinner(c: Ctx): boolean {
  if (c.s.phase === 'over') return true;
  const [a, b] = c.s.players;
  if (a.hp > 0 && b.hp > 0) return false;
  const winner: Side | null = a.hp <= 0 && b.hp <= 0 ? null : a.hp <= 0 ? 1 : 0;
  end(c, winner, 'hero');
  return true;
}

function end(c: Ctx, winner: Side | null, reason: GameState['endReason'] & string) {
  c.s.phase = 'over';
  c.s.winner = winner;
  c.s.endReason = reason;
  c.log({ k: 'end', winner, reason });
}

function beginTurn(c: Ctx) {
  const side = c.s.active;
  const p = c.s.players[side];
  c.log({ k: 'turn', side, turn: c.s.turn });
  p.maxTide = Math.min(MAX_TIDE, p.maxTide + 1);
  p.tide = p.maxTide;
  p.tankUsed = false;
  // Going first is worth about a card (see START_HAND).
  if (c.s.turn > 1) draw(c, side, 1);
  for (const u of p.board) {
    u.ready = true;
    if (u.keywords.includes('regen')) heal(c, unitRef(u), 2);
  }
  for (const u of p.board.slice()) {
    for (const a of c.def(u.slug).abilities) if (a.when === 'turn_start') runAbility(c, side, a, u.uid);
  }
  resolveDeaths(c);
  checkWinner(c);
}

function endTurn(c: Ctx) {
  if (c.s.turn >= TURN_LIMIT) {
    const [a, b] = c.s.players;
    end(c, a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1, 'turn_limit');
    return;
  }
  c.s.turn++;
  c.s.active = other(c.s.active);
  beginTurn(c);
}

function startMain(c: Ctx) {
  c.s.phase = 'main';
  c.s.turn = 1;
  c.s.active = c.s.first;
  beginTurn(c);
}

// --- Actions ---------------------------------------------------------------

function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new ActionError(msg);
}

function requireTarget(valid: TargetRef[], target: TargetRef | undefined): TargetRef | undefined {
  if (!valid.length) return undefined;
  need(target, 'Choose a target');
  need(valid.some(v => sameTarget(v, target)), 'Not a valid target');
  return target;
}

export function applyAction<T extends GameState>(state: T, side: Side, action: Action): T {
  const c = new Ctx(cloneState(state) as GameState);
  const s = c.s;
  need(s.phase !== 'over', 'The duel is over');

  if (action.type === 'concede') {
    end(c, other(side), 'concede');
    return c.finish() as T;
  }

  if (s.phase === 'mulligan') {
    if (action.type === 'timeout') {
      for (const p of s.players) p.mulliganed = true;
      startMain(c);
      return c.finish() as T;
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
    if (s.players.every(x => x.mulliganed)) startMain(c);
    return c.finish() as T;
  }

  if (action.type === 'timeout') {
    const p = s.players[s.active];
    p.timeouts++;
    c.log({ k: 'timeout', side: s.active });
    if (p.timeouts >= MAX_TIMEOUTS) end(c, other(s.active), 'timeout');
    else endTurn(c);
    return c.finish() as T;
  }

  need(s.active === side, 'Not your turn');
  const me = s.players[side];

  switch (action.type) {
    case 'play': {
      const idx = me.hand.findIndex(h => h.uid === action.uid);
      need(idx >= 0, 'That card is not in your hand');
      const def = c.def(me.hand[idx].slug);
      need(me.tide >= def.cost, 'Not enough tide');
      need(me.board.length < BOARD_SLOTS, 'Your board is full');
      const ability = playOf(def);
      // Validate the target before anything changes, against the board as it
      // stands; the new unit is not a legal target for its own entry effect.
      const chosen = ability?.target ? requireTarget(specTargets(s, side, ability.target), action.target) : undefined;
      me.tide -= def.cost;
      me.hand.splice(idx, 1);
      const unit = makeUnit(def, action.uid);
      me.board.push(unit);
      c.log({ k: 'play', side, slug: def.slug, uid: unit.uid });
      if (ability) runAbility(c, side, ability, unit.uid, chosen);
      break;
    }
    case 'attack': {
      const valid = attackTargets(s, side, action.uid);
      need(valid.length, 'That unit cannot attack');
      need(valid.some(v => sameTarget(v, action.target)), 'Not a valid attack target');
      const att = findUnit(s, action.uid)!.unit;
      att.ready = false;
      att.stealth = false;
      c.log({ k: 'attack', side, uid: att.uid, target: action.target });
      let dealt = 0;
      if (action.target.kind === 'hero') {
        dealt = damage(c, action.target, att.power);
      } else {
        const def = findUnit(s, action.target.uid)!.unit;
        const hit = att.power;
        const back = def.power;
        const before = def.health;
        const shielded = def.shield;
        dealt = damage(c, action.target, hit);
        if (att.keywords.includes('pierce') && !shielded && hit > before) {
          dealt += damage(c, { kind: 'hero', side: other(side) }, hit - before);
        }
        if (!att.keywords.includes('ranged')) damage(c, unitRef(att), back);
      }
      if (att.keywords.includes('drain') && dealt > 0) heal(c, { kind: 'hero', side }, dealt);
      break;
    }
    case 'move': {
      const f = findUnit(s, action.uid);
      need(f && f.side === side, 'Not your unit');
      need(canAct(s, f.unit), 'That unit cannot act this turn');
      const move = moveOf(c.def(f.unit.slug));
      need(move, 'That unit has no move');
      need(me.tide >= (move.cost ?? 0), 'Not enough tide');
      const chosen = move.target ? requireTarget(specTargets(s, side, move.target, f.unit.uid), action.target) : undefined;
      need(!move.target || chosen, 'No valid target for that move');
      me.tide -= move.cost ?? 0;
      f.unit.ready = false;
      f.unit.stealth = false;
      c.log({ k: 'move', side, uid: f.unit.uid, name: move.name ?? 'Move' });
      runAbility(c, side, move, f.unit.uid, chosen);
      break;
    }
    case 'tank': {
      const blocked = tankBlocked(s, side, me);
      need(!blocked, blocked ?? '');
      const ability = tankOf(me)!;
      const chosen = ability.target ? requireTarget(specTargets(s, side, ability.target), action.target) : undefined;
      me.tide -= ability.cost ?? 0;
      me.tankUsed = true;
      c.log({ k: 'tank', side, name: ability.name ?? 'Tank' });
      runAbility(c, side, ability, null, chosen);
      break;
    }
    case 'pearl': {
      need(me.pearl, 'The Pearl is spent');
      me.pearl = false;
      me.tide = Math.min(MAX_TIDE, me.tide + 1);
      c.log({ k: 'pearl', side });
      break;
    }
    case 'end_turn': {
      me.timeouts = 0;
      endTurn(c);
      return c.finish() as T;
    }
    default:
      throw new ActionError('Unknown action');
  }

  resolveDeaths(c);
  checkWinner(c);
  return c.finish() as T;
}

// --- Enumeration (practice bot, simulations, UI hints) --------------------

export function legalActions(s: GameState, side: Side): Action[] {
  if (s.phase === 'over') return [];
  if (s.phase === 'mulligan') return s.players[side].mulliganed ? [] : [{ type: 'mulligan', replace: [] }];
  if (s.active !== side) return [];
  const me = s.players[side];
  const out: Action[] = [];
  if (me.board.length < BOARD_SLOTS) {
    for (const h of me.hand) {
      const def = defOf(h.slug, s.extraDefs);
      if (def.cost > me.tide) continue;
      const a = playOf(def);
      const targets = a?.target ? specTargets(s, side, a.target) : [];
      if (targets.length) for (const target of targets) out.push({ type: 'play', uid: h.uid, target });
      else out.push({ type: 'play', uid: h.uid });
    }
  }
  for (const u of me.board) {
    for (const target of attackTargets(s, side, u.uid)) out.push({ type: 'attack', uid: u.uid, target });
    if (!canAct(s, u)) continue;
    const m = moveOf(defOf(u.slug, s.extraDefs));
    if (!m || (m.cost ?? 0) > me.tide) continue;
    if (m.target) for (const target of specTargets(s, side, m.target, u.uid)) out.push({ type: 'move', uid: u.uid, target });
    else out.push({ type: 'move', uid: u.uid });
  }
  if (!tankBlocked(s, side, me)) {
    const t = tankOf(me)!;
    if (t.target) for (const target of specTargets(s, side, t.target)) out.push({ type: 'tank', target });
    else out.push({ type: 'tank' });
  }
  if (me.pearl) out.push({ type: 'pearl' });
  out.push({ type: 'end_turn' });
  return out;
}
