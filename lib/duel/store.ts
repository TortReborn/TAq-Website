// Persistence for Tank Duels: decks, challenges and live matches in
// duel_decks / duel_matches (sql/create_card_duels.sql), ownership from the
// bot's card_collection. A match is played under one of two rulesets
// (duel_matches.ruleset): 'duel', the card duel, or 'war', Three-Front War
// (lib/duel/war), or 'grid', Warfront (lib/duel/grid). All share decks,
// challenges, clocks and version locking;
// only the state inside differs. Every function takes the connection it should use,
// so a route can run several inside one transaction and tests can point
// them at session temp tables.

import { randomInt } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { chooseAction, runBot } from './ai';
import { getCard, memberCard } from './catalog';
import { starterDeck, validateDeck, type Owned } from './deck';
import { ActionError, applyAction, createGame, type ExtraDefs } from './engine';
import { Rng } from './rng';
import { buildDeck } from './sim';
import type { Action, CardDef, Element, GameState, GameView, Side } from './types';
import { ELEMENTS } from './types';
import { viewFor } from './view';
import { chooseWarMulligan, chooseWarPlan } from './war/ai';
import { warCards } from './war/cards';
import { WAR_ROUND_SECONDS } from './war/config';
import { applyWarAction, createWar, WarError } from './war/engine';
import type { WarAction, WarState } from './war/types';
import { warViewFor, type WarView } from './war/view';
import { chooseGridMulligan, GRID_BOT, runGridBot } from './grid/ai';
import { GRID_TURN_SECONDS } from './grid/config';
import { applyGridAction, createGrid, GridError, type GridOptions } from './grid/engine';
import type { GridAction, GridState } from './grid/types';
import { gridViewFor, type GridView } from './grid/view';

export type Ruleset = 'duel' | 'war' | 'grid';
export const RULESETS: Ruleset[] = ['duel', 'war', 'grid'];

type Db = Pool | PoolClient;

import { MULLIGAN_SECONDS, TURN_SECONDS } from './rules';
export { MULLIGAN_SECONDS, TURN_SECONDS };
export const MAX_DECKS = 20;
export const MAX_OPEN_CHALLENGES = 3;
export const BOT_NAME = 'Practice Bot';
const OPEN_TTL = "INTERVAL '24 hours'";

/** A request the player can fix; routes turn it into a 400. */
export class DuelInputError extends Error {}
/** The client acted on an old version; routes turn it into a 409. */
export class StaleVersionError extends Error {}

export interface Me {
  discordId: string;
  ign: string;
  uuid: string;
}

export interface MatchRow {
  id: string;
  ruleset: Ruleset;
  mode: 'practice' | 'friendly';
  status: 'open' | 'active' | 'finished' | 'cancelled';
  p0: string;
  p1: string | null;
  invitee: string | null;
  p0_deck: string[];
  p1_deck: string[] | null;
  /** GameState for 'duel', WarState for 'war', GridState for 'grid' (see duelState / warState / gridState). */
  state: GameState | WarState | GridState | null;
  version: number;
  deadline: Date | null;
  winner: number | null;
  end_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

// --- Collection ------------------------------------------------------------

export async function ownedCards(db: Db, userId: string): Promise<Owned> {
  const { rows } = await db.query<{ card: string; n: number }>(
    `SELECT card, SUM(count)::int AS n FROM card_collection WHERE "user" = $1 GROUP BY card`,
    [userId],
  );
  return Object.fromEntries(rows.map(r => [r.card, r.n]));
}

/** Battle cards for member-card slugs (card_members); other slugs are ignored. */
export async function memberDefs(db: Db, slugs: string[]): Promise<ExtraDefs> {
  const wanted = [...new Set(slugs.filter(s => s.startsWith('member-')))];
  if (!wanted.length) return {};
  const { rows } = await db.query<{ slug: string; ign: string; uuid: string }>(
    `SELECT slug, ign, COALESCE(uuid::text, '') AS uuid FROM card_members WHERE slug = ANY($1)`,
    [wanted],
  );
  return Object.fromEntries(rows.map(r => [r.slug, memberCard(r.slug, r.ign, r.uuid.replace(/-/g, ''))]));
}

function lookupWith(extra: ExtraDefs) {
  return (slug: string): CardDef | undefined => extra[slug] ?? getCard(slug);
}

// --- Decks -----------------------------------------------------------------

export interface DeckRow {
  id: string;
  name: string;
  cards: string[];
  updated_at: Date;
}

export async function listDecks(db: Db, userId: string): Promise<DeckRow[]> {
  const { rows } = await db.query<DeckRow>(
    `SELECT id::text, name, cards, updated_at FROM duel_decks WHERE "user" = $1 ORDER BY updated_at DESC`,
    [userId],
  );
  return rows;
}

function cleanName(name: unknown): string {
  const s = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!s || s.length > 40) throw new DuelInputError('Deck names are 1 to 40 characters.');
  return s;
}

function cleanCards(cards: unknown): string[] {
  if (!Array.isArray(cards) || cards.length > 60 || !cards.every(c => typeof c === 'string' && c.length <= 64)) {
    throw new DuelInputError('A deck is a list of card slugs.');
  }
  return cards as string[];
}

/**
 * Saves a deck (new when id is omitted). The shape rules are enforced now;
 * ownership only when the deck is taken into a friendly match, so a deck
 * survives trading a card away and coming back to it.
 */
export async function saveDeck(db: Db, userId: string, input: { id?: string; name: unknown; cards: unknown }): Promise<DeckRow> {
  const name = cleanName(input.name);
  const cards = cleanCards(input.cards);
  const extra = await memberDefs(db, cards);
  const errors = validateDeck(cards, null, lookupWith(extra));
  if (errors.length) throw new DuelInputError(errors[0]);
  if (input.id) {
    const { rows } = await db.query<DeckRow>(
      `UPDATE duel_decks SET name = $3, cards = $4, updated_at = NOW()
       WHERE id = $1 AND "user" = $2 RETURNING id::text, name, cards, updated_at`,
      [input.id, userId, name, cards],
    );
    if (!rows[0]) throw new DuelInputError('Deck not found.');
    return rows[0];
  }
  const { rows: [{ n }] } = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM duel_decks WHERE "user" = $1`, [userId]);
  if (n >= MAX_DECKS) throw new DuelInputError(`You can keep ${MAX_DECKS} decks; delete one first.`);
  const { rows } = await db.query<DeckRow>(
    `INSERT INTO duel_decks ("user", name, cards) VALUES ($1, $2, $3) RETURNING id::text, name, cards, updated_at`,
    [userId, name, cards],
  );
  return rows[0];
}

export async function deleteDeck(db: Db, userId: string, id: string): Promise<boolean> {
  const { rowCount } = await db.query(`DELETE FROM duel_decks WHERE id = $1 AND "user" = $2`, [id, userId]);
  return (rowCount ?? 0) > 0;
}

export type DeckChoice = { starter: Element } | { deckId: string };

export function parseDeckChoice(x: unknown): DeckChoice {
  const o = (x ?? {}) as Record<string, unknown>;
  if (typeof o.starter === 'string' && (ELEMENTS as string[]).includes(o.starter)) return { starter: o.starter as Element };
  if (typeof o.deckId === 'string' && /^\d{1,18}$/.test(o.deckId)) return { deckId: o.deckId };
  throw new DuelInputError('Pick a deck.');
}

/** The deck's card list, checked for the mode it is going into. */
export async function resolveDeck(db: Db, userId: string, choice: DeckChoice, enforceOwnership: boolean): Promise<string[]> {
  if ('starter' in choice) return starterDeck(choice.starter);
  const { rows } = await db.query<{ cards: string[] }>(`SELECT cards FROM duel_decks WHERE id = $1 AND "user" = $2`, [choice.deckId, userId]);
  if (!rows[0]) throw new DuelInputError('Deck not found.');
  const cards = rows[0].cards;
  const extra = await memberDefs(db, cards);
  const owned = enforceOwnership ? await ownedCards(db, userId) : null;
  const errors = validateDeck(cards, owned, lookupWith(extra));
  if (errors.length) throw new DuelInputError(errors[0]);
  return cards;
}

// --- Matches ---------------------------------------------------------------

const MATCH_COLS = `id::text, ruleset, mode, status, p0::text, p1::text, invitee::text, p0_deck, p1_deck, state,
  version, deadline, winner, end_reason, created_at, updated_at`;

const duelState = (row: MatchRow) => row.state as GameState;
const warState = (row: MatchRow) => row.state as WarState;
const gridState = (row: MatchRow) => row.state as GridState;

type AnyState = GameState | WarState | GridState;

function deadlineFor(state: AnyState, mode: MatchRow['mode'], from: Date, ruleset: Ruleset): Date | null {
  if (mode === 'practice' || state.phase === 'over') return null;
  const seconds = state.phase === 'mulligan' ? MULLIGAN_SECONDS : ruleset === 'war' ? WAR_ROUND_SECONDS : ruleset === 'grid' ? GRID_TURN_SECONDS : TURN_SECONDS;
  return new Date(from.getTime() + 1000 * seconds);
}

/** The practice bot's Warfront decisions: its mulligan, and every turn that is its to play (it answers in the same request). */
function runGridPracticeBot(state: GridState): GridState {
  let s = state;
  if (s.phase === 'mulligan' && !s.players[1].mulliganed) s = applyGridAction(s, 1, chooseGridMulligan(s, 1));
  for (let i = 0; i < 3 && s.phase === 'main' && s.active === 1; i++) s = runGridBot(s, 1, GRID_BOT);
  return s;
}

/** The practice bot's war decisions: its mulligan, and its plan once the player's is in. */
function runWarBot(state: WarState): WarState {
  let s = state;
  if (s.phase === 'mulligan' && !s.players[1].mulliganed) s = applyWarAction(s, 1, chooseWarMulligan(s, 1));
  if (s.phase === 'plan' && !s.players[1].plan && s.players[0].plan) s = applyWarAction(s, 1, { type: 'plan', plan: chooseWarPlan(s, 1) });
  return s;
}

/** Let the bot take every decision that is currently its to take. */
function runPracticeBot(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < 20 && s.phase !== 'over'; i++) {
    const botToAct = s.phase === 'mulligan' ? !s.players[1].mulliganed : s.active === 1;
    if (!botToAct || !chooseAction(s, 1)) break;
    s = runBot(s, 1);
  }
  return s;
}

export async function createPractice(db: Db, me: Me, deck: string[], botElement?: Element, ruleset: Ruleset = 'duel', grid: GridOptions = {}): Promise<MatchRow> {
  const rng = new Rng(randomInt(2 ** 31));
  const el = botElement ?? rng.pick(ELEMENTS);
  const second = rng.pick(ELEMENTS);
  const botDeck = buildDeck({
    elements: second === el ? [el] : [el, second],
    tiers: new Set(['normal', 'unique', 'rare', 'legendary', 'fabled', 'mythic']),
    // War prices its cards itself (war/cards.ts; a few normals cost 6 there), so its bot builds from them.
  }, rng, ruleset === 'war' ? warCards() : undefined);
  const extra = await memberDefs(db, deck);
  const seats: [{ name: string; avatar: string; deck: string[] }, { name: string; avatar: string; deck: string[] }] = [
    { name: me.ign, avatar: me.uuid, deck },
    { name: BOT_NAME, avatar: '', deck: botDeck },
  ];
  const state = ruleset === 'war'
    ? runWarBot(createWar(randomInt(2 ** 31), seats, extra))
    : ruleset === 'grid'
      ? runGridPracticeBot(createGrid(randomInt(2 ** 31), seats, extra, grid))
      : runPracticeBot(createGame(randomInt(2 ** 31), seats, extra));
  const { rows } = await db.query<MatchRow>(
    `INSERT INTO duel_matches (ruleset, mode, status, p0, p0_deck, p1_deck, state)
     VALUES ($5, 'practice', 'active', $1, $2, $3, $4) RETURNING ${MATCH_COLS}`,
    [me.discordId, deck, botDeck, JSON.stringify(state), ruleset],
  );
  return rows[0];
}

export async function createChallenge(db: Db, me: Me, deck: string[], invitee: string | null, ruleset: Ruleset = 'duel'): Promise<MatchRow> {
  if (invitee === me.discordId) throw new DuelInputError('You cannot challenge yourself.');
  const { rows: [{ n }] } = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM duel_matches WHERE p0 = $1 AND status = 'open' AND created_at > NOW() - ${OPEN_TTL}`,
    [me.discordId],
  );
  if (n >= MAX_OPEN_CHALLENGES) throw new DuelInputError(`You have ${MAX_OPEN_CHALLENGES} open challenges already.`);
  const { rows } = await db.query<MatchRow>(
    `INSERT INTO duel_matches (ruleset, mode, status, p0, invitee, p0_deck)
     VALUES ($4, 'friendly', 'open', $1, $2, $3) RETURNING ${MATCH_COLS}`,
    [me.discordId, invitee, deck, ruleset],
  );
  return rows[0];
}

export async function loadMatch(db: Db, id: string, forUpdate = false): Promise<MatchRow | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const { rows } = await db.query<MatchRow>(
    `SELECT ${MATCH_COLS} FROM duel_matches WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

export function seatOf(row: MatchRow, discordId: string): Side | null {
  if (row.p0 === discordId) return 0;
  if (row.p1 === discordId) return 1;
  return null;
}

/**
 * Apply any clocks that ran out since the row was written. Each missed
 * deadline is one timeout, so a match nobody looked at for five minutes
 * catches up correctly on the next request.
 */
export function settleClock(row: MatchRow, now: Date): { state: AnyState; deadline: Date | null; changed: boolean } {
  let state = row.state!;
  let deadline = row.deadline;
  let changed = false;
  for (let i = 0; i < 8 && deadline && state.phase !== 'over' && now > deadline; i++) {
    // War: whoever has not locked in braces everything (war/engine.ts timeout).
    // Warfront: the active player's turn ends (three in a row forfeits).
    state = row.ruleset === 'war'
      ? applyWarAction(state as WarState, 0, { type: 'timeout' })
      : row.ruleset === 'grid'
        ? applyGridAction(state as GridState, (state as GridState).active, { type: 'timeout' })
        : applyAction(state as GameState, (state as GameState).active, { type: 'timeout' });
    deadline = deadlineFor(state, row.mode, deadline, row.ruleset);
    changed = true;
  }
  return { state, deadline, changed };
}

async function writeState(db: Db, row: MatchRow, state: AnyState, deadline: Date | null): Promise<MatchRow> {
  const over = state.phase === 'over';
  const { rows } = await db.query<MatchRow>(
    `UPDATE duel_matches SET state = $2, version = version + 1, deadline = $3,
       status = CASE WHEN $4 THEN 'finished' ELSE status END,
       winner = $5, end_reason = $6,
       finished_at = CASE WHEN $4 THEN NOW() ELSE finished_at END,
       updated_at = NOW()
     WHERE id = $1 RETURNING ${MATCH_COLS}`,
    [row.id, JSON.stringify(state), deadline, over, state.winner, state.endReason],
  );
  return rows[0];
}

/** Catch the clock up and persist it if anything changed. Needs a row locked FOR UPDATE. */
export async function settleAndSave(db: Db, row: MatchRow, now = new Date()): Promise<MatchRow> {
  if (row.status !== 'active' || !row.state) return row;
  const { state, deadline, changed } = settleClock(row, now);
  return changed ? writeState(db, row, state, deadline) : row;
}

export async function acceptChallenge(db: Db, row: MatchRow, me: Me, deck: string[]): Promise<MatchRow> {
  if (row.status !== 'open') throw new DuelInputError('That challenge is no longer open.');
  if (row.p0 === me.discordId) throw new DuelInputError('That is your own challenge.');
  if (row.invitee && row.invitee !== me.discordId) throw new DuelInputError('That challenge is for someone else.');
  // The challenger's collection may have changed since they issued it.
  const owned = await ownedCards(db, row.p0);
  const extra = await memberDefs(db, [...row.p0_deck, ...deck]);
  if (validateDeck(row.p0_deck, owned, lookupWith(extra)).length) {
    await db.query(`UPDATE duel_matches SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [row.id]);
    throw new DuelInputError('The challenger no longer owns every card in their deck; the challenge was withdrawn.');
  }
  const names = await db.query<{ ign: string; uuid: string }>(
    `SELECT ign, uuid::text AS uuid FROM discord_links WHERE discord_id = $1`, [row.p0],
  );
  const p0 = names.rows[0] ?? { ign: 'Challenger', uuid: '' };
  const seats: [{ name: string; avatar: string; deck: string[] }, { name: string; avatar: string; deck: string[] }] = [
    { name: p0.ign, avatar: p0.uuid.replace(/-/g, ''), deck: row.p0_deck },
    { name: me.ign, avatar: me.uuid, deck },
  ];
  const state = row.ruleset === 'war' ? createWar(randomInt(2 ** 31), seats, extra)
    : row.ruleset === 'grid' ? createGrid(randomInt(2 ** 31), seats, extra)
      : createGame(randomInt(2 ** 31), seats, extra);
  const { rows } = await db.query<MatchRow>(
    `UPDATE duel_matches SET status = 'active', p1 = $2, p1_deck = $3, state = $4, version = version + 1,
       deadline = $5, updated_at = NOW()
     WHERE id = $1 RETURNING ${MATCH_COLS}`,
    [row.id, me.discordId, deck, JSON.stringify(state), deadlineFor(state, 'friendly', new Date(), row.ruleset)],
  );
  return rows[0];
}

/** Withdraw your open challenge, or decline one addressed to you. */
export async function cancelChallenge(db: Db, row: MatchRow, me: Me): Promise<void> {
  if (row.status !== 'open') throw new DuelInputError('That challenge is no longer open.');
  if (row.p0 !== me.discordId && row.invitee !== me.discordId) throw new DuelInputError('Not your challenge.');
  await db.query(`UPDATE duel_matches SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [row.id]);
}

/**
 * Apply one player action to a row locked FOR UPDATE. `version` is what the
 * client last saw; anything else means it is acting on a stale board.
 */
export async function act(db: Db, row: MatchRow, me: Me, version: number, action: Action | WarAction | GridAction, now = new Date()): Promise<MatchRow> {
  const seat = seatOf(row, me.discordId);
  if (seat === null) throw new DuelInputError('You are not in this match.');
  if (row.status !== 'active' || !row.state) throw new DuelInputError('This match is not in play.');
  const settled = await settleAndSave(db, row, now);
  if (settled.version !== version) throw new StaleVersionError('The board changed; refresh and try again.');
  if (action.type === 'timeout') throw new DuelInputError('Unknown action.');
  if (settled.ruleset === 'war') return actWar(db, settled, seat, action as Action | WarAction, now);
  if (settled.ruleset === 'grid') return actGrid(db, settled, seat, action as GridAction, now);
  if (!isDuelAction(action)) throw new DuelInputError('Unknown action.');
  const before = duelState(settled);
  let state: GameState;
  try {
    state = applyAction(before, seat, action);
  } catch (e) {
    if (e instanceof ActionError) throw new DuelInputError(e.message);
    throw e;
  }
  if (settled.mode === 'practice') state = runPracticeBot(state);
  // The clock restarts whenever the decision passes to someone new.
  const handedOver = state.phase !== before.phase || state.active !== before.active || state.turn !== before.turn;
  const deadline = handedOver ? deadlineFor(state, settled.mode, now, settled.ruleset) : settled.deadline;
  return writeState(db, settled, state, deadline);
}

const DUEL_ACTIONS = new Set(['mulligan', 'play', 'attack', 'move', 'tank', 'pearl', 'end_turn', 'concede']);
/** A duel-shaped action (the grid's attack and move carry tile numbers, the duel's a target object). */
function isDuelAction(a: Action | WarAction | GridAction): a is Action {
  if (!DUEL_ACTIONS.has(a.type)) return false;
  if (a.type === 'attack') return typeof (a as { target?: unknown }).target === 'object';
  if (a.type === 'move') return !('to' in a);
  return true;
}

/**
 * A Warfront action: one step of the active player's turn (deploy, move,
 * attack, ability, brace, hq, end_turn), a mulligan or a concession.
 * Practice: when the turn passes to the bot, it plays its whole turn in the
 * same request. The clock restarts whenever the turn changes hands.
 */
async function actGrid(db: Db, row: MatchRow, seat: Side, action: GridAction, now: Date): Promise<MatchRow> {
  const before = gridState(row);
  let state: GridState;
  try {
    state = applyGridAction(before, seat, action);
  } catch (e) {
    if (e instanceof GridError) throw new DuelInputError(e.message);
    throw e;
  }
  if (row.mode === 'practice') state = runGridPracticeBot(state);
  const handedOver = state.phase !== before.phase || state.active !== before.active || state.turn !== before.turn;
  const deadline = handedOver ? deadlineFor(state, row.mode, now, row.ruleset) : row.deadline;
  return writeState(db, row, state, deadline);
}

/**
 * A war action. A plan stays secret in the stored state until both sides
 * have one; then the round resolves inside this request. Practice: the bot
 * plans as soon as the player has, so every plan resolves a round.
 */
async function actWar(db: Db, row: MatchRow, seat: Side, action: Action | WarAction, now: Date): Promise<MatchRow> {
  if (action.type !== 'plan' && action.type !== 'mulligan' && action.type !== 'concede') throw new DuelInputError('Unknown action.');
  const before = warState(row);
  let state: WarState;
  try {
    state = applyWarAction(before, seat, action);
  } catch (e) {
    if (e instanceof WarError) throw new DuelInputError(e.message);
    throw e;
  }
  if (row.mode === 'practice') state = runWarBot(state);
  // The clock restarts with each new round (or phase), not when one side locks in.
  const handedOver = state.phase !== before.phase || state.round !== before.round;
  const deadline = handedOver ? deadlineFor(state, row.mode, now, row.ruleset) : row.deadline;
  return writeState(db, row, state, deadline);
}

// --- Views and lobby -------------------------------------------------------

export interface MatchSummary {
  id: string;
  ruleset: Ruleset;
  mode: MatchRow['mode'];
  status: MatchRow['status'];
  version: number;
  deadline: string | null;
  you: Side | null;
  opponent: { ign: string; uuid: string } | null;
  yourTurn: boolean;
  winner: number | null;
  endReason: string | null;
  updatedAt: string;
}

export interface MatchPayload extends MatchSummary {
  /** Duel matches only. */
  view: GameView | null;
  /** War matches only: the war as this player may see it (never the opponent's plan). */
  warView: WarView | null;
  /** Warfront matches only: the board, both sides' public state and your hand (grid/view.ts). */
  gridView: GridView | null;
  /** War only: whether you, and whether your opponent, have locked in this round's plan (or mulligan). */
  lockedIn: boolean | null;
  opponentLockedIn: boolean | null;
  now: string;
}

export function toPayload(row: MatchRow, seat: Side | null, now = new Date()): MatchPayload {
  const war = row.ruleset === 'war';
  const grid = row.ruleset === 'grid';
  const seated = !!row.state && seat !== null;
  const view = seated && !war && !grid ? viewFor(duelState(row), seat!) : null;
  const warView = seated && war ? warViewFor(warState(row), seat!) : null;
  const gridView = seated && grid ? gridViewFor(gridState(row), seat!) : null;
  const opp = seated ? row.state!.players[seat === 0 ? 1 : 0] : null;
  const locked = (p: WarState['players'][number]) => (warState(row).phase === 'mulligan' ? p.mulliganed : !!p.plan);
  return {
    id: row.id,
    ruleset: row.ruleset,
    mode: row.mode,
    status: row.status,
    version: row.version,
    deadline: row.deadline ? row.deadline.toISOString() : null,
    you: seat,
    opponent: opp ? { ign: opp.name, uuid: opp.avatar } : null,
    yourTurn: war ? !!warView && isYourWarTurn(warState(row), seat!)
      : grid ? !!gridView && isYourGridTurn(gridState(row), seat!)
        : !!view && isYourTurn(duelState(row), seat!),
    winner: row.winner,
    endReason: row.end_reason,
    updatedAt: row.updated_at.toISOString(),
    view,
    warView,
    gridView,
    lockedIn: warView ? locked(warState(row).players[seat!]) : null,
    opponentLockedIn: warView ? locked(warState(row).players[seat === 0 ? 1 : 0]) : null,
    now: now.toISOString(),
  };
}

function isYourWarTurn(s: WarState, seat: Side): boolean {
  if (s.phase === 'mulligan') return !s.players[seat].mulliganed;
  return s.phase === 'plan' && !s.players[seat].plan;
}

function isYourGridTurn(s: GridState, seat: Side): boolean {
  if (s.phase === 'mulligan') return !s.players[seat].mulliganed;
  return s.phase === 'main' && s.active === seat;
}

function isYourTurn(s: GameState, seat: Side): boolean {
  if (s.phase === 'mulligan') return !s.players[seat].mulliganed;
  return s.phase === 'main' && s.active === seat;
}

export interface Lobby {
  active: MatchSummary[];
  incoming: { id: string; ruleset: Ruleset; from: { ign: string; uuid: string }; direct: boolean; createdAt: string }[];
  outgoing: { id: string; ruleset: Ruleset; to: string | null; createdAt: string }[];
  recent: MatchSummary[];
  record: { wins: number; losses: number; draws: number };
}

export async function lobby(db: Db, me: Me): Promise<Lobby> {
  const [mine, open, record] = await Promise.all([
    db.query<MatchRow>(
      `SELECT ${MATCH_COLS} FROM duel_matches
       WHERE (p0 = $1 OR p1 = $1) AND (status = 'active' OR (status = 'finished' AND finished_at > NOW() - INTERVAL '7 days'))
       ORDER BY updated_at DESC LIMIT 30`,
      [me.discordId],
    ),
    db.query<{ id: string; ruleset: Ruleset; p0: string; invitee: string | null; created_at: Date; ign: string | null; uuid: string | null; invitee_ign: string | null }>(
      `SELECT m.id::text, m.ruleset, m.p0::text, m.invitee::text, m.created_at, dl.ign, dl.uuid::text AS uuid, il.ign AS invitee_ign
       FROM duel_matches m
       LEFT JOIN discord_links dl ON dl.discord_id = m.p0
       LEFT JOIN discord_links il ON il.discord_id = m.invitee
       WHERE m.status = 'open' AND m.created_at > NOW() - ${OPEN_TTL}
         AND (m.p0 = $1 OR m.invitee = $1 OR m.invitee IS NULL)
       ORDER BY m.created_at DESC LIMIT 30`,
      [me.discordId],
    ),
    db.query<{ wins: number; losses: number; draws: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE (winner = 0 AND p0 = $1) OR (winner = 1 AND p1 = $1))::int AS wins,
         COUNT(*) FILTER (WHERE (winner = 1 AND p0 = $1) OR (winner = 0 AND p1 = $1))::int AS losses,
         COUNT(*) FILTER (WHERE winner IS NULL)::int AS draws
       FROM duel_matches WHERE mode = 'friendly' AND status = 'finished' AND (p0 = $1 OR p1 = $1)`,
      [me.discordId],
    ),
  ]);
  const summaries = mine.rows.map(r => {
    const { view: _v, warView: _w, gridView: _g, lockedIn: _l, opponentLockedIn: _o, now: _n, ...s } = toPayload(r, seatOf(r, me.discordId));
    return s;
  });
  return {
    active: summaries.filter(s => s.status === 'active'),
    recent: summaries.filter(s => s.status === 'finished').slice(0, 10),
    incoming: open.rows.filter(r => r.p0 !== me.discordId).map(r => ({
      id: r.id,
      ruleset: r.ruleset,
      from: { ign: r.ign ?? 'Unknown', uuid: (r.uuid ?? '').replace(/-/g, '') },
      direct: r.invitee === me.discordId,
      createdAt: r.created_at.toISOString(),
    })),
    outgoing: open.rows.filter(r => r.p0 === me.discordId).map(r => ({
      id: r.id, ruleset: r.ruleset, to: r.invitee_ign, createdAt: r.created_at.toISOString(),
    })),
    record: record.rows[0] ?? { wins: 0, losses: 0, draws: 0 },
  };
}

/** A guild member's Discord id from their in-game name. */
export async function findMember(db: Db, ign: string): Promise<string | null> {
  const { rows } = await db.query<{ discord_id: string }>(
    `SELECT dl.discord_id::text AS discord_id FROM discord_links dl
     WHERE LOWER(dl.ign) = LOWER($1) AND EXISTS (SELECT 1 FROM guild_roster gr WHERE gr.uuid = dl.uuid)
     LIMIT 1`,
    [ign.trim()],
  );
  return rows[0]?.discord_id ?? null;
}
