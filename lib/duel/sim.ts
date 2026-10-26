// Self-play harness for balance work. Two copies of the practice bot play
// each other with generated decks; the results say whether rarity, element
// or going first decide games more than they should. See sim.test.ts for
// the questions asked and lib/duel/README.md for the latest answers.

import { chooseAction, runBot, type BotWeights } from './ai';
import { allCards } from './catalog';
import { copyLimit, MAX_MYTHIC, MAX_RENOWNED, RENOWNED } from './deck';
import { applyAction, createGame, DECK_SIZE, legalActions } from './engine';
import { Rng } from './rng';
import type { Action, CardDef, Element, GameState, Side } from './types';
import type { WarBotParams } from './war/ai';
import type { WarStats } from './war/sim';
import type { GridBotParams } from './grid/ai';
import type { GridStats } from './grid/sim';
import type { GridOptions } from './grid/engine';

export interface GameResult {
  winner: Side | null;
  first: Side;
  turns: number;
  reason: GameState['endReason'];
  /** Slugs each side played from hand. */
  played: [string[], string[]];
  trace?: GameTrace;
  /** Three-Front War only (war/sim.ts). */
  war?: WarStats;
  /** Warfront only (grid/sim.ts). */
  grid?: GridStats;
}

/** What the engagement metrics (metrics.ts) need from one game. */
export interface GameTrace {
  /** Bot decisions in the main phase, and the legal non-pass actions summed over them. */
  decisions: number;
  legal: number;
  /** Player-turns, the distinct choices open at their start, and actions taken. */
  turns: number;
  distinct: number;
  actions: number;
  /** Side 0's lead after each player-turn (see lead()). */
  leads: number[];
}

export interface PlayOptions {
  /** Record a GameTrace (slower: it enumerates the legal actions again). */
  trace?: boolean;
  /** Bot weights per seat; default the shipped weights. */
  bots?: [BotWeights | undefined, BotWeights | undefined];
  /** Three-Front War bot settings per seat (overrides WAR_BOT). */
  warBots?: [Partial<WarBotParams> | undefined, Partial<WarBotParams> | undefined];
  /** Warfront bot settings per seat (overrides GRID_BOT), and board options. */
  gridBots?: [Partial<GridBotParams> | undefined, Partial<GridBotParams> | undefined];
  grid?: GridOptions;
}

/** Distinct things a player could do: one per card or unit and kind of target. */
function distinctChoices(s: GameState, side: Side, legal: Action[]): number {
  const keys = new Set<string>();
  const p = s.players[side];
  const slugOf = (uid: string) => p.hand.find(h => h.uid === uid)?.slug ?? p.board.find(u => u.uid === uid)?.slug ?? uid;
  for (const a of legal) {
    if (a.type === 'end_turn') continue;
    if (a.type === 'play' || a.type === 'move' || a.type === 'attack') keys.add(`${a.type}:${slugOf(a.uid)}:${a.target?.kind ?? ''}`);
    else keys.add(a.type);
  }
  return keys.size;
}

/** Side 0's lead: hero health difference plus half the difference in board stats. */
export function lead(s: GameState): number {
  const stats = (side: Side) => s.players[side].board.reduce((a, u) => a + u.power + u.health, 0);
  return s.players[0].hp - s.players[1].hp + 0.5 * (stats(0) - stats(1));
}

export function playGame(a: string[], b: string[], seed: number, opts: PlayOptions = {}): GameResult {
  let s = createGame(seed, [{ name: 'A', avatar: '', deck: a }, { name: 'B', avatar: '', deck: b }]);
  const trace: GameTrace | undefined = opts.trace ? { decisions: 0, legal: 0, turns: 0, distinct: 0, actions: 0, leads: [] } : undefined;
  const played: [string[], string[]] = [[], []];
  // Read plays as they happen: the stored log is trimmed on long games.
  let seen = 0;
  const collect = () => {
    for (let i = Math.max(0, seen - s.logBase); i < s.log.length; i++) {
      const e = s.log[i];
      if (e.k === 'play' && !e.slug.startsWith('token-')) played[e.side].push(e.slug);
    }
    seen = s.logBase + s.log.length;
  };
  for (let i = 0; i < 400 && s.phase !== 'over'; i++) {
    const side = (s.phase === 'mulligan' ? (s.players[0].mulliganed ? 1 : 0) : s.active) as Side;
    const w = opts.bots?.[side];
    if (!trace || s.phase !== 'main') {
      s = runBot(s, side, 40, w);
      collect();
      continue;
    }
    trace.turns++;
    trace.distinct += distinctChoices(s, side, legalActions(s, side));
    for (let k = 0; k < 40 && s.phase === 'main' && s.active === side; k++) {
      trace.decisions++;
      trace.legal += legalActions(s, side).length - 1;
      const act = chooseAction(s, side, w) ?? { type: 'end_turn' };
      s = applyAction(s, side, act);
      collect();
      if (act.type === 'end_turn') break;
      trace.actions++;
    }
    if (s.phase === 'main' && s.active === side) s = applyAction(s, side, { type: 'end_turn' });
    trace.leads.push(lead(s));
  }
  return { winner: s.winner, first: s.first, turns: s.turn, reason: s.endReason, played, ...(trace ? { trace } : {}) };
}

export interface DeckSpec {
  elements: Element[];
  /** Which tiers may appear at all. */
  tiers: Set<string>;
  /** Fill the renowned slots when possible. */
  maxRenowned?: boolean;
}

const CURVE = [0, 2, 4, 4, 4, 3, 2, 1, 0, 0]; // target copies at each cost, sums to 20

/** A legal deck from the spec, built toward a sensible curve. */
export function buildDeck(spec: DeckSpec, rng: Rng, pool: CardDef[] = allCards()): string[] {
  const cards = pool.filter(c => spec.elements.includes(c.element) && spec.tiers.has(c.tier));
  const deck: string[] = [];
  const count = new Map<string, number>();
  let renowned = 0;
  let mythic = 0;
  const canAdd = (c: CardDef) => {
    if ((count.get(c.slug) ?? 0) >= copyLimit(c)) return false;
    if (RENOWNED.has(c.tier) && renowned >= MAX_RENOWNED) return false;
    if (c.tier === 'mythic' && mythic >= MAX_MYTHIC) return false;
    return true;
  };
  const add = (c: CardDef) => {
    deck.push(c.slug);
    count.set(c.slug, (count.get(c.slug) ?? 0) + 1);
    if (RENOWNED.has(c.tier)) renowned++;
    if (c.tier === 'mythic') mythic++;
  };
  if (spec.maxRenowned) {
    const top = rng.shuffle(cards.filter(c => RENOWNED.has(c.tier)))
      .sort((x, y) => (y.tier === 'mythic' ? 1 : 0) - (x.tier === 'mythic' ? 1 : 0));
    for (const c of top) if (canAdd(c) && renowned < MAX_RENOWNED) add(c);
  }
  for (let cost = 1; cost < CURVE.length && deck.length < DECK_SIZE; cost++) {
    const have = deck.filter(s => cards.find(c => c.slug === s)?.cost === cost).length;
    const at = rng.shuffle(cards.filter(c => c.cost === cost));
    let need = CURVE[cost] - have;
    for (const c of at) {
      while (need > 0 && canAdd(c) && deck.length < DECK_SIZE) {
        add(c);
        need--;
        if (rng.float() < 0.5) break; // prefer variety over doubles
      }
      if (need <= 0) break;
    }
  }
  // Top up from anything left, cheapest first.
  const rest = rng.shuffle(cards.slice()).sort((x, y) => x.cost - y.cost);
  for (const c of rest) {
    while (deck.length < DECK_SIZE && canAdd(c)) add(c);
    if (deck.length >= DECK_SIZE) break;
  }
  if (deck.length !== DECK_SIZE) throw new Error(`Could not build a deck for ${spec.elements.join('+')}`);
  return deck;
}

export interface Tally {
  games: number;
  wins: number;
  draws: number;
}

export function rate(t: Tally): number {
  return t.games ? (t.wins + 0.5 * t.draws) / t.games : NaN;
}

/**
 * Plays `games` games of deck-maker A against deck-maker B, swapping seats
 * each game so going first is shared evenly. Returns A's tally.
 */
export function matchup(makeA: (r: Rng) => string[], makeB: (r: Rng) => string[], games: number, seed: number): Tally & { firstWins: number; turns: number } {
  const rng = new Rng(seed);
  const t = { games: 0, wins: 0, draws: 0, firstWins: 0, turns: 0 };
  for (let g = 0; g < games; g++) {
    const a = makeA(rng);
    const b = makeB(rng);
    const aSide: Side = (g % 2) as Side;
    const r = aSide === 0 ? playGame(a, b, rng.int(2 ** 31)) : playGame(b, a, rng.int(2 ** 31));
    t.games++;
    t.turns += r.turns;
    if (r.winner === null) t.draws++;
    else if (r.winner === aSide) t.wins++;
    if (r.winner === r.first) t.firstWins++;
  }
  return t;
}
