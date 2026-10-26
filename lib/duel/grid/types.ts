// Warfront: plain-data types. A GridState round-trips JSON like the duel's
// GameState and the war's WarState, so it lives in duel_matches.state
// unchanged. Cards, elements and keywords are the duel game's.
//
// Tiles are numbered row by row: tile = y * width + x. Row 0 is side 1's
// back row, row height-1 is side 0's.

import type { CardDef, CardInst, Element, Keyword, Side } from '../types';
import type { Resource } from '../war/types';
import type { GridConfig } from './config';

export type { Side } from '../types';
export type { Resource } from '../war/types';

export type Terrain = 'plain' | 'mountain' | 'water';

export interface GridNode {
  tile: number;
  /** A real Wynncraft territory (war/territories.json). */
  name: string;
  city: boolean;
  resource: Resource | null;
  /** Who holds it: set when a side ends its own turn on it with no enemy adjacent. */
  owner: Side | null;
}

export interface GridUnit {
  uid: string;
  slug: string;
  side: Side;
  /** The card's element, which sets how it moves. */
  element: Element;
  tile: number;
  power: number;
  health: number;
  maxHealth: number;
  /** Treat as immutable: replaced, never pushed to, so simulation copies can share it. */
  keywords: Keyword[];
  /** Movement range adjustment from the card's speed: -1 slow, 0 normal, +1 fast. */
  speed: -1 | 0 | 1;
  shield: boolean;
  stealth: boolean;
  /** Cannot act (or strike back) while state.turn <= frozenUntil. */
  frozenUntil: number;
  /** Has used its order this turn. */
  acted: boolean;
  /** Arrived this turn (cannot act unless it has Rush). */
  fresh: boolean;
  /** Braced: takes reduced damage while state.turn <= bracedUntil. Public. */
  bracedUntil: number;
  /** The brace is the free end-of-turn stance (GRID.autoBraceTaken applies, not braceTaken). */
  stance?: boolean;
  /** Extra health from standing next to its own HQ (GRID.hqAura), already counted in health and maxHealth. */
  aura: number;
  /** Extra power this turn only (the ore perk). */
  boost: number;
  /** Used its move ability this turn (GRID.abilityAttack keeps its order open after it). */
  usedAbility?: boolean;
  /** Attacked or used its ability this turn (only tracked for GRID.autoBrace 'passive'). */
  fought?: boolean;
}

export interface GridPlayer {
  name: string;
  avatar: string;
  tank: Element;
  /** HQ health; 0 or less loses. */
  hp: number;
  emeralds: number;
  deck: CardInst[];
  hand: CardInst[];
  graveyard: string[];
  mulliganed: boolean;
  /** Used its once-a-game last stand (GRID.lastStand). */
  stood?: boolean;
  /** Territory score (GRID.scoreTarget; rules v3). Absent in games without it: read it as 0. */
  score?: number;
  /** Missed turns in a row (three forfeits). */
  timeouts: number;
}

/** 'score': a side reached the territory score target (GRID.scoreTarget). */
export type GridEndReason = 'hq' | 'score' | 'turn_limit' | 'concede' | 'timeout';

/** A rotating objective (GRID.objectiveEvery): this node scores extra from player-turn `from` through `until`. */
export interface GridObjective {
  tile: number;
  name: string;
  from: number;
  until: number;
}

/** What an HQ was hit by, or who took damage: a unit (uid) or an HQ (side). */
export type HitRef = { unit: string } | { hq: Side };

export type GridEvent =
  | { k: 'start'; first: Side; layout: string }
  | { k: 'turn'; side: Side; turn: number; orders: number }
  /** n = base + nodes (+ city perks), capped by the bank. */
  | { k: 'income'; side: Side; n: number; base: number; nodes: number; city: number }
  | { k: 'draw'; side: Side; n: number }
  | { k: 'burn'; side: Side; slug: string }
  | { k: 'perk'; side: Side; tile: number; perk: Resource | 'city'; uid?: string }
  /** The HQ fires at the start of its owner's turn. A damage event follows. */
  | { k: 'hqfire'; side: Side; target: string; tile: number }
  /** ready: a reinforcement (GRID.reinforceReady) that may act this turn. */
  | { k: 'deploy'; side: Side; uid: string; slug: string; tile: number; forward: boolean; ready?: boolean }
  | { k: 'summon'; side: Side; uid: string; slug: string; tile: number }
  /** path: every tile entered, in order, ending at `to` (air: just the landing tile). stopped: a Guard's zone of control ended it. */
  | { k: 'move'; side: Side; uid: string; from: number; to: number; path: number[]; stopped?: boolean }
  /** An attack; damage (and retaliation, pierce) events follow. flank: bonus damage from allies next to the target. */
  | { k: 'attack'; side: Side; uid: string; from: number; tile: number; target: HitRef; ranged: boolean; flank: number }
  /** A melee defender that survived hits its attacker back; a damage event follows. */
  | { k: 'retaliate'; uid: string; target: string }
  /** A Pierce attack also hits what stands behind its target; a damage event follows. */
  | { k: 'pierce'; uid: string; tile: number }
  /**
   * hp: health right after the hit. armour: HQ armour that soaked part of it
   * (n is what got through). braced: halved by a brace.
   */
  | { k: 'damage'; target: HitRef; tile: number; n: number; hp: number; armour?: number; braced?: boolean }
  | { k: 'heal'; target: HitRef; tile: number; n: number; hp: number }
  | { k: 'shield'; uid: string }
  | { k: 'freeze'; uid: string; until: number }
  | { k: 'bounce'; uid: string; slug: string; tile: number }
  | { k: 'reveal'; uid: string }
  /** auto: the free end-of-turn stance (GRID.autoBrace), not an order. */
  | { k: 'brace'; uid: string; until: number; auto?: boolean }
  /**
   * A setback (GRID.setbackOn) at the start of `side`'s turn: the enemy's last
   * turn cost it a connected node or HQ health, so this turn it gets extra
   * orders and emeralds (already in the turn and income events) and cheaper deploys.
   */
  | { k: 'setback'; side: Side; reason: 'node' | 'hq'; orders: number; emeralds: number; discount: number }
  /** A unit's move ability (card text "Move"). */
  | { k: 'ability'; side: Side; uid: string; name: string; target?: number }
  /** The tank (HQ) ability. */
  | { k: 'hq'; side: Side; name: string; target?: number }
  | { k: 'death'; side: Side; uid: string; slug: string; tile: number; captured?: boolean }
  /** A node changed hands at the end of `side`'s turn. */
  | { k: 'claim'; side: Side; tile: number; name: string; from: Side | null }
  /** The set of a side's nodes connected to its HQ changed (tiles, sorted). */
  | { k: 'connection'; side: Side; nodes: number[] }
  /** The once-a-game last stand (GRID.lastStand): the HQ is repaired to hp. */
  | { k: 'laststand'; side: Side; n: number; hp: number }
  /**
   * Territory score (GRID.scoreTarget). At the start of `side`'s turn (or its
   * end, GRID.scoreWhen) each scoring node adds its points; nodes lists them
   * (objective: that node is the rotating objective and its bonus is in n).
   * hq: points for damage on the enemy HQ (GRID.scoreHq) instead, with no
   * nodes. total is the side's score after.
   */
  | { k: 'score'; side: Side; n: number; total: number; nodes: { tile: number; n: number; objective?: boolean }[]; hq?: boolean }
  /**
   * The rotating objective (GRID.objectiveEvery). announced: the next one is
   * named now and starts on player-turn `from`; otherwise it starts now.
   */
  | { k: 'objective'; tile: number; name: string; from: number; until: number; announced?: boolean }
  | { k: 'end_turn'; side: Side; turn: number }
  | { k: 'end'; winner: Side | null; reason: GridEndReason };

export type GridAction =
  | { type: 'mulligan'; replace: string[] }
  /** Put a hand card on a deploy tile (costs emeralds, not an order). */
  | { type: 'deploy'; uid: string; tile: number; target?: number }
  /** Start (and use up) a unit's order by moving it; it may then attack, use its ability or brace. */
  | { type: 'move'; uid: string; to: number }
  /** Attack a tile holding an enemy unit or the enemy HQ. Ends the unit's order. */
  | { type: 'attack'; uid: string; target: number }
  /** The unit's move ability, instead of attacking. Ends the unit's order. */
  | { type: 'ability'; uid: string; target?: number }
  | { type: 'brace'; uid: string }
  /** The tank (HQ) ability: once a turn, one order and its emerald cost. */
  | { type: 'hq'; target?: number }
  | { type: 'end_turn' }
  | { type: 'concede' }
  /** System action: the active player's clock ran out. */
  | { type: 'timeout' };

export interface GridState {
  rules: string;
  rng: number;
  phase: 'mulligan' | 'main' | 'over';
  /** Player-turns so far (1 = the first player's first turn). */
  turn: number;
  active: Side;
  first: Side;
  width: number;
  height: number;
  layout: string;
  terrain: Terrain[];
  nodes: GridNode[];
  /** HQ tile per side. */
  hq: [number, number];
  players: [GridPlayer, GridPlayer];
  units: GridUnit[];
  /** Orders the active side has left this turn. */
  ordersLeft: number;
  /** The unit that has moved and may still attack, use its ability or brace. */
  pending: string | null;
  /** The HQ ability has been used this turn. */
  hqUsed: boolean;
  winner: Side | null;
  endReason: GridEndReason | null;
  nextUid: number;
  log: GridEvent[];
  logBase: number;
  extraDefs?: Record<string, CardDef>;
  /** The rules this game plays under when they differ from GRID (a size preset). Public: the view carries it. */
  cfg?: GridConfig;
  /** Each side's connected nodes and HQ health when it last ended a turn (for setbacks). */
  marks?: [{ nodes: number; hp: number } | null, { nodes: number; hp: number } | null];
  /** The rotating objective now, and the next one once announced (GRID.objectiveEvery). Public. */
  objective?: GridObjective | null;
  nextObjective?: GridObjective | null;
  /** The active side is on a setback this turn (cheaper deploys). */
  setback?: boolean;
  /** Simulation copies (the bot's lookahead) skip the log. */
  quiet?: boolean;
}

export type { CardDef, Element, Keyword };
