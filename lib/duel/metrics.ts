// Engagement proxies from self-play. None of these is "fun"; together they
// say whether games are long enough to have a middle, whether players have
// real choices, and whether the side ahead early simply wins.
//
//   length      player-turns per game (the engine's turn counter)
//   legal       legal non-pass actions at each bot decision
//   distinct    distinct things to do at the start of a turn: one per card
//               or unit and kind of target (sim.ts distinctChoices)
//   actions     actions actually taken per turn
//   leadChanges times the leader flips, with a dead band so a 1-point
//               wobble is not a flip (lead = hero health difference plus
//               half the board-stat difference)
//   comeback    the winner was behind by COMEBACK or more at some point
//   decidedAt   share of the game after which the eventual winner was never
//               behind again; "early" when that is in the first third
//   perExchange the lead-based numbers again, sampled once per full exchange
//               (one duel round = both players' turns; one war round), so
//               the two rulesets compare like for like. The duel samples
//               every player-turn and the war sim records each round twice,
//               so both are read at every second sample.

import type { GameResult } from './sim';

const BAND = 2;
const COMEBACK = 5;

export interface Engagement {
  games: number;
  length: { mean: number; p10: number; p50: number; p90: number };
  legalPerDecision: number;
  distinctPerTurn: number;
  actionsPerTurn: number;
  leadChanges: number;
  gamesWithLeadChange: number;
  comebackRate: number;
  decidedEarly: number;
  decidedAtMedian: number;
  firstPlayerWin: number;
  turnLimitRate: number;
  perExchange: LeadStats;
}

export interface LeadStats {
  leadChanges: number;
  comebackRate: number;
  decidedEarly: number;
}

/** Lead changes, comebacks and early decisions, reading every `stride`-th lead sample. */
export function leadStats(results: GameResult[], stride = 1): LeadStats {
  let changes = 0, n = 0, comebacks = 0, early = 0, decisive = 0;
  for (const r of results) {
    if (!r.trace) continue;
    const leads = r.trace.leads.filter((_, i) => i % stride === stride - 1 || i === r.trace!.leads.length - 1);
    n++;
    let leader = 0;
    for (const l of leads) {
      const now = l > BAND ? 1 : l < -BAND ? -1 : 0;
      if (now !== 0 && leader !== 0 && now !== leader) changes++;
      if (now !== 0) leader = now;
    }
    if (r.winner === null) continue;
    decisive++;
    const sign = r.winner === 0 ? 1 : -1;
    if (leads.some(l => sign * l <= -COMEBACK)) comebacks++;
    let last = -1;
    leads.forEach((l, i) => { if (sign * l < -BAND) last = i; });
    if ((leads.length ? (last + 1) / leads.length : 0) <= 1 / 3) early++;
  }
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return { leadChanges: r3(changes / Math.max(1, n)), comebackRate: r3(comebacks / Math.max(1, decisive)), decidedEarly: r3(early / Math.max(1, decisive)) };
}

function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function engagement(results: GameResult[]): Engagement {
  const traced = results.filter(r => r.trace);
  let decisions = 0, legal = 0, turns = 0, distinct = 0, actions = 0;
  let changes = 0, withChange = 0, comebacks = 0, early = 0, decisive = 0, firstWins = 0, limit = 0;
  const decidedAt: number[] = [];
  for (const r of results) {
    if (r.winner === r.first) firstWins++;
    if (r.reason === 'turn_limit') limit++;
  }
  for (const r of traced) {
    const t = r.trace!;
    decisions += t.decisions; legal += t.legal; turns += t.turns; distinct += t.distinct; actions += t.actions;
    let leader = 0;
    let flips = 0;
    for (const l of t.leads) {
      const now = l > BAND ? 1 : l < -BAND ? -1 : 0;
      if (now !== 0 && leader !== 0 && now !== leader) flips++;
      if (now !== 0) leader = now;
    }
    changes += flips;
    if (flips) withChange++;
    if (r.winner === null) continue;
    decisive++;
    const sign = r.winner === 0 ? 1 : -1;
    if (t.leads.some(l => sign * l <= -COMEBACK)) comebacks++;
    // Last player-turn after which the winner was behind (beyond the band).
    let last = -1;
    t.leads.forEach((l, i) => { if (sign * l < -BAND) last = i; });
    const frac = t.leads.length ? (last + 1) / t.leads.length : 0;
    decidedAt.push(frac);
    if (frac <= 1 / 3) early++;
  }
  const lengths = results.map(r => r.turns);
  return {
    games: results.length,
    length: {
      mean: r2(lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length)),
      p10: quantile(lengths, 0.1), p50: quantile(lengths, 0.5), p90: quantile(lengths, 0.9),
    },
    legalPerDecision: r2(legal / Math.max(1, decisions)),
    distinctPerTurn: r2(distinct / Math.max(1, turns)),
    actionsPerTurn: r2(actions / Math.max(1, turns)),
    leadChanges: r2(changes / Math.max(1, traced.length)),
    gamesWithLeadChange: r3(withChange / Math.max(1, traced.length)),
    comebackRate: r3(comebacks / Math.max(1, decisive)),
    decidedEarly: r3(early / Math.max(1, decisive)),
    decidedAtMedian: r3(quantile(decidedAt, 0.5)),
    firstPlayerWin: r3(firstWins / Math.max(1, results.length)),
    turnLimitRate: r3(limit / Math.max(1, results.length)),
    perExchange: leadStats(results, 2),
  };
}
