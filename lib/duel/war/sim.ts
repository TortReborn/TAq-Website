// Bot-vs-bot Three-Front War games for the balance lab. Returns the same
// GameResult as the duel harness (../sim.ts) so tune/evolve/meta/metrics
// run unchanged, plus war-only statistics.

import type { GameResult, GameTrace } from '../sim';
import { WAR } from './config';
import { chooseWarMulligan, chooseWarPlan, WAR_BOT, type WarBotParams } from './ai';
import { applyWarAction, createWar, emeraldCostOf, frontHolder, orderOptions, reachOf, simulateRound, towersDown } from './engine';
import type { Lane, OrderKind, Plan, Side, WarState } from './types';
import { LANES } from './types';

export interface WarStats {
  /** Orders given, by kind, plus deploys and tank (HQ) orders. */
  orders: Record<OrderKind | 'deploy' | 'hq', number>;
  attacks: number;
  /** Attacks whose final target was not the attacker's own lane. */
  crossLane: number;
  fizzles: number;
  towerHits: number;
  /** Attacks that hit a different unit than the one there at planning. */
  swappedHits: number;
  /** Attacks that missed because the slot had changed since planning. */
  swappedFizzles: number;
  /** Towers destroyed in the game, both sides. */
  captures: number;
  /** Rounds each side held the centre front. */
  centre: [number, number];
  /** Perk activations per side. */
  perks: [number, number];
  /** Damage events on units, and units knocked out: their ratio is hits-to-KO. */
  unitHits: number;
  unitDeaths: number;
  /** Shift orders that also attacked (WAR.shiftAttack). */
  shiftAttacks: number;
  /** Brace counter-strikes (WAR.braceCounter) and towers rebuilt (WAR.rebuild). */
  counters: number;
  rebuilds: number;
  /** Damage dealt by brace strike-backs. */
  counterDamage: number;
  /**
   * The brace luck read (traced games only). For each round a side ordered a
   * brace, the same round is replayed with those braces taken out (the unit
   * stands idle), same seed, same opponent plan, and both branches are
   * played on through the next round's real plans. The swing is the lead
   * difference (warLead, from the bracing side) between the branches after
   * those two rounds: what that brace decision was worth.
   */
  braceSwing: { n: number; sum: number; sumSq: number; abs: number; wasted: number; big: number };
}

const blankStats = (): WarStats => ({
  orders: { attack: 0, move: 0, brace: 0, switch: 0, shift: 0, deploy: 0, hq: 0 },
  attacks: 0, crossLane: 0, fizzles: 0, towerHits: 0, swappedHits: 0, swappedFizzles: 0, captures: 0, centre: [0, 0], perks: [0, 0], unitHits: 0, unitDeaths: 0, shiftAttacks: 0, counters: 0, rebuilds: 0,
  counterDamage: 0, braceSwing: { n: 0, sum: 0, sumSq: 0, abs: 0, wasted: 0, big: 0 },
});

/** A brace decision awaiting its second round: the branch without it, and who braced. */
interface BraceProbe { side: Side; without: WarState }

function recordSwing(stats: WarStats, side: Side, withIt: WarState, without: WarState) {
  const d = (side === 0 ? 1 : -1) * (warLead(withIt) - warLead(without));
  const b = stats.braceSwing;
  b.n++; b.sum += d; b.sumSq += d * d; b.abs += Math.abs(d);
  if (Math.abs(d) < 0.5) b.wasted++;
  if (Math.abs(d) >= 5) b.big++;
}

/** Side 0's lead: tower health (a destroyed tower counts 8 more) plus half the board. */
export function warLead(s: WarState): number {
  const side = (sd: Side) => {
    const p = s.players[sd];
    const towers = p.towers.reduce((a, t) => a + Math.max(0, t), 0) - 8 * towersDown(p);
    const board = [...p.active, ...p.garrison].reduce((a, u) => a + (u ? u.power + u.health : 0), 0);
    return towers + 0.5 * board;
  };
  return side(0) - side(1);
}

/** Independent things a side could decide at the start of a round. */
function choices(s: WarState, side: Side): number {
  const p = s.players[side];
  let n = 0;
  for (const lane of LANES) {
    const opts = orderOptions(s, side, lane);
    n += opts.length;
    // A shift that may also attack (WAR.shiftAttack) is one choice per target it can reach from there.
    const u = p.active[lane];
    if (!WAR.shiftAttack || !u || u.power <= 0) continue;
    for (const o of opts) {
      if (o.k !== 'shift') continue;
      const to = (lane + o.dir) as Lane;
      if (WAR.shiftAttack === true || !p.active[to]) n += reachOf(to, u.keywords.includes('ranged')).length;
    }
  }
  n += p.hand.filter(h => emeraldCostOf(s, h.slug) <= p.emeralds).length;
  return n + 1;
}

export function playWarGame(
  a: string[], b: string[], seed: number,
  opts: { trace?: boolean; bots?: [Partial<WarBotParams> | undefined, Partial<WarBotParams> | undefined] } = {},
): GameResult & { war: WarStats } {
  let s = createWar(seed, [{ name: 'A', avatar: '', deck: a }, { name: 'B', avatar: '', deck: b }]);
  const stats = blankStats();
  const trace: GameTrace | undefined = opts.trace ? { decisions: 0, legal: 0, turns: 0, distinct: 0, actions: 0, leads: [] } : undefined;
  const played: [string[], string[]] = [[], []];
  let seen = 0;
  const collect = () => {
    for (let i = Math.max(0, seen - s.logBase); i < s.log.length; i++) {
      const e = s.log[i];
      if (e.k === 'deploy' && !e.slug.startsWith('token-')) played[e.side].push(e.slug);
      if (e.k === 'tower') stats.captures++;
      if (e.k === 'perk') stats.perks[e.side]++;
      if (e.k === 'damage' && !e.tower) stats.unitHits++;
      if (e.k === 'death') stats.unitDeaths++;
      if (e.k === 'counter') { stats.counters++; const next = s.log[i + 1]; if (next?.k === 'damage') stats.counterDamage += next.n; }
      if (e.k === 'rebuild') stats.rebuilds++;
      if (e.k === 'attack') {
        stats.attacks++;
        if (e.target.lane !== e.from) stats.crossLane++;
        if (e.hit === 'fizzle') { stats.fizzles++; if (e.swapped) stats.swappedFizzles++; }
        if (e.hit === 'tower') stats.towerHits++;
        if (e.hit === 'unit' && e.swapped) stats.swappedHits++;
      }
    }
    seen = s.logBase + s.log.length;
  };
  for (const side of [0, 1] as Side[]) s = applyWarAction(s, side, chooseWarMulligan(s, side));
  collect();
  let probes: BraceProbe[] = [];
  for (let r = 0; r < WAR.roundLimit + 2 && s.phase === 'plan'; r++) {
    const h = frontHolder(s, 1);
    if (h !== null) stats.centre[h]++;
    const plans = ([0, 1] as Side[]).map(side => chooseWarPlan(s, side, { ...WAR_BOT, ...opts.bots?.[side] }));
    if (trace) {
      for (const side of [0, 1] as Side[]) {
        trace.turns++;
        trace.decisions++;
        const c = choices(s, side);
        trace.distinct += c;
        trace.legal += c;
        const pl = plans[side];
        trace.actions += pl.orders.filter(Boolean).length + pl.deploys.length + (pl.hq ? 1 : 0);
      }
    }
    // Brace luck read: finish last round's probes against this round's real plans,
    // then open probes for this round's braces.
    const before = s;
    if (trace) {
      for (const pr of probes) {
        const next = simulateRound(before, plans as [Plan, Plan], before.rng);
        const alt = simulateRound(pr.without, plans as [Plan, Plan], before.rng);
        recordSwing(stats, pr.side, next, alt);
      }
      probes = [];
      for (const side of [0, 1] as Side[]) {
        if (!plans[side].orders.some(o => o?.k === 'brace')) continue;
        const cut = plans.slice() as [Plan, Plan];
        cut[side] = { ...plans[side], orders: plans[side].orders.map(o => (o?.k === 'brace' ? null : o)) };
        probes.push({ side, without: simulateRound(before, cut, before.rng) });
      }
    }
    for (const side of [0, 1] as Side[]) {
      const pl = plans[side];
      for (const o of pl.orders) if (o) { stats.orders[o.k]++; if (o.k === 'shift' && o.attack) stats.shiftAttacks++; }
      stats.orders.deploy += pl.deploys.length;
      if (pl.hq) stats.orders.hq++;
      s = applyWarAction(s, side, { type: 'plan', plan: pl });
    }
    collect();
    // A brace that ended the game (or the last round) is judged on its one round.
    if (trace && s.phase !== 'plan') { for (const pr of probes) recordSwing(stats, pr.side, s, pr.without); probes = []; }
    // One lead sample per player-turn equivalent, so lead-change counts
    // compare with the duel game's.
    trace?.leads.push(warLead(s), warLead(s));
  }
  if (s.phase !== 'over') s = applyWarAction(s, 0, { type: 'concede' });
  const reason = s.endReason === 'round_limit' ? 'turn_limit' : s.endReason === 'towers' ? 'hero' : s.endReason;
  return { winner: s.winner, first: 0, turns: s.round, reason, played, war: stats, ...(trace ? { trace } : {}) };
}

export interface WarSummary {
  games: number;
  roundsMean: number;
  /** At 30 s of planning and 10 s of playback a round. */
  minutesMean: number;
  /** Share of all orders by kind (attack, move, brace, switch, shift). */
  orderMix: Record<string, number>;
  /** Unit orders per round per side. */
  ordersPerRound: number;
  /** Share of unit and tank orders that are not plain attacks (move, brace, switch, shift, tank). */
  nonAttackShare: number;
  /** Shannon entropy (bits) of the order mix including tank orders. */
  orderEntropy: number;
  deploysPerRound: number;
  hqPerRound: number;
  crossLaneShare: number;
  fizzleRate: number;
  towerHitShare: number;
  /** Attacks that hit a different unit than planned, and misses caused by a change of occupant. */
  swappedHitRate: number;
  swappedFizzleRate: number;
  capturesPerGame: number;
  /** Decisive games won by the side that held the centre front more rounds (ties left out). */
  centreWinShare: number;
  /** Decisive games won by the side with more perk activations (ties left out). */
  perkEdgeWinShare: number;
  perksPerGame: number;
  /** Damage events on units per unit knocked out. */
  hitsToKo: number;
  /** Share of shift orders that also attacked; brace counter-strikes and rebuilds per game. */
  shiftAttackShare: number;
  /** Non-attack share (tank orders included) when a shift that also attacks counts as an attack. */
  nonAttackStrict: number;
  /** Strike-back damage per game. */
  counterDamagePerGame: number;
  /** Brace luck read (see WarStats.braceSwing): braces measured, mean and spread of the swing, share near zero (< 0.5) and share big (>= 5). */
  braceLuck: { n: number; mean: number; sd: number; meanAbs: number; wasted: number; big: number };
  countersPerGame: number;
  rebuildsPerGame: number;
  endReasons: Record<string, number>;
}

function entropy(counts: number[]): number {
  const t = counts.reduce((a, b) => a + b, 0);
  return t ? -counts.filter(c => c > 0).reduce((a, c) => a + (c / t) * Math.log2(c / t), 0) : 0;
}

export function summarizeWar(results: GameResult[]): WarSummary {
  const rs = results.filter(r => r.war);
  const n = Math.max(1, rs.length);
  const sum = (f: (w: WarStats) => number) => rs.reduce((a, r) => a + f(r.war!), 0);
  const rounds = rs.reduce((a, r) => a + r.turns, 0);
  const kinds = ['attack', 'move', 'brace', 'switch', 'shift'] as const;
  const orders = sum(w => kinds.reduce((a, k) => a + w.orders[k], 0));
  const attacks = Math.max(1, sum(w => w.attacks));
  let centre = 0, centreN = 0, perk = 0, perkN = 0;
  const endReasons: Record<string, number> = {};
  for (const r of rs) {
    endReasons[r.reason ?? 'none'] = (endReasons[r.reason ?? 'none'] ?? 0) + 1;
    if (r.winner === null) continue;
    const w = r.war!;
    const [c0, c1] = w.centre;
    if (c0 !== c1) { centreN++; if ((c0 > c1 ? 0 : 1) === r.winner) centre++; }
    const [p0, p1] = w.perks;
    if (p0 !== p1) { perkN++; if ((p0 > p1 ? 0 : 1) === r.winner) perk++; }
  }
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return {
    games: rs.length,
    roundsMean: r3(rounds / n),
    minutesMean: r3((rounds / n) * 40 / 60),
    orderMix: Object.fromEntries(kinds.map(k => [k, r3(sum(w => w.orders[k]) / Math.max(1, orders))])),
    ordersPerRound: r3(orders / Math.max(1, rounds) / 2),
    nonAttackShare: r3(1 - sum(w => w.orders.attack) / Math.max(1, orders + sum(w => w.orders.hq))),
    orderEntropy: r3(entropy([...kinds.map(k => sum(w => w.orders[k])), sum(w => w.orders.hq)])),
    deploysPerRound: r3(sum(w => w.orders.deploy) / Math.max(1, rounds) / 2),
    hqPerRound: r3(sum(w => w.orders.hq) / Math.max(1, rounds) / 2),
    crossLaneShare: r3(sum(w => w.crossLane) / attacks),
    fizzleRate: r3(sum(w => w.fizzles) / attacks),
    towerHitShare: r3(sum(w => w.towerHits) / attacks),
    swappedHitRate: r3(sum(w => w.swappedHits) / attacks),
    swappedFizzleRate: r3(sum(w => w.swappedFizzles) / attacks),
    capturesPerGame: r3(sum(w => w.captures) / n),
    centreWinShare: r3(centre / Math.max(1, centreN)),
    perkEdgeWinShare: r3(perk / Math.max(1, perkN)),
    perksPerGame: r3(sum(w => w.perks[0] + w.perks[1]) / n),
    hitsToKo: r3(sum(w => w.unitHits) / Math.max(1, sum(w => w.unitDeaths))),
    shiftAttackShare: r3(sum(w => w.shiftAttacks ?? 0) / Math.max(1, sum(w => w.orders.shift))),
    nonAttackStrict: r3(1 - (sum(w => w.orders.attack) + sum(w => w.shiftAttacks ?? 0)) / Math.max(1, orders + sum(w => w.orders.hq))),
    counterDamagePerGame: r3(sum(w => w.counterDamage ?? 0) / n),
    braceLuck: (() => {
      const bn = sum(w => w.braceSwing?.n ?? 0);
      const mean = sum(w => w.braceSwing?.sum ?? 0) / Math.max(1, bn);
      const sd = Math.sqrt(Math.max(0, sum(w => w.braceSwing?.sumSq ?? 0) / Math.max(1, bn) - mean * mean));
      return {
        n: bn, mean: r3(mean), sd: r3(sd), meanAbs: r3(sum(w => w.braceSwing?.abs ?? 0) / Math.max(1, bn)),
        wasted: r3(sum(w => w.braceSwing?.wasted ?? 0) / Math.max(1, bn)), big: r3(sum(w => w.braceSwing?.big ?? 0) / Math.max(1, bn)),
      };
    })(),
    countersPerGame: r3(sum(w => w.counters ?? 0) / n),
    rebuildsPerGame: r3(sum(w => w.rebuilds ?? 0) / n),
    endReasons,
  };
}
