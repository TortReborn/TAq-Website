// The practice opponent, also used by the balance simulations.
//
// Two layers:
//   - Greedy: try every legal action on a copy of the game, score the
//     result, take the best one, repeat until ending the turn scores highest.
//   - Plan search (weights.width > 0): take the `width` best first actions,
//     finish each turn greedily, then let the opponent's board swing back
//     (their units attack and their tank acts, greedily, with no cards in
//     hand) and keep the plan that leaves the best position after that. This
//     is what stops the bot trading its board away for a little face damage
//     and dying on the swing back.
// The score reads only what the bot could see at the table (boards, health,
// hand sizes); the swing-back copy has no hand or deck for the opponent, and
// lookahead copies get a fresh RNG seed, so the bot never peeks at a hidden
// card or a coin flip before choosing.
//
// The score is a weighted sum; the weights live in ai-weights.json and are
// learned by self-play (lib/duel/train.ts): a perturbed copy of the weights
// plays the current ones on the same decks and seeds, and replaces them only
// when it wins clearly. Balance numbers are only as good as this player, so
// retrain it after rule changes.

import defaults from './ai-weights.json';
import { applyAction, cloneState, defOf, legalActions, MAX_TIDE, moveOf, other } from './engine';
import type { Action, GameState, Side, Unit } from './types';

export type BotWeights = typeof defaults;

/** Mutable only so the balance lab can load freshly trained weights in-process. */
export const WEIGHTS: BotWeights = { ...defaults };

function unitScore(s: GameState, u: Unit, w: BotWeights): number {
  const def = defOf(u.slug, s.extraDefs);
  let v = u.power * w.power + u.health * w.health;
  if (u.keywords.includes('guard')) v += w.guard;
  // A shield is worth about one typical hit absorbed, whatever the unit's power.
  if (u.shield) v += w.shield;
  if (u.stealth) v += w.stealth;
  if (u.keywords.includes('ranged')) v += w.ranged * u.power;
  if (u.keywords.includes('drain')) v += w.drain * u.power;
  if (u.keywords.includes('pierce')) v += w.pierce * u.power;
  if (u.keywords.includes('regen')) v += w.regen;
  if (moveOf(def)) v += w.move;
  if (s.turn <= u.frozenUntil) v -= w.frozen * u.power;
  return v;
}

function heroScore(hp: number, w: BotWeights): number {
  if (hp <= 0) return -1000;
  return w.hero * hp - (hp < 10 ? (10 - hp) ** 2 * w.lowHero : 0);
}

export function evaluate(s: GameState, side: Side, w: BotWeights = WEIGHTS): number {
  if (s.phase === 'over') return s.winner === side ? 1e6 : s.winner === null ? 0 : -1e6;
  const me = s.players[side];
  const foe = s.players[other(side)];
  let score = heroScore(me.hp, w) - heroScore(foe.hp, w);
  for (const u of me.board) score += unitScore(s, u, w);
  for (const u of foe.board) score -= unitScore(s, u, w);
  score += w.hand * Math.min(me.hand.length, 6) - w.hand * Math.min(foe.hand.length, 6);
  // Reach: damage each board could put on the other hero next turn. A Guard
  // in the way zeroes it, which is what makes breaking a wall worth a bad
  // trade; without this term a one-move lookahead never attacks a shielded
  // Guard and stalls behind it.
  const mine = reach(s, side);
  score += w.reach * mine - w.reach * reach(s, other(side));
  if (mine >= foe.hp) score += w.lethal;
  return score;
}

function reach(s: GameState, side: Side): number {
  const foe = s.players[other(side)];
  if (foe.board.some(u => u.keywords.includes('guard') && !u.stealth)) return 0;
  return s.players[side].board.reduce((a, u) => a + u.power, 0);
}

let lookaheadSeed = 0x9e3779b9;

function tryAction(s: GameState, side: Side, a: Action): GameState | null {
  try {
    lookaheadSeed = (lookaheadSeed + 0x6d2b79f5) >>> 0;
    return applyAction({ ...s, rng: lookaheadSeed }, side, a);
  } catch {
    return null;
  }
}

export function chooseMulligan(s: GameState, side: Side): Action {
  const hand = s.players[side].hand;
  const replace = hand.filter(h => defOf(h.slug, s.extraDefs).cost >= 5).map(h => h.uid);
  return { type: 'mulligan', replace };
}

/** Every non-pass action with the state and score it leads to, best first. */
function ranked(s: GameState, side: Side, w: BotWeights): { a: Action; next: GameState; score: number }[] {
  const baseline = evaluate(s, side, w);
  const legal = legalActions(s, side);
  const out: { a: Action; next: GameState; score: number }[] = [];
  for (const a of legal) {
    if (a.type === 'end_turn') continue;
    const next = tryAction(s, side, a);
    if (!next) continue;
    // Spending the Pearl only pays if it enables something this turn.
    let score = evaluate(next, side, w);
    if (a.type === 'pearl') {
      const follow = legalActions(next, side).filter(x => x.type === 'play' && !legal.some(y => y.type === 'play' && y.uid === x.uid));
      score = follow.length ? baseline + 0.1 : -Infinity;
    }
    out.push({ a, next, score });
  }
  return out.sort((x, y) => y.score - x.score);
}

function greedyAction(s: GameState, side: Side, w: BotWeights): { a: Action; next: GameState } | null {
  const best = ranked(s, side, w)[0];
  return best && best.score > evaluate(s, side, w) + w.pass ? best : null;
}

/** Finish the turn greedily; returns the state just before ending it. */
function greedyFinish(s: GameState, side: Side, w: BotWeights): GameState {
  let state = s;
  for (let i = 0; i < 20 && state.phase === 'main' && state.active === side; i++) {
    const step = greedyAction(state, side, w);
    if (!step) break;
    state = step.next;
  }
  return state;
}

/**
 * The opponent's board swinging back: a copy in which it is their turn, with
 * their tide refilled and one higher, but no hand and no deck, since the bot
 * cannot see those. Scored from `side`'s point of view.
 */
function afterSwingBack(s: GameState, side: Side, w: BotWeights): number {
  if (s.phase === 'over') return evaluate(s, side, w);
  const foe = other(side);
  const t = cloneState(s);
  t.active = foe;
  t.turn = s.turn + 1;
  const p = t.players[foe];
  p.hand = [];
  p.deck = [];
  // Fatigue would hurt them for a draw they would really make; make it free.
  p.fatigue = -100;
  p.pearl = false;
  p.maxTide = Math.min(MAX_TIDE, p.maxTide + 1);
  p.tide = p.maxTide;
  p.tankUsed = false;
  for (const u of p.board) u.ready = true;
  return evaluate(greedyFinish(t, foe, w), side, w);
}

/** The bot's next action, or null if it has nothing to do. */
export function chooseAction(s: GameState, side: Side, w: BotWeights = WEIGHTS): Action | null {
  if (s.phase === 'over') return null;
  if (s.phase === 'mulligan') return s.players[side].mulliganed ? null : chooseMulligan(s, side);
  if (s.active !== side) return null;
  if (w.width < 1) return greedyAction(s, side, w)?.a ?? { type: 'end_turn' };
  const options = ranked(s, side, w).slice(0, Math.round(w.width));
  let best: Action = { type: 'end_turn' };
  let bestScore = afterSwingBack(s, side, w) + w.pass;
  for (const o of options) {
    if (o.score === -Infinity) continue;
    const score = afterSwingBack(greedyFinish(o.next, side, w), side, w);
    if (score > bestScore) {
      bestScore = score;
      best = o.a;
    }
  }
  return best;
}

/** Play out the bot's whole turn (or mulligan). Returns the new state. */
export function runBot(s: GameState, side: Side, maxActions = 40, w: BotWeights = WEIGHTS): GameState {
  let state = s;
  for (let i = 0; i < maxActions; i++) {
    const a = chooseAction(state, side, w);
    if (!a) return state;
    state = applyAction(state, side, a);
    if (a.type === 'end_turn' || a.type === 'mulligan') return state;
  }
  return state.phase === 'main' && state.active === side ? applyAction(state, side, { type: 'end_turn' }) : state;
}
