// Three-Front War: plain-data types. A WarState round-trips JSON, like the
// duel GameState, so it could live in a database row unchanged.
//
// A prototype ruleset, run only by the balance lab for now (README.md in
// this directory). Cards, elements and keywords are the duel game's.

import type { CardDef, CardInst, Effect, Element, Keyword, Side } from '../types';

export type { Side } from '../types';

/** 0 = left, 1 = centre, 2 = right. */
export type Lane = 0 | 1 | 2;
export const LANES: Lane[] = [0, 1, 2];

export type Resource = 'ore' | 'crops' | 'fish' | 'wood';

export interface Territory {
  name: string;
  /** 18,000 emeralds an hour in the real game: a city. */
  city: boolean;
  /** The territory's main resource, if it has one. */
  resource: Resource | null;
}

export interface WarUnit {
  uid: string;
  slug: string;
  power: number;
  health: number;
  maxHealth: number;
  keywords: Keyword[];
  speed: number;
  shield: boolean;
  stealth: boolean;
  /** The round in which this unit loses its action (0 = none). */
  frozenRound: number;
  /** Extra attack power this round only (the ore perk). */
  boost: number;
  /** Brace stance (WAR.braceStance): braced through this round number. Public. */
  bracedUntil?: number;
}

/** A slot on the board. With an empty slot, some effects fall through to that lane's tower. */
export interface SlotRef { side: Side; lane: Lane }

export type Order =
  | { k: 'attack'; target: SlotRef }
  /** attack: with WAR.moveAndAttack, the unit also attacks this slot after its move. */
  | { k: 'move'; target?: SlotRef; attack?: SlotRef }
  | { k: 'brace' }
  | { k: 'switch'; garrison: number }
  /** attack: with WAR.shiftAttack, the unit also attacks this slot from its new lane. */
  | { k: 'shift'; dir: -1 | 1; attack?: SlotRef };

export type OrderKind = Order['k'];

export interface Deploy {
  /** Hand card uid. */
  uid: string;
  /** A lane's empty active slot, or 'garrison'. */
  to: Lane | 'garrison';
  /** Target of the card's on-play effect, if it has one. */
  target?: SlotRef;
}

/** One side's secret plan for a round. */
export interface Plan {
  /** One order (or none) for the unit in each active slot at planning time. */
  orders: (Order | null)[];
  deploys: Deploy[];
  /** The tank's (HQ) ability, at most once a round. */
  hq?: { target?: SlotRef } | null;
}

export interface WarPlayer {
  name: string;
  avatar: string;
  tank: Element;
  /** Tower health per lane; 0 or less is destroyed. */
  towers: number[];
  emeralds: number;
  deck: CardInst[];
  hand: CardInst[];
  active: (WarUnit | null)[];
  garrison: WarUnit[];
  graveyard: string[];
  mulliganed: boolean;
  timeouts: number;
  /** The submitted, still secret plan for this round. */
  plan: Plan | null;
  /** Tower health this side has lost in total (repairs do not refund it). */
  towerLost: number;
  /** Towers this side has rebuilt (WAR.rebuild). */
  rebuilds?: number;
}

export type WarEvent =
  | { k: 'round'; round: number }
  /** chest: the part of n that came from towers lost (WAR.lostTowerIncome). */
  | { k: 'income'; side: Side; n: number; perk: boolean; chest?: number }
  | { k: 'perk'; side: Side; lane: Lane; perk: Resource | 'city' }
  | { k: 'draw'; side: Side; n: number }
  | { k: 'burn'; side: Side; slug: string }
  | { k: 'deploy'; side: Side; slug: string; uid: string; to: Lane | 'garrison' }
  | { k: 'switch'; side: Side; lane: Lane; out: string; in: string }
  | { k: 'shift'; side: Side; from: Lane; to: Lane }
  /** until: a stance (WAR.braceStance) that holds through that round, visible to both sides. */
  | { k: 'brace'; uid: string; until?: number }
  /**
   * from: the attacker's lane. target: the slot finally hit (after any Guard
   * redirect). swapped: the unit hit is not the one that stood there when
   * orders were given (a switch, shift or deploy changed it).
   */
  | {
    k: 'attack'; side: Side; uid: string; from: Lane; target: SlotRef; hit: 'unit' | 'tower' | 'fizzle'; swapped?: boolean;
    /** The slot the order named, when a Guard pulled the attack elsewhere. */
    aimed?: SlotRef; redirected?: boolean;
  }
  | { k: 'move'; side: Side; uid: string; name: string; from: Lane; target?: SlotRef }
  | { k: 'hq'; side: Side; name: string; target?: SlotRef }
  /** hp: health (unit or tower) right after the hit. braced: halved by a brace. uid: the unit hit. */
  | { k: 'damage'; target: SlotRef; tower: boolean; n: number; hp: number; uid?: string; braced?: boolean }
  | { k: 'heal'; target: SlotRef; tower: boolean; n: number; hp: number }
  | { k: 'shield'; uid: string }
  | { k: 'freeze'; uid: string }
  | { k: 'bounce'; uid: string; slug: string }
  | { k: 'death'; side: Side; slug: string; uid: string; lane: Lane }
  | { k: 'tower'; side: Side; lane: Lane }
  /** A braced unit (uid) strikes back at the attacker standing in `target`; a damage event follows. */
  | { k: 'counter'; uid: string; target: SlotRef }
  /** A fallen tower rebuilt by holding its lane (WAR.rebuild). */
  | { k: 'rebuild'; side: Side; lane: Lane; hp: number }
  /** A side's tower fell: it gains n emeralds (WAR.fallBounty). */
  | { k: 'bounty'; side: Side; n: number }
  /** A side's tower fell: its other towers gain n health (WAR.lastStand). */
  | { k: 'laststand'; side: Side; n: number }
  /** A round finished resolving (the next round's upkeep events follow). */
  | { k: 'resolved'; round: number }
  | { k: 'end'; winner: Side | null; reason: WarEndReason };

export type WarEndReason = 'towers' | 'round_limit' | 'concede' | 'timeout';

export type WarAction =
  | { type: 'mulligan'; replace: string[] }
  | { type: 'plan'; plan: Plan }
  | { type: 'concede' }
  /** System action: the clock ran out; anyone without a plan passes. */
  | { type: 'timeout' };

export interface WarState {
  rules: string;
  rng: number;
  phase: 'mulligan' | 'plan' | 'over';
  round: number;
  territories: Territory[];
  players: [WarPlayer, WarPlayer];
  winner: Side | null;
  endReason: WarEndReason | null;
  nextUid: number;
  log: WarEvent[];
  logBase: number;
  extraDefs?: Record<string, CardDef>;
  /** Simulation copies (the bot's lookahead) skip the log. */
  quiet?: boolean;
}

export type { CardDef, Effect, Element };
