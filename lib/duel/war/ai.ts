// The Three-Front War bot: simultaneous moves, so no lookahead tree.
//
// Each round:
//   1. Build a few dozen sensible joint plans for itself. Every unit gets a
//      short list of real options: its best attacks, its move aimed at the
//      best target it can afford, a brace when enemies can reach it, a
//      switch when a benched unit would stand there better, a shift toward
//      the centre, and (WAR.shiftAttack) a shift carrying its best attack
//      from the new lane. Candidates are the plan of best options, that plan with
//      each alternative swapped in one unit at a time, deploy variants
//      (deploy the best, bank the emeralds), and softmax-sampled mixes.
//   2. Build plans for the opponent the same way, from what it can see: no
//      deploys, because the opponent's hand is hidden.
//   3. Play every pairing one round forward (simulateRound) on a copy with
//      both decks and the opponent's hand emptied, and score the result.
//   4. Solve that small matrix game by regret matching and sample its own
//      plan from the resulting mixed strategy. Mixing is the point: a bot
//      that always makes its best-looking move is a free read for a person.
//
// mode 'greedy' (the best-options plan only) and 'random' (uniform legal
// orders) exist as baselines for the lab.

import { Rng } from '../rng';
import type { Ability, CardDef, Effect } from '../types';
import { emeraldCost, moveCost, WAR } from './config';
import {
  canOrder, counterDamage, defOf, frontHolder, hqAbility, moveOf, orderOptions, other, planCost, playOf, reachOf, simulateRound, specSlots, towerAlive,
} from './engine';
import type { Deploy, Lane, Order, Plan, Side, SlotRef, WarAction, WarState, WarUnit } from './types';
import { LANES } from './types';

export interface WarBotParams {
  mode: 'full' | 'greedy' | 'random';
  /** Own candidate plans per round. */
  candidates: number;
  /** Opponent plans each candidate is scored against. */
  samples: number;
  /** Regret-matching iterations over the payoff matrix. */
  iterations: number;
  /** Softmax temperature for the sampled candidates. */
  temperature: number;
}

/** Mutable only so the balance lab can vary it in-process. */
export const WAR_BOT: WarBotParams = { mode: 'full', candidates: 20, samples: 6, iterations: 120, temperature: 1.5 };

// --- Evaluation ----------------------------------------------------------------

function unitValue(u: WarUnit): number {
  let v = (u.power + u.boost) * 1.2 + (u.health / WAR.healthMult) * 0.8 + 0.3 * u.speed;
  if (u.shield) v += 1.5;
  if (u.keywords.includes('guard')) v += 0.5;
  if (u.keywords.includes('ranged')) v += 0.3 * u.power;
  if (u.keywords.includes('rush')) v += 0.2 * u.power;
  return v;
}

export function evaluateWar(s: WarState, side: Side): number {
  if (s.phase === 'over') return s.winner === side ? 1e5 : s.winner === null ? 0 : -1e5;
  const score = (sd: Side) => {
    const p = s.players[sd];
    let v = 0;
    const alive = LANES.filter(l => towerAlive(p, l)).length;
    for (const lane of LANES) v += towerAlive(p, lane) ? 1.3 * p.towers[lane] : 0;
    // Each tower standing is worth a lot, the last one you can lose most.
    v += alive * 8 + (alive <= WAR.towersToWin - 1 ? 0 : 6);
    // A standing brace stance (WAR.braceStance) is worth part of the damage it will save.
    for (const u of p.active) if (u) v += unitValue(u) + (stanced(s, u) ? 0.25 * u.health / WAR.healthMult + 0.3 * counterDamage(u) : 0);
    for (const u of p.garrison) v += 0.6 * unitValue(u);
    v += 0.9 * Math.min(p.hand.length, 6) + 0.3 * p.emeralds;
    for (const lane of LANES) if (frontHolder(s, lane) === sd) v += 0.8;
    return v;
  };
  return score(side) - score(other(side));
}

// --- Option priors -------------------------------------------------------------

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

/** The most useful slot for a targeted ability, by a quick guess. */
function bestTarget(s: WarState, side: Side, a: Ability, excludeUid?: string): SlotRef | undefined {
  if (!a.target) return undefined;
  const xs = specSlots(s, side, a.target, excludeUid);
  if (!xs.length) return undefined;
  const helps = a.effects.some(e => e.k === 'heal' || e.k === 'buff' || e.k === 'grant');
  const score = (x: SlotRef) => {
    const u = s.players[x.side].active[x.lane];
    if (x.side === side) {
      if (!helps) return -9;
      if (!u) return a.effects.some(e => e.k === 'heal') ? (WAR.towerHp - s.players[side].towers[x.lane]) * 0.5 : -5;
      return (u.maxHealth - u.health) + unitValue(u) * 0.2;
    }
    if (helps) return -9;
    if (!u) return 1.5;
    return unitValue(u) - u.health / WAR.healthMult * 0.3;
  };
  return xs.reduce((a2, b) => (score(b) > score(a2) ? b : a2));
}

/** Total power of enemy units that could attack `lane` next. */
function threat(s: WarState, side: Side, lane: Lane): number {
  const foe = s.players[other(side)];
  return LANES.reduce<number>((t, l) => {
    const u = foe.active[l];
    return u && reachOf(l, u.keywords.includes('ranged')).includes(lane) ? t + u.power + u.boost : t;
  }, 0);
}

/** A visible brace stance that will hold this round. */
function stanced(s: Pick<WarState, 'round'>, u: WarUnit): boolean {
  return WAR.braceStance !== 'off' && (u.bracedUntil ?? 0) >= s.round;
}

/** A quick guess at what `u`, standing in `lane`, attacking `target` is worth. */
function attackPrior(s: WarState, side: Side, lane: Lane, u: WarUnit, target: SlotRef): number {
  const foe = s.players[other(side)];
  const v = foe.active[target.lane];
  const power = u.power + u.boost;
  const siege = WAR.siege === 'none' ? 0 : WAR.siege === 'overflow' ? 0.3 : 1;
  if (v) {
    if (v.stealth) return -2;
    // Into a visible stance: half the damage, and it strikes back.
    const dealt = stanced(s, v) ? Math.floor(power * WAR.braceTaken) : power;
    const back = stanced(s, v) && dealt < v.health ? counterDamage(v) : 0;
    const kill = dealt >= v.health ? 2.5 + 0.5 * unitValue(v) : 0;
    return 1 + Math.min(dealt, v.health) / WAR.healthMult * 0.9 + kill + siege - back / WAR.healthMult * 0.8;
  }
  if (target.lane === lane && towerAlive(foe, lane)) return 2 + power * 1.2;
  return -1;
}

/** A quick guess at what an order is worth, before any simulation. */
function prior(s: WarState, side: Side, lane: Lane, o: Order): number {
  const p = s.players[side];
  const u = p.active[lane]!;
  const foe = s.players[other(side)];
  switch (o.k) {
    case 'attack': return attackPrior(s, side, lane, u, o.target);
    case 'move': {
      const m = moveOf(defOf(u.slug, s.extraDefs))!;
      const also = o.attack ? prior(s, side, lane, { k: 'attack', target: o.attack }) : 0;
      return 0.5 + also + m.effects.reduce((a, e) => a + effectWorth(e), 0) - 0.4 * moveCost(m.cost ?? 0);
    }
    case 'brace': {
      const t = threat(s, side, lane);
      return t ? Math.min(t, u.health) * 0.35 - 0.5 + counterDamage(u) * 0.5 : -3;
    }
    case 'switch': {
      const g = p.garrison[o.garrison];
      const hurt = 1 - u.health / u.maxHealth;
      return (unitValue(g) - unitValue(u)) * 0.3 + hurt * threat(s, side, lane) * 0.5 - 0.5;
    }
    case 'shift': {
      const to = (lane + o.dir) as Lane;
      const pos = to === 1 && !p.active[1] ? 0.8 : -1.5;
      return o.attack ? pos + attackPrior(s, side, to, u, o.attack) * WAR.shiftAttackPower - (WAR.shiftAttackTiming === 'last' ? 0.5 : 0) : pos;
    }
  }
}

/** Each unit's short list of real options, best first. */
function unitOptions(s: WarState, side: Side, lane: Lane, budget: number): Order[] {
  const u = s.players[side].active[lane]!;
  const all = orderOptions(s, side, lane);
  const out: Order[] = [];
  const attacks = all.filter(o => o.k === 'attack').sort((a, b) => prior(s, side, lane, b) - prior(s, side, lane, a));
  out.push(...attacks.slice(0, 2));
  const m = moveOf(defOf(u.slug, s.extraDefs));
  if (m && moveCost(m.cost ?? 0) <= budget) {
    const target = bestTarget(s, side, m, u.uid);
    const hit = WAR.moveAndAttack && attacks.length ? (attacks[0] as Order & { k: 'attack' }).target : undefined;
    if (!m.target || target) out.push({ k: 'move', ...(target ? { target } : {}), ...(hit ? { attack: hit } : {}) });
  }
  for (const o of all) {
    if (o.k === 'brace' && threat(s, side, lane) > 0) out.push(o);
    if (o.k === 'switch' && prior(s, side, lane, o) > -1) out.push(o);
    if (o.k === 'shift' && lane + o.dir === 1) out.push(o);
    if (o.k === 'shift' && WAR.shiftAttack && u.power > 0 && (WAR.shiftAttack === true || !s.players[side].active[lane + o.dir])) {
      // Shift and strike from the new lane, at its best target there.
      const to = (lane + o.dir) as Lane;
      const hits = reachOf(to, u.keywords.includes('ranged')).map(l => ({ side: other(side), lane: l } as SlotRef));
      const best = hits.reduce((a, b) => (attackPrior(s, side, to, u, b) > attackPrior(s, side, to, u, a) ? b : a));
      out.push({ ...o, attack: best });
    }
  }
  return out.sort((a, b) => prior(s, side, lane, b) - prior(s, side, lane, a));
}

// --- Plans -----------------------------------------------------------------------

interface Frame {
  opts: (Order[] | null)[];
}

function deployPlan(s: WarState, side: Side, budget: number, orders: (Order | null)[], mode: 'best' | 'none' | 'random', rng: Rng): Deploy[] {
  if (mode === 'none') return [];
  const p = s.players[side];
  // Slots a switch or shift will fill are not free.
  const empty = LANES.filter(l => !p.active[l]);
  let room = WAR.garrison - p.garrison.length;
  const hand = p.hand.map(h => ({ h, def: defOf(h.slug, s.extraDefs) as CardDef }));
  if (mode === 'best') hand.sort((a, b) => b.def.cost - a.def.cost);
  else rng.shuffle(hand);
  // Fill the most threatened empty lanes first.
  empty.sort((a, b) => threat(s, side, b) - threat(s, side, a) || (a === 1 ? -1 : b === 1 ? 1 : 0));
  const out: Deploy[] = [];
  for (const { h, def } of hand) {
    const cost = emeraldCost(def.cost);
    if (cost > budget || (mode === 'random' && rng.float() < 0.3)) continue;
    let to: Lane | 'garrison' | null = null;
    if (empty.length) to = empty.shift()!;
    else if (room > 0 && orders.some(o => o?.k === 'switch') === false && def.cost >= 3) { to = 'garrison'; room--; }
    if (to === null) continue;
    const a = playOf(def);
    const target = a ? bestTarget(s, side, a) : undefined;
    if (a?.target && specSlots(s, side, a.target).length && !target) continue;
    out.push({ uid: h.uid, to, ...(target ? { target } : {}) });
    budget -= cost;
  }
  return out;
}

function hqOrder(s: WarState, side: Side, budget: number): Plan['hq'] {
  const a = hqAbility(s.players[side]);
  if ((a.cost ?? 0) > budget) return null;
  if (!a.target) return a.effects.some(e => e.k === 'summon') && s.players[side].active.every(Boolean) && s.players[side].garrison.length >= WAR.garrison ? null : {};
  const target = bestTarget(s, side, a);
  return target ? { target } : null;
}

function assemble(s: WarState, side: Side, orders: (Order | null)[], deployMode: 'best' | 'none' | 'random', hq: boolean, hidden: boolean, rng: Rng): Plan {
  const p = s.players[side];
  const movesCost = orders.reduce((a, o, lane) => a + (o?.k === 'move' ? moveCost(moveOf(defOf(p.active[lane]!.slug, s.extraDefs))?.cost ?? 0) : 0), 0);
  let budget = p.emeralds - movesCost;
  const deploys = hidden ? [] : deployPlan(s, side, budget, orders, deployMode, rng);
  budget -= deploys.reduce((a, d) => a + emeraldCost(defOf(p.hand.find(h => h.uid === d.uid)!.slug, s.extraDefs).cost), 0);
  const plan: Plan = { orders, deploys, hq: hq ? hqOrder(s, side, budget) : null };
  return planCost(s, side, plan) <= p.emeralds ? plan : { orders: orders.map(o => (o?.k === 'move' ? null : o)), deploys: [], hq: null };
}

function frame(s: WarState, side: Side): Frame {
  const p = s.players[side];
  return { opts: LANES.map(l => (canOrder(s, side, l) ? unitOptions(s, side, l, p.emeralds) : null)) };
}

/** One order per unit: no two switches with the same garrison unit. */
function legalize(orders: (Order | null)[]): (Order | null)[] {
  const used = new Set<number>();
  return orders.map(o => {
    if (o?.k !== 'switch') return o;
    if (used.has(o.garrison)) return null;
    used.add(o.garrison);
    return o;
  });
}

function candidates(s: WarState, side: Side, n: number, rng: Rng, hidden: boolean): Plan[] {
  const f = frame(s, side);
  const best = legalize(f.opts.map(o => o?.[0] ?? null));
  const out: Plan[] = [];
  const seen = new Set<string>();
  const add = (pl: Plan) => {
    const key = JSON.stringify(pl);
    if (!seen.has(key) && out.length < n) { seen.add(key); out.push(pl); }
  };
  add(assemble(s, side, best, 'best', true, hidden, rng));
  add(assemble(s, side, best, 'none', false, hidden, rng));
  // Every alternative option, one unit at a time.
  const alts: (Order | null)[][] = [];
  f.opts.forEach((opts, lane) => opts?.slice(1).forEach(o => { const x = best.slice(); x[lane] = o; alts.push(legalize(x)); }));
  for (const x of rng.shuffle(alts)) add(assemble(s, side, x, 'best', rng.float() < 0.7, hidden, rng));
  for (let i = 0; out.length < n && i < n * 3; i++) {
    const x = legalize(f.opts.map(opts => (opts?.length ? softPick(rng, opts, o => -opts.indexOf(o), WAR_BOT.temperature) : null)));
    add(assemble(s, side, x, rng.float() < 0.6 ? 'best' : 'random', rng.float() < 0.6, hidden, rng));
  }
  return out;
}

function softPick<T>(rng: Rng, xs: T[], score: (x: T) => number, temp: number): T {
  const w = xs.map(x => Math.exp(score(x) / temp));
  let r = rng.float() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < xs.length; i++) { r -= w[i]; if (r <= 0) return xs[i]; }
  return xs[xs.length - 1];
}

/** Uniformly random legal orders and deploys: the floor any bot must beat. */
function randomPlan(s: WarState, side: Side, rng: Rng): Plan {
  const p = s.players[side];
  const orders = legalize(LANES.map(l => {
    const opts = orderOptions(s, side, l).filter(o => o.k !== 'move');
    return opts.length && rng.float() < 0.9 ? rng.pick(opts) : null;
  }));
  return assemble(s, side, orders, 'random', rng.float() < 0.5, false, rng);
}

/** The state as `side` may know it: no decks, no opponent hand, no opponent plan. */
function knowable(s: WarState, side: Side): WarState {
  const players = s.players.map((p, i) => ({ ...p, deck: [], hand: i === side ? p.hand : [], plan: i === side ? p.plan : null })) as unknown as WarState['players'];
  return { ...s, players, quiet: true, log: [] };
}

/** Mixed strategy for the row player of payoff matrix `a` (rows: us, cols: them). */
export function regretMatch(a: number[][], iterations: number): number[] {
  const n = a.length;
  const m = a[0].length;
  const rr = new Array(n).fill(0), cr = new Array(m).fill(0);
  const avg = new Array(n).fill(0);
  const strat = (r: number[]) => {
    const pos = r.map(x => Math.max(0, x));
    const t = pos.reduce((x, y) => x + y, 0);
    return t > 0 ? pos.map(x => x / t) : r.map(() => 1 / r.length);
  };
  for (let it = 0; it < iterations; it++) {
    const rs = strat(rr), cs = strat(cr);
    const ru = a.map(row => row.reduce((x, v, j) => x + v * cs[j], 0));
    const cu = cr.map((_, j) => -a.reduce((x, row, i) => x + row[j] * rs[i], 0));
    const rv = ru.reduce((x, v, i) => x + v * rs[i], 0);
    const cv = cu.reduce((x, v, j) => x + v * cs[j], 0);
    for (let i = 0; i < n; i++) rr[i] += ru[i] - rv;
    for (let j = 0; j < m; j++) cr[j] += cu[j] - cv;
    for (let i = 0; i < n; i++) avg[i] += rs[i];
  }
  const t = avg.reduce((x, y) => x + y, 0);
  return avg.map(x => x / t);
}

export function chooseWarPlan(s: WarState, side: Side, params: WarBotParams = WAR_BOT): Plan {
  // Seeded from the game so replays and lab runs repeat exactly. The bot only
  // uses it to mix its own choice; it never simulates with the real stream.
  const rng = new Rng((s.rng ^ Math.imul(s.round + 1, 0x9e3779b9) ^ (side ? 0x5bd1e995 : 0)) >>> 0);
  const known = knowable(s, side);
  if (params.mode === 'random') return randomPlan(known, side, rng);
  const mine = candidates(known, side, params.mode === 'greedy' ? 1 : params.candidates, rng, false);
  if (mine.length === 1) return mine[0];
  const theirs = candidates(known, other(side), params.samples, rng, true);
  const matrix = mine.map(pl => theirs.map(op => {
    const plans = (side === 0 ? [pl, op] : [op, pl]) as [Plan, Plan];
    return evaluateWar(simulateRound(known, plans, rng.int(2 ** 31)), side);
  }));
  const mix = regretMatch(matrix, params.iterations);
  let r = rng.float();
  for (let i = 0; i < mine.length; i++) { r -= mix[i]; if (r <= 0) return mine[i]; }
  return mine[mine.length - 1];
}

export function chooseWarMulligan(s: WarState, side: Side): WarAction {
  const replace = s.players[side].hand.filter(h => emeraldCost(defOf(h.slug, s.extraDefs).cost) >= 4).map(h => h.uid);
  return { type: 'mulligan', replace };
}
