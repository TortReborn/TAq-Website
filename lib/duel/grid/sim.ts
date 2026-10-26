// Bot-vs-bot Warfront games for the balance lab. Returns the same
// GameResult as the duel harness (../sim.ts), so tune/evolve/meta/metrics
// run unchanged, plus grid-only statistics (GridStats).

import type { GameResult, GameTrace } from '../sim';
import type { Element, Side } from '../types';
import { connectedNodes, distance, gridDef, hqSideAt, rulesOf, scoreOf } from './board';
import { chooseGridMulligan, GRID_BOT, runGridBot, type GridBotParams } from './ai';
import { applyGridAction, createGrid, legalGridActions, type GridOptions } from './engine';
import type { GridEndReason, GridEvent, GridState } from './types';

export type OrderType = 'move_attack' | 'attack' | 'move' | 'move_ability' | 'ability' | 'move_brace' | 'brace' | 'hq';
const ORDER_TYPES: OrderType[] = ['move_attack', 'attack', 'move', 'move_ability', 'ability', 'move_brace', 'brace', 'hq'];

export interface GridStats {
  tanks: [Element, Element];
  /** Orders given by type, and deploys (forward = next to a connected node). */
  orders: Record<OrderType, number>;
  deploys: number;
  forwardDeploys: number;
  /** Per element: unit orders, moves made, tiles moved. */
  byElement: Record<Element, { orders: number; moves: number; tiles: number }>;
  attacks: number;
  flanked: number;
  flankDamage: number;
  retaliations: number;
  /** Moves ended early by a Guard's zone of control. */
  zocStops: number;
  hqFire: number;
  /** Damage dealt to HQs, and the part armour soaked. */
  hqDamage: number;
  armourSoaked: number;
  /** Nodes claimed from neutral, and taken from the enemy. */
  claims: number;
  steals: number;
  /** Changes of sign in the connected-node lead over the game. */
  nodeSwings: number;
  /** The loser still had a connected node when its HQ fell. */
  snipeConnected: boolean;
  /** Tiles units ever stood on (bitmask as a list), and the standable total. */
  covered: number[];
  standable: number;
  captures: number;
  unitDeaths: number;
  /** Free end-of-turn braces (GRID.autoBrace), not orders. */
  autoBraces: number;
  /** Attacks made after the same unit's ability in one order (GRID.abilityAttack). */
  abilityAttacks: number;
  /** Setbacks triggered (GRID.setbackOn). */
  setbacks: number;
  /** How the game ended (the engine's reason; GameResult.reason maps 'hq' and 'score' to 'hero'). */
  end: GridEndReason | null;
  /** Territory score: final scores, points from nodes and from HQ damage, objective bonus points. */
  scores: [number, number];
  nodePoints: number;
  hqPoints: number;
  objectivePoints: number;
  /** Changes of sign in the score lead, read once per exchange (after the second player's turn). */
  scoreSwings: number;
  /** The winner was behind on score at some exchange. */
  scoreComeback: boolean;
}

const blankStats = (tanks: [Element, Element]): GridStats => ({
  tanks,
  orders: Object.fromEntries(ORDER_TYPES.map(k => [k, 0])) as Record<OrderType, number>,
  deploys: 0, forwardDeploys: 0,
  byElement: { earth: { orders: 0, moves: 0, tiles: 0 }, thunder: { orders: 0, moves: 0, tiles: 0 }, water: { orders: 0, moves: 0, tiles: 0 }, fire: { orders: 0, moves: 0, tiles: 0 }, air: { orders: 0, moves: 0, tiles: 0 } },
  attacks: 0, flanked: 0, flankDamage: 0, retaliations: 0, zocStops: 0, hqFire: 0, hqDamage: 0, armourSoaked: 0,
  claims: 0, steals: 0, nodeSwings: 0, snipeConnected: false, covered: [], standable: 0, captures: 0, unitDeaths: 0,
  autoBraces: 0, setbacks: 0, abilityAttacks: 0,
  end: null, scores: [0, 0], nodePoints: 0, hqPoints: 0, objectivePoints: 0, scoreSwings: 0, scoreComeback: false,
});

/**
 * Side 0's lead: HQ health, connected nodes (2 each) and half the board. With
 * the territory score (GRID.scoreTarget) each point counts as much as
 * hqHp / scoreTarget HQ health, so either win condition's progress weighs
 * the same (a point closer to the target = that much HQ damage).
 */
export function gridLead(s: GridState): number {
  const g = rulesOf(s);
  const perPoint = g.scoreTarget > 0 ? g.hqHp / g.scoreTarget : 0;
  const side = (sd: Side) => {
    const board = s.units.filter(u => u.side === sd).reduce((a, u) => a + u.power + u.health, 0);
    return s.players[sd].hp + 2 * connectedNodes(s, sd).length + 0.5 * board + perPoint * scoreOf(s.players[sd]);
  };
  return side(0) - side(1);
}

export function playGridGame(
  a: string[], b: string[], seed: number,
  opts: { trace?: boolean; bots?: [Partial<GridBotParams> | undefined, Partial<GridBotParams> | undefined]; grid?: GridOptions } = {},
): GameResult & { grid: GridStats } {
  let s = createGrid(seed, [{ name: 'A', avatar: '', deck: a }, { name: 'B', avatar: '', deck: b }], undefined, opts.grid);
  const stats = blankStats([s.players[0].tank, s.players[1].tank]);
  stats.standable = s.terrain.filter((t, i) => t !== 'mountain' && hqSideAt(s, i) === null).length;
  const covered = new Set<number>();
  const trace: GameTrace | undefined = opts.trace ? { decisions: 0, legal: 0, turns: 0, distinct: 0, actions: 0, leads: [] } : undefined;
  const played: [string[], string[]] = [[], []];
  // uid -> element, from every deploy and summon seen (units may be gone by the time a turn is read).
  const elOf = new Map<string, Element>();
  const el = (uid: string): Element => elOf.get(uid) ?? 'thunder';
  let seen = 0;
  let lastSign = 0;
  let lastScoreSign = 0;
  const scoreDiffs: number[] = [];
  const collect = () => {
    // Per turn: which units moved (and how far), and what each did after.
    const moved = new Map<string, { el: Element }>();
    // Units whose order already has its follow-up (an ability then an attack or brace, GRID.abilityAttack).
    const followed = new Set<string>();
    for (let i = Math.max(0, seen - s.logBase); i < s.log.length; i++) {
      const e: GridEvent = s.log[i];
      switch (e.k) {
        case 'turn': moved.clear(); followed.clear(); break;
        case 'deploy':
          stats.deploys++; if (e.forward) stats.forwardDeploys++;
          elOf.set(e.uid, gridDef(e.slug, s.extraDefs).element);
          played[e.side].push(e.slug); covered.add(e.tile); break;
        case 'summon': elOf.set(e.uid, gridDef(e.slug, s.extraDefs).element); covered.add(e.tile); break;
        case 'move': {
          const x = el(e.uid);
          const tiles = e.path.length === 1 ? distance(s, e.from, e.to) : e.path.length;
          stats.byElement[x].moves++; stats.byElement[x].tiles += tiles; stats.byElement[x].orders++;
          moved.set(e.uid, { el: x });
          for (const t of e.path) covered.add(t);
          if (e.stopped) stats.zocStops++;
          // A move with no follow-up counts as 'move' unless an attack/ability/brace by it follows.
          stats.orders.move++;
          break;
        }
        case 'attack': {
          stats.attacks++;
          if (e.flank > 0) { stats.flanked++; stats.flankDamage += e.flank; }
          if (followed.has(e.uid)) { stats.abilityAttacks++; break; }
          followed.add(e.uid);
          if (moved.has(e.uid)) { stats.orders.move--; stats.orders.move_attack++; } else { stats.orders.attack++; stats.byElement[el(e.uid)].orders++; }
          break;
        }
        case 'ability':
          followed.add(e.uid);
          if (moved.has(e.uid)) { stats.orders.move--; stats.orders.move_ability++; } else { stats.orders.ability++; stats.byElement[el(e.uid)].orders++; }
          break;
        case 'setback': stats.setbacks++; break;
        case 'brace':
          if (e.auto) { stats.autoBraces++; break; }
          if (followed.has(e.uid)) break;
          followed.add(e.uid);
          if (moved.has(e.uid)) { stats.orders.move--; stats.orders.move_brace++; } else { stats.orders.brace++; stats.byElement[el(e.uid)].orders++; }
          break;
        case 'hq': stats.orders.hq++; break;
        case 'retaliate': stats.retaliations++; break;
        case 'hqfire': stats.hqFire++; break;
        case 'damage':
          if ('hq' in e.target) { stats.hqDamage += e.n; stats.armourSoaked += e.armour ?? 0; }
          break;
        case 'claim': if (e.from === null) stats.claims++; else stats.steals++; break;
        case 'score':
          if (e.hq) stats.hqPoints += e.n;
          else {
            stats.nodePoints += e.n;
            for (const x of e.nodes) if (x.objective) stats.objectivePoints += rulesOf(s).objectiveBonus;
          }
          break;
        case 'death': stats.unitDeaths++; if (e.captured) stats.captures++; break;
        case 'end':
          if (e.reason === 'hq' && e.winner !== null) stats.snipeConnected = connectedNodes(s, e.winner === 0 ? 1 : 0).length > 0;
          break;
      }
    }
    seen = s.logBase + s.log.length;
    const d = connectedNodes(s, 0).length - connectedNodes(s, 1).length;
    const sign = Math.sign(d);
    if (sign !== 0 && lastSign !== 0 && sign !== lastSign) stats.nodeSwings++;
    if (sign !== 0) lastSign = sign;
    // The score lead, once per exchange (after the second player's turn, so each side has scored as often).
    if (s.turn % 2 === 0 || s.phase === 'over') {
      const sd = scoreOf(s.players[0]) - scoreOf(s.players[1]);
      scoreDiffs.push(sd);
      const sg = Math.sign(sd);
      if (sg !== 0 && lastScoreSign !== 0 && sg !== lastScoreSign) stats.scoreSwings++;
      if (sg !== 0) lastScoreSign = sg;
    }
  };
  for (const side of [0, 1] as Side[]) s = applyGridAction(s, side, chooseGridMulligan(s, side));
  collect();
  for (let i = 0; i < 2 * rulesOf(s).turnLimit + 4 && s.phase === 'main'; i++) {
    const side = s.active;
    if (trace) {
      trace.turns++;
      trace.decisions++;
      const legal = legalGridActions(s, side).length - 1;
      trace.legal += legal;
      trace.distinct += legal;
    }
    const before = s.logBase + s.log.length;
    s = runGridBot(s, side, { ...GRID_BOT, ...opts.bots?.[side] });
    if (trace) {
      for (let k = Math.max(0, before - s.logBase); k < s.log.length; k++) {
        const e = s.log[k];
        if (e.k === 'turn') break;
        const follow = e.k === 'attack' || e.k === 'ability' || (e.k === 'brace' && !e.auto);
        if (e.k === 'deploy' || e.k === 'move' || e.k === 'hq' || (follow && !movedBefore(s, k, e.uid))) trace.actions++;
      }
    }
    collect();
    trace?.leads.push(gridLead(s));
  }
  if (s.phase !== 'over') s = applyGridAction(s, 0, { type: 'concede' });
  stats.covered = [...covered];
  stats.end = s.endReason;
  stats.scores = [scoreOf(s.players[0]), scoreOf(s.players[1])];
  if (s.winner !== null) stats.scoreComeback = scoreDiffs.some(d => (s.winner === 0 ? d : -d) < 0);
  const reason = s.endReason === 'hq' || s.endReason === 'score' ? 'hero' : s.endReason;
  return { winner: s.winner, first: s.first, turns: s.turn, reason, played, grid: stats, ...(trace ? { trace } : {}) };
}

/** Did this attack's unit move earlier in the same turn (then move+attack is one action pair)? */
function movedBefore(s: GridState, k: number, uid: string): boolean {
  for (let i = k - 1; i >= 0; i--) {
    const e = s.log[i];
    if (e.k === 'turn') return false;
    if (e.k === 'move' && e.uid === uid) return true;
  }
  return false;
}

export interface GridSummary {
  games: number;
  turnsMean: number;
  /** Turns per player. */
  turnsEachMean: number;
  endReasons: Record<string, number>;
  hqWinShare: number;
  limitShare: number;
  /** Of HQ kills, the share where the loser still had a connected node. */
  snipeConnectedShare: number;
  claimsPerGame: number;
  stealsPerGame: number;
  nodeSwingsPerGame: number;
  coverage: number;
  orderMix: Record<string, number>;
  ordersPerTurn: number;
  deploysPerTurn: number;
  forwardDeployShare: number;
  /** Per element: share of unit orders that moved, and mean tiles per move. */
  moveByElement: Record<string, { moveShare: number; tiles: number }>;
  flankedShare: number;
  flankPerAttack: number;
  zocStopsPerGame: number;
  retaliationsPerGame: number;
  hqFirePerGame: number;
  hqDamagePerGame: number;
  armourSoakShare: number;
  capturesPerGame: number;
  unitDeathsPerGame: number;
  /** Free end-of-turn braces per player-turn, and setbacks per game. */
  autoBracesPerTurn: number;
  setbacksPerGame: number;
  abilityAttacksPerGame: number;
  /** Win share of each deck element (by tank), counting draws as half. */
  elementWins: Record<string, { games: number; win: number }>;
  /** How games ended, by the engine's reason (hq, score, turn_limit, ...), as shares. */
  ends: Record<string, number>;
  /** Territory score: mean winner and loser score, points a game from nodes, HQ damage and objectives. */
  winnerScore: number;
  loserScore: number;
  nodePointsPerGame: number;
  hqPointsPerGame: number;
  objectivePointsPerGame: number;
  /** Score-lead sign changes per game (per exchange), and the share of decided games whose winner trailed on score. */
  scoreSwingsPerGame: number;
  scoreComebackShare: number;
  /** Node flips: claims from neutral plus steals, per game. */
  nodeFlipsPerGame: number;
}

export function summarizeGrid(results: GameResult[]): GridSummary {
  const rs = results.filter(r => r.grid);
  const n = Math.max(1, rs.length);
  const sum = (f: (g: GridStats) => number) => rs.reduce((a, r) => a + f(r.grid!), 0);
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const turns = rs.reduce((a, r) => a + r.turns, 0);
  const endReasons: Record<string, number> = {};
  const els: Record<string, { games: number; w: number }> = {};
  let hqKills = 0;
  for (const r of rs) {
    endReasons[r.reason ?? 'none'] = (endReasons[r.reason ?? 'none'] ?? 0) + 1;
    if (r.reason === 'hero') hqKills++;
    r.grid!.tanks.forEach((e, sd) => {
      const x = (els[e] ??= { games: 0, w: 0 });
      x.games++;
      x.w += r.winner === sd ? 1 : r.winner === null ? 0.5 : 0;
    });
  }
  const orders = ORDER_TYPES.reduce((a, k) => a + sum(g => g.orders[k]), 0);
  const moveByElement: GridSummary['moveByElement'] = {};
  for (const e of ['earth', 'thunder', 'water', 'fire', 'air'] as Element[]) {
    const o = sum(g => g.byElement[e].orders), m = sum(g => g.byElement[e].moves), t = sum(g => g.byElement[e].tiles);
    moveByElement[e] = { moveShare: r3(m / Math.max(1, o)), tiles: r3(t / Math.max(1, m)) };
  }
  return {
    games: rs.length,
    turnsMean: r3(turns / n),
    turnsEachMean: r3(turns / n / 2),
    endReasons,
    hqWinShare: r3(hqKills / n),
    limitShare: r3((endReasons.turn_limit ?? 0) / n),
    snipeConnectedShare: r3(rs.filter(r => r.reason === 'hero' && r.grid!.snipeConnected).length / Math.max(1, hqKills)),
    claimsPerGame: r3(sum(g => g.claims) / n),
    stealsPerGame: r3(sum(g => g.steals) / n),
    nodeSwingsPerGame: r3(sum(g => g.nodeSwings) / n),
    coverage: r3(sum(g => g.covered.length / Math.max(1, g.standable)) / n),
    orderMix: Object.fromEntries(ORDER_TYPES.map(k => [k, r3(sum(g => g.orders[k]) / Math.max(1, orders))])),
    ordersPerTurn: r3(orders / Math.max(1, turns)),
    deploysPerTurn: r3(sum(g => g.deploys) / Math.max(1, turns)),
    forwardDeployShare: r3(sum(g => g.forwardDeploys) / Math.max(1, sum(g => g.deploys))),
    moveByElement,
    flankedShare: r3(sum(g => g.flanked) / Math.max(1, sum(g => g.attacks))),
    flankPerAttack: r3(sum(g => g.flankDamage) / Math.max(1, sum(g => g.attacks))),
    zocStopsPerGame: r3(sum(g => g.zocStops) / n),
    retaliationsPerGame: r3(sum(g => g.retaliations) / n),
    hqFirePerGame: r3(sum(g => g.hqFire) / n),
    hqDamagePerGame: r3(sum(g => g.hqDamage) / n),
    armourSoakShare: r3(sum(g => g.armourSoaked) / Math.max(1, sum(g => g.hqDamage + g.armourSoaked))),
    capturesPerGame: r3(sum(g => g.captures) / n),
    unitDeathsPerGame: r3(sum(g => g.unitDeaths) / n),
    autoBracesPerTurn: r3(sum(g => g.autoBraces ?? 0) / Math.max(1, turns)),
    setbacksPerGame: r3(sum(g => g.setbacks ?? 0) / n),
    abilityAttacksPerGame: r3(sum(g => g.abilityAttacks ?? 0) / n),
    ends: Object.fromEntries(Object.entries(rs.reduce((a, r) => { const k = r.grid!.end ?? 'none'; a[k] = (a[k] ?? 0) + 1; return a; }, {} as Record<string, number>)).map(([k, v]) => [k, r3(v / n)])),
    winnerScore: r3(rs.filter(r => r.winner !== null).reduce((a, r) => a + r.grid!.scores[r.winner!], 0) / Math.max(1, rs.filter(r => r.winner !== null).length)),
    loserScore: r3(rs.filter(r => r.winner !== null).reduce((a, r) => a + r.grid!.scores[r.winner === 0 ? 1 : 0], 0) / Math.max(1, rs.filter(r => r.winner !== null).length)),
    nodePointsPerGame: r3(sum(g => g.nodePoints ?? 0) / n),
    hqPointsPerGame: r3(sum(g => g.hqPoints ?? 0) / n),
    objectivePointsPerGame: r3(sum(g => g.objectivePoints ?? 0) / n),
    scoreSwingsPerGame: r3(sum(g => g.scoreSwings ?? 0) / n),
    scoreComebackShare: r3(rs.filter(r => r.winner !== null && r.grid!.scoreComeback).length / Math.max(1, rs.filter(r => r.winner !== null).length)),
    nodeFlipsPerGame: r3(sum(g => g.claims + g.steals) / n),
    elementWins: Object.fromEntries(Object.entries(els).map(([e, x]) => [e, { games: x.games, win: r3(x.w / Math.max(1, x.games)) }])),
  };
}
