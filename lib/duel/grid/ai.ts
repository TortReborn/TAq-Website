// The Warfront bot. Turns alternate, so it plans like the duel bot
// (../ai.ts): sequential single actions with a plan search on top.
//
//   - Candidates. An order is one unit's move (or staying put) plus its
//     follow-up: an attack, its move ability or a brace. With about 10
//     destinations and 3 follow-ups per unit the space is large, so every
//     candidate gets a quick prior first (damage and kills, strike-back
//     taken, HQ damage, node claims, standing on an enemy node to cut its
//     chain, advance toward the enemy HQ) and only the best `prune` are
//     simulated. Deploys (each affordable card on a few tiles: the most
//     forward, the most sheltered) and the HQ ability are candidates too.
//   - Greedy: simulate each candidate on a copy, score the result, take the
//     best, repeat until nothing beats ending the turn.
//   - Plan search (mode 'full'): the `width` best first steps, each finished
//     greedily, and each plan's end state scored after the opponent's best
//     greedy reply (their board and HQ only: their hand is hidden). Keep the
//     best plan, then play it out, re-planning greedily if a random effect
//     makes a planned step illegal.
// The score reads only what the bot could know: its own deck is shuffled
// with the bot's own seed before any lookahead, the opponent's hand and deck
// are emptied, and simulations run on a fresh RNG seed.

import { Rng } from '../rng';
import type { Ability, Effect, Side } from '../types';
import {
  armourGrown, attackTargets, canStartOrder, connectedNodes, deployTiles, distance, elementOf, flankBonus, gridDef, hqSideAt, isAdjacent,
  isBraced, isFrozen, isRanged, moveOptions, moveRange, nodeAt, other, braceShare, outnumberedBonus, rulesOf, scoreOf, scoreRate, type GridBoard,
} from './board';
import { GRID, type GridConfig } from './config';
import {
  abilityCost, applyGridAction, cardCost, gridHqAbility, legalGridActions, moveOf, playOf, specTiles,
} from './engine';
import type { GridAction, GridState, GridUnit } from './types';

export interface GridBotParams {
  mode: 'full' | 'greedy' | 'random';
  /** First steps the plan search finishes and compares. */
  width: number;
  /** Score each plan after the opponent's greedy reply. */
  reply: boolean;
  /** Candidate orders simulated per greedy step (the best by prior). */
  prune: number;
  /** Candidates simulated per step inside the opponent's reply. */
  replyPrune: number;
  /** Evaluation weights for this bot (default GRID_EVAL). */
  eval?: Partial<GridEval>;
}

/** Mutable only so the balance lab can vary it in-process. */
export const GRID_BOT: GridBotParams = { mode: 'full', width: 4, reply: true, prune: 14, replyPrune: 8 };

// --- Evaluation -----------------------------------------------------------------------

function unitValue(u: GridUnit, g: GridConfig = GRID): number {
  let v = (u.power + u.boost) * 1.2 + (u.health / g.healthMult) * 0.8;
  if (u.shield) v += 1.5;
  if (u.keywords.includes('guard')) v += 0.6;
  if (u.keywords.includes('ranged')) v += 0.3 * u.power;
  if (u.keywords.includes('pierce')) v += 0.2 * u.power;
  if (u.keywords.includes('drain')) v += 0.2 * u.power;
  if (u.keywords.includes('regen')) v += 0.6;
  if (u.stealth) v += 0.5;
  return v;
}

/** Rough reach of a unit next turn (Chebyshev): its move range plus its attack reach. */
function reachOf(b: GridBoard, u: GridUnit): number {
  const el = elementOf(b, u);
  // Water's range is its river run; off the river it takes one step.
  const g = rulesOf(b);
  const move = g.movement === 'uniform' ? 2 : el === 'water' ? 1 : moveRange(el, u.speed, g);
  return move + (isRanged(u) ? g.rangedReach : 1);
}

/** Nodes the active side will claim when it ends its turn now. */
function projected(s: GridState): GridBoard {
  const side = s.active;
  let changed = false;
  const nodes = s.nodes.map(n => {
    if (n.owner === side) return n;
    const u = s.units.find(x => x.tile === n.tile);
    if (!u || u.side !== side || (!rulesOf(s).claimAdjacent && s.units.some(v => v.side !== side && isAdjacent(s, v.tile, n.tile)))) return n;
    changed = true;
    return { ...n, owner: side };
  });
  return changed ? { ...s, nodes } : s;
}

/** Evaluation weights; mutable so the lab can try variants in-process. */
export const GRID_EVAL = {
  hq: 1.4, lowHq: 0.12, conn: 3.2, owned: 0.8, city: 1, hand: 0.8, emerald: 0.25,
  advance: 0.25, adjHq: 0.8, onNode: 0.4,
  /** Share of a unit's value lost when the enemy can kill it next turn (and part of it when they can hurt it). */
  danger: 0.5,
  /** Per point of damage the enemy can put on this HQ next turn, and per point this side threatens on theirs. */
  hqThreat: 0.6, pressure: 0.3,
  /**
   * Territory score (GRID.scoreTarget). The distance to the target, in HQ
   * health (hqHp / scoreTarget a point), is scored like the enemy's HQ: score
   * per point of it, lowScore steepening the last 10. What the side's nodes
   * will score next counts in full when it scores next (nothing can stop it)
   * and at rateHeld when the enemy moves first and may cut them.
   */
  score: 1.4, lowScore: 0.12, rateHeld: 0.6,
  /** 0: ignore the score entirely (a lab control: the bot blind to the score race). */
  scoreAware: 1,
};
export type GridEval = typeof GRID_EVAL;

/** The most damage the enemies in range could do to one target next turn: their best GRID.orders attackers, plus flanking. */
function threatOn(powers: number[], g: GridConfig): number {
  if (!powers.length) return 0;
  const top = powers.length > 1 ? powers.sort((x, y) => y - x).slice(0, g.orders) : powers;
  const flank = g.flank > 0 ? Math.min(g.flankCap, g.flank * (top.length - 1)) * top.length : 0;
  let sum = flank;
  for (const x of top) sum += x;
  return sum;
}

export function evaluateGrid(s: GridState, side: Side, w: GridEval = GRID_EVAL): number {
  if (s.phase === 'over') return s.winner === side ? 1e5 : s.winner === null ? 0 : -1e5;
  const b = projected(s);
  const g = rulesOf(s);
  // Whoever is active now is attacked next: their units and HQ carry the danger term.
  const exposed = s.active;
  const W = s.width;
  const units = s.units;
  const n = units.length;
  const X = new Array<number>(n), Y = new Array<number>(n), R = new Array<number>(n), live = new Array<boolean>(n);
  for (let i = 0; i < n; i++) {
    const u = units[i];
    X[i] = u.tile % W; Y[i] = (u.tile / W) | 0; R[i] = reachOf(b, u); live[i] = !isFrozen(s, u);
  }
  const cheb = (i: number, t: number) => Math.max(Math.abs(X[i] - (t % W)), Math.abs(Y[i] - ((t / W) | 0)));
  const linked = [connectedNodes(b, 0), connectedNodes(b, 1)];
  const T = w.scoreAware ? g.scoreTarget : 0;
  const rate = T > 0 ? [scoreRate(b, 0), scoreRate(b, 1)] : [0, 0];
  // A side that scores next and reaches the target with it has won: nothing happens before its upkeep scores.
  if (T > 0 && g.scoreWhen === 'start') {
    const nx = other(s.active);
    if (scoreOf(s.players[nx]) + rate[nx] >= T) return nx === side ? 5e4 : -5e4;
  }
  // Damage the enemies of 'sd' could put on 'sd's HQ next turn, after armour.
  const hqThreat = (sd: Side) => {
    const armour = g.armourPerNode * linked[sd].length + armourGrown(s, sd);
    const xs: number[] = [];
    for (let i = 0; i < n; i++) if (units[i].side !== sd && live[i] && cheb(i, s.hq[sd]) <= R[i] + Math.max(0, g.hqReach - 1)) xs.push(units[i].power + units[i].boost);
    if (!xs.length) return 0;
    xs.sort((x, y) => y - x);
    let t = 0;
    for (let k = 0; k < Math.min(g.orders, xs.length); k++) t += Math.max(Math.min(xs[k], g.armourMin), xs[k] - armour);
    return t;
  };
  const threatExposed = hqThreat(exposed);
  const pressureExposed = hqThreat(other(exposed));
  const score = (sd: Side) => {
    const p = s.players[sd];
    const foeHq = s.hq[other(sd)];
    const conn = linked[sd].length;
    let owned = 0, city = 0;
    for (const nd of b.nodes) if (nd.owner === sd) { owned++; if (nd.city && linked[sd].includes(nd.tile)) city++; }
    let v = w.hq * p.hp - (p.hp < 10 ? w.lowHq * (10 - p.hp) ** 2 : 0);
    if (T > 0) {
      // Distance to the score target in HQ health: the nearer, the steeper, as for an HQ.
      const next = sd !== s.active ? 1 : w.rateHeld;
      const d = Math.max(0, T - scoreOf(p) - next * rate[sd]) * (g.hqHp / T);
      v += w.score * (g.hqHp - d) + (d < 10 ? w.lowScore * (10 - d) ** 2 : 0);
    }
    v += w.conn * conn + w.owned * (owned - conn) + w.city * city;
    v += w.hand * Math.min(p.hand.length, 6) + w.emerald * p.emeralds;
    for (let i = 0; i < n; i++) {
      const u = units[i];
      if (u.side !== sd) continue;
      const base = unitValue(u, g);
      let uv = base;
      const d = cheb(i, foeHq);
      uv += w.advance * Math.max(0, 6 - d);
      if (d === 1) uv += w.adjHq;
      if (nodeAt(s, u.tile)) uv += w.onNode;
      if (sd === exposed) {
        let hurt = 0;
        if (!u.shield) {
          const xs: number[] = [];
          for (let j = 0; j < n; j++) {
            if (units[j].side === sd || !live[j]) continue;
            if (Math.max(Math.abs(X[j] - X[i]), Math.abs(Y[j] - Y[i])) <= R[j]) xs.push(units[j].power + units[j].boost);
          }
          // Braced through the enemy's turn: by order, or by the free stance it will take at end of turn.
          const byOrder = u.bracedUntil >= s.turn + 1;
          const auto = !byOrder && g.autoBrace !== 'off' && u.side === s.active && (!u.acted || (g.autoBrace === 'passive' && !u.fought));
          hurt = threatOn(xs, g) * (byOrder ? braceShare(s, u) : auto ? g.autoBraceTaken : 1);
        }
        // The enemy HQ fires at an adjacent unit at the start of its turn.
        if (g.hqFire > 0 && d <= Math.max(1, g.hqFireReach)) hurt += g.hqFire;
        const r = Math.min(1, hurt / Math.max(1, u.health));
        uv -= w.danger * base * (r >= 1 ? 1 : 0.5 * r * r);
      }
      v += uv;
    }
    if (sd === exposed) v += w.pressure * pressureExposed - w.hqThreat * threatExposed;
    return v;
  };
  return score(side) - score(other(side));
}

// --- Candidates ---------------------------------------------------------------------

function effectWorth(e: Effect): number {
  switch (e.k) {
    case 'damage': return e.t === 'self' || e.t === 'ally_hero' ? -e.n : e.n * (e.t.startsWith('all') ? 2 : 1.1);
    case 'chain': return e.n * 0.9;
    case 'heal': return e.n * 0.5;
    case 'buff': return (e.atk * 1.5 + e.hp * 0.6) * (e.t.startsWith('all') || e.t.startsWith('other') ? 2 : 1);
    case 'freeze': return e.t === 'all_enemy_units' ? 6 : 3;
    case 'draw': return 1.5 * e.n;
    case 'summon': return 2.5 * e.n;
    case 'tide': return 0.8 * e.n;
    case 'grant': return 2;
    case 'bounce': return 3;
    case 'destroy': return 4;
  }
}

/** The most useful tile for a targeted ability from `from`, by a quick guess. */
function bestTarget(s: GridState, side: Side, a: Ability, from: number, excludeUid?: string): number | undefined {
  if (!a.target) return undefined;
  const xs = specTiles(s, side, a.target, from, excludeUid);
  if (!xs.length) return undefined;
  const helps = a.effects.some(e => e.k === 'heal' || e.k === 'buff' || e.k === 'grant');
  const g = rulesOf(s);
  const score = (t: number) => {
    const u = s.units.find(x => x.tile === t);
    const h = hqSideAt(s, t);
    if (h !== null) return h === side ? (helps ? (g.hqHp - s.players[side].hp) * 0.4 : -9) : helps ? -9 : 2;
    if (!u) return -9;
    if (u.side === side) return helps ? (u.maxHealth - u.health) + unitValue(u, g) * 0.2 : -9;
    return helps ? -9 : unitValue(u, g) - u.health * 0.2;
  };
  return xs.reduce((a2, b) => (score(b) > score(a2) ? b : a2));
}

interface Cand { acts: GridAction[]; prior: number; uid?: string }

/** Total power of enemies that could hit `tile` next turn. */
function threatAt(s: GridState, side: Side, tile: number): number {
  let t = 0;
  for (const e of s.units) if (e.side !== side && s.turn + 1 > e.frozenUntil && distance(s, e.tile, tile) <= reachOf(s, e)) t += e.power + e.boost;
  return t;
}

function attackPrior(s: GridState, u: GridUnit, target: number): number {
  const side = u.side;
  const g = rulesOf(s);
  const power = u.power + u.boost + flankBonus(s, side, u.uid, target) + outnumberedBonus(s, side);
  const h = hqSideAt(s, target);
  if (h !== null) {
    const armour = g.armourPerNode * connectedNodes(s, h).length + armourGrown(s, h);
    const dealt = Math.max(g.armourMin, power - armour);
    return 2 + 1.6 * dealt + (dealt >= s.players[h].hp ? 1000 : 0);
  }
  const v = s.units.find(x => x.tile === target)!;
  const dealt = v.shield ? 0 : isBraced(s, v) ? Math.floor(power * braceShare(s, v)) : power;
  let pr = v.shield ? 1.5 : 0;
  if (dealt >= v.health) pr += 2 + unitValue(v, g);
  else pr += 0.7 * dealt;
  const back = g.retaliation && !isRanged(u) && !isRanged(v) && dealt < v.health && !isFrozen(s, v) ? v.power : 0;
  if (back) pr -= back >= u.health && !u.shield ? unitValue(u, g) : 0.6 * back;
  return pr;
}

function destPrior(s: GridState, u: GridUnit, dest: number): number {
  if (dest === u.tile) return 0;
  const side = u.side;
  const g = rulesOf(s);
  const foeHq = s.hq[other(side)];
  let pr = 0.3 * (distance(s, u.tile, foeHq) - distance(s, dest, foeHq));
  const n = nodeAt(s, dest);
  const enemyNear = (t: number) => s.units.some(v => v.side !== side && isAdjacent(s, v.tile, t));
  if (n && n.owner !== side && (g.claimAdjacent || !enemyNear(dest))) pr += n.city ? 4 : 3;
  if (n && n.owner === other(side)) pr += 2;
  if (isAdjacent(s, dest, foeHq)) pr += 1 - 0.4 * g.hqFire;
  // Standing next to own nodes and the HQ keeps chains alive.
  if (isAdjacent(s, dest, s.hq[side])) pr += 0.2;
  const threat = threatAt(s, side, dest);
  if (threat >= u.health) pr -= 0.4 * unitValue(u, g);
  return pr;
}

/** Order candidates for one unit (it can start an order, or it is pending after a move). */
function unitCands(s: GridState, u: GridUnit): Cand[] {
  const side = u.side;
  const p = s.players[side];
  const pend = s.pending === u.uid;
  const out: Cand[] = [];
  const dests = pend ? [{ to: u.tile, first: [] as GridAction[] }] : [
    { to: u.tile, first: [] as GridAction[] },
    ...moveOptions(s, u).map(m => ({ to: m.to, first: [{ type: 'move', uid: u.uid, to: m.to } as GridAction] })),
  ];
  const def = gridDef(u.slug, s.extraDefs);
  const m = moveOf(def);
  const g = rulesOf(s);
  const canAbility = m && !u.usedAbility && abilityCost(def, g) <= p.emeralds;
  for (const d of dests) {
    const dp = destPrior(s, u, d.to);
    for (const t of attackTargets(s, u, d.to)) {
      out.push({ acts: [...d.first, { type: 'attack', uid: u.uid, target: t.tile }], prior: dp + attackPrior(s, u, t.tile), uid: u.uid });
    }
    if (canAbility) {
      const target = bestTarget(s, side, m!, d.to, u.uid);
      if (!m!.target || target !== undefined) {
        const worth = m!.effects.reduce((a, e) => a + effectWorth(e), 0) - 0.3 * abilityCost(def, g);
        const ab: GridAction = { type: 'ability', uid: u.uid, ...(target !== undefined ? { target } : {}) };
        out.push({ acts: [...d.first, ab], prior: dp + worth, uid: u.uid });
        // GRID.abilityAttack: the ability, then an attack in the same order.
        if (g.abilityAttack) for (const t of attackTargets(s, u, d.to)) out.push({ acts: [...d.first, ab, { type: 'attack', uid: u.uid, target: t.tile }], prior: dp + worth + attackPrior(s, u, t.tile), uid: u.uid });
      }
    }
    const threat = threatAt(s, side, d.to);
    // With the free stance, a brace in place (or, for 'passive', after a move) adds nothing: idle units brace anyway.
    const freeStance = g.autoBrace === 'passive' || (g.autoBrace === 'idle' && !d.first.length && !pend);
    if (threat > 0 && !freeStance) out.push({ acts: [...d.first, { type: 'brace', uid: u.uid }], prior: dp + 0.3 * Math.min(threat, u.health) - 0.5, uid: u.uid });
    if (d.first.length) out.push({ acts: d.first, prior: dp, uid: u.uid });
  }
  return out;
}

function deployCands(s: GridState, side: Side): Cand[] {
  const p = s.players[side];
  const tiles = deployTiles(s, side);
  if (!tiles.length) return [];
  const foeHq = s.hq[other(side)];
  const byFront = tiles.slice().sort((a, b) => distance(s, a.tile, foeHq) - distance(s, b.tile, foeHq) || a.tile - b.tile);
  const byHome = tiles.slice().sort((a, b) => distance(s, a.tile, s.hq[side]) - distance(s, b.tile, s.hq[side]) || b.tile - a.tile);
  // Tiles next to one of our nodes' approach, and the least threatened one.
  const safest = tiles.slice().sort((a, b) => threatAt(s, side, a.tile) - threatAt(s, side, b.tile) || a.tile - b.tile);
  const pick = [...new Set([byFront[0], byFront[1], byHome[0], safest[0]].filter(Boolean).map(x => x.tile))];
  const out: Cand[] = [];
  const seen = new Set<string>();
  for (const h of p.hand) {
    const def = gridDef(h.slug, s.extraDefs);
    if (cardCost(s, h.slug, side) > p.emeralds || seen.has(h.slug)) continue;
    seen.add(h.slug);
    const a = playOf(def);
    for (const tile of pick) {
      const target = a ? bestTarget(s, side, a, tile) : undefined;
      if (a?.target && specTiles(s, side, a.target, tile).length && target === undefined) continue;
      out.push({ acts: [{ type: 'deploy', uid: h.uid, tile, ...(target !== undefined ? { target } : {}) }], prior: 3 + def.cost });
    }
  }
  return out;
}

function hqCand(s: GridState, side: Side): Cand[] {
  const p = s.players[side];
  const a = gridHqAbility(p, rulesOf(s));
  if (s.hqUsed || s.ordersLeft < 1 || p.emeralds < (a.cost ?? 0)) return [];
  if (!a.target) {
    const summons = a.effects.some(e => e.k === 'summon');
    return [{ acts: [{ type: 'hq' }], prior: summons ? 2 : 1.5 }];
  }
  const target = bestTarget(s, side, a, s.hq[side]);
  return target === undefined ? [] : [{ acts: [{ type: 'hq', target }], prior: 1.5 }];
}

/** Every candidate step for the active side, best prior first, pruned to `prune` (plus each unit's best). */
function candidates(s: GridState, side: Side, prune: number, withHand: boolean): Cand[] {
  const units: Cand[][] = [];
  for (const u of s.units) {
    if (u.side !== side) continue;
    if (s.pending === u.uid || (canStartOrder(s, u) && s.ordersLeft >= 1)) units.push(unitCands(s, u).sort((a, b) => b.prior - a.prior));
  }
  const all = [...units.flat(), ...(withHand ? deployCands(s, side) : []), ...hqCand(s, side)].sort((a, b) => b.prior - a.prior);
  const keep = new Set(all.slice(0, prune));
  for (const xs of units) for (const x of xs.slice(0, 2)) keep.add(x);
  return all.filter(x => keep.has(x));
}

// --- Search -------------------------------------------------------------------------

let lookaheadSeed = 0x2545f491;

function tryActs(s: GridState, side: Side, acts: GridAction[]): GridState | null {
  let t = s;
  try {
    for (const a of acts) {
      lookaheadSeed = (lookaheadSeed + 0x6d2b79f5) >>> 0;
      t = applyGridAction({ ...t, rng: lookaheadSeed }, side, a);
    }
    return t;
  } catch {
    return null;
  }
}

interface Step { acts: GridAction[]; next: GridState; score: number }

function ranked(s: GridState, side: Side, prune: number, withHand: boolean, scorer: (x: GridState) => number): Step[] {
  const out: Step[] = [];
  for (const c of candidates(s, side, prune, withHand)) {
    const next = tryActs(s, side, c.acts);
    if (!next) continue;
    out.push({ acts: c.acts, next, score: scorer(next) });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Finish the turn greedily from `s`; returns the actions and the state just before ending the turn. */
function greedyFinish(s: GridState, side: Side, prune: number, withHand: boolean, scorer: (x: GridState) => number): { acts: GridAction[]; end: GridState } {
  let state = s;
  const acts: GridAction[] = [];
  let base = scorer(state);
  for (let i = 0; i < 16 && state.phase === 'main' && state.active === side; i++) {
    const best = ranked(state, side, prune, withHand, scorer)[0];
    if (!best || best.score <= base + 0.05) break;
    acts.push(...best.acts);
    state = best.next;
    base = best.score;
  }
  return { acts, end: state };
}

/** The opponent's best greedy reply with its board and HQ only, scored for `side`. */
function afterReply(s: GridState, side: Side, params: GridBotParams, w: GridEval): number {
  if (s.phase === 'over') return evaluateGrid(s, side, w);
  const t = tryActs(s, side, [{ type: 'end_turn' }]);
  if (!t) return evaluateGrid(s, side, w);
  if (t.phase !== 'main') return evaluateGrid(t, side, w);
  const foe = other(side);
  const { end } = greedyFinish(t, foe, params.replyPrune, false, x => evaluateGrid(x, foe, w));
  return evaluateGrid(end, side, w);
}

/** The state as `side` may know it: own deck in an order it cannot know, no opponent hand or deck. */
function knowable(s: GridState, side: Side, rng: Rng): GridState {
  const players = s.players.map((p, i) => (i === side
    ? { ...p, deck: rng.shuffle(p.deck.slice()) }
    : { ...p, deck: [], hand: [] })) as unknown as GridState['players'];
  return { ...s, players, quiet: true, log: [] };
}

/** The bot's plan for the rest of its turn (not including end_turn). */
export function planGridTurn(s: GridState, side: Side, params: GridBotParams = GRID_BOT): GridAction[] {
  if (s.phase !== 'main' || s.active !== side) return [];
  const rng = new Rng((s.rng ^ Math.imul(s.turn + 1, 0x9e3779b9) ^ (side ? 0x5bd1e995 : 0)) >>> 0);
  const known = knowable(s, side, rng);
  const w = params.eval ? { ...GRID_EVAL, ...params.eval } : GRID_EVAL;
  const scorer = (x: GridState) => evaluateGrid(x, side, w);
  if (params.mode === 'random') return [];
  if (params.mode === 'greedy') return greedyFinish(known, side, params.prune, true, scorer).acts;
  const firsts = ranked(known, side, params.prune, true, scorer).slice(0, Math.max(1, params.width));
  const plans: { acts: GridAction[]; end: GridState }[] = [{ acts: [], end: known }];
  for (const f of firsts) {
    const rest = greedyFinish(f.next, side, params.prune, true, scorer);
    plans.push({ acts: [...f.acts, ...rest.acts], end: rest.end });
  }
  let best = plans[0];
  let bestScore = -Infinity;
  for (const pl of plans) {
    const sc = params.reply ? afterReply(pl.end, side, params, w) : scorer(pl.end);
    if (sc > bestScore) { bestScore = sc; best = pl; }
  }
  return best.acts;
}

function randomTurn(s: GridState, side: Side, rng: Rng): GridState {
  let state = s;
  for (let i = 0; i < 30 && state.phase === 'main' && state.active === side; i++) {
    const legal = legalGridActions(state, side).filter(a => a.type !== 'end_turn');
    if (!legal.length || rng.float() < 0.12) break;
    try { state = applyGridAction(state, side, rng.pick(legal)); } catch { break; }
  }
  return state.phase === 'main' && state.active === side ? applyGridAction(state, side, { type: 'end_turn' }) : state;
}

/** Play the bot's whole turn (or its mulligan). Returns the new state. */
export function runGridBot(s: GridState, side: Side, params: GridBotParams = GRID_BOT): GridState {
  if (s.phase === 'mulligan') return s.players[side].mulliganed ? s : applyGridAction(s, side, chooseGridMulligan(s, side));
  if (s.phase !== 'main' || s.active !== side) return s;
  if (params.mode === 'random') {
    const rng = new Rng((s.rng ^ Math.imul(s.turn + 7, 0x9e3779b9)) >>> 0);
    return randomTurn(s, side, rng);
  }
  let state = s;
  let plan = planGridTurn(state, side, params);
  for (let guard = 0; guard < 40 && state.phase === 'main' && state.active === side; guard++) {
    const a = plan.shift();
    if (!a) break;
    try {
      state = applyGridAction(state, side, a);
    } catch {
      // A random effect changed the board: finish the turn greedily from here.
      plan = planGridTurn(state, side, { ...params, mode: 'greedy' });
      if (!plan.length) break;
    }
  }
  return state.phase === 'main' && state.active === side ? applyGridAction(state, side, { type: 'end_turn' }) : state;
}

export function chooseGridMulligan(s: GridState, side: Side): GridAction {
  const replace = s.players[side].hand.filter(h => cardCost(s, h.slug) >= 4).map(h => h.uid);
  return { type: 'mulligan', replace };
}
