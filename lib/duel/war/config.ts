// Every number in Three-Front War, in one object, plus the territory list.
//
// WAR is mutable only so the balance lab can try variants in-process (the
// same pattern as RULES in ../rules.ts). The controls the lab runs
// alongside the main rules are knobs here too: lanes 'hard', brace off,
// perks off.

import territories from './territories.json';
import type { Element } from '../types';
import type { Resource, Territory } from './types';

export interface WarConfig {
  towerHp: number;
  /** Towers you must destroy to win. */
  towersToWin: number;
  roundLimit: number;
  startHand: number;
  handMax: number;
  garrison: number;
  /** Emeralds each upkeep, and the most you can bank. */
  income: number;
  bankCap: number;
  /** Cards drawn each upkeep from round 2 on. */
  draw: number;
  /** Emerald cost = ceil(costScale * tide cost), for cards, moves and the tank. */
  costScale: number;
  /** 'soft': a flank reaches the slot opposite and the centre, the centre reaches all. 'hard': opposite only. */
  lanes: 'soft' | 'hard';
  brace: boolean;
  /** Damage a braced unit takes, as a share (rounded down). */
  braceTaken: number;
  perks: boolean;
  perk: { city: number; ore: number; crops: number; fish: number; wood: number };
  /** Action speed by element; higher acts first. Rush acts before any speed. Used when speedMode is 'element'. */
  speed: Record<Element, number>;
  /**
   * 'card': each card has its own speed tier (slow 1, normal 2, fast 3),
   * rolled from its slug, independent of element. A fast unit pays
   * speedHealth of its war health, a slow one gets it back.
   */
  speedMode: 'element' | 'card';
  /** Share of cards rolled fast, and the same share slow. */
  fastShare: number;
  speedHealth: number;
  /**
   * War health = card health x healthMult (and so do unit heals and health
   * buffs). Damage is not scaled, so units take several hits to fall:
   * the Pokémon pacing that makes switching, bracing and speed matter.
   */
  healthMult: number;
  /** War power = card power x powerMult (rounded). With healthMult, sets the pace and how much health-heavy elements gain. */
  powerMult: number;
  /**
   * How fighting reaches towers, beyond hitting an empty slot opposite:
   * 'overflow': damage past a knocked-out defender's health hits its lane's tower;
   * 'chip': whenever a lane's defender takes attack damage, that lane's tower loses `chip`.
   */
  siege: 'none' | 'overflow' | 'chip' | 'both';
  /** A unit move's emerald cost = ceil(moveCostScale x its tide cost). */
  moveCostScale: number;
  /**
   * A unit that uses its move may also attack in the same action. Attacks
   * are free and there is no retaliation, so a move that replaces the
   * attack is almost never worth its emeralds (v1 measurement); this turns
   * moves into what they were in the duel game, a tide (emerald) sink.
   */
  moveAndAttack: boolean;
  chip: number;
  /** At the round limit, after towers destroyed: 'hp' most tower health left, 'damage' most tower damage dealt. */
  limitJudge: 'hp' | 'damage';
  /** Air rework: a unit attacking out of Stealth ignores Guard redirects. */
  stealthStrike: boolean;
  /** Air rework: a slot emptied by a bounce stays open this round; attacks aimed at it hit that lane's tower. */
  bounceOpens: boolean;
  /** Air's tank ability in war: 'scout' (draw, as in the duel) or 'gust' (return an enemy unit costing 3 or less). */
  airTank: 'scout' | 'gust';
  /** Earth's tank ability in war: 'wall' (summon a Stone Wall, as in the duel) or 'fortify' (+2 health to a friendly unit). */
  earthTank: 'wall' | 'fortify';
  /**
   * Which attackers a Guard pulls: 'reach' every attacker that can reach it
   * (v0/v1; a centre Guard then stops both enemy flanks), 'opposite' only the
   * enemy unit in its own lane.
   */
  guard: 'reach' | 'opposite';
  // --- v3 and v3.1 (README "Rules v3.1", "Rules v3", "Experiment log"). v2.1
  // had income 3 and every knob below at 0 / false / 'off' / 'normal' / 1;
  // the ones left there were tried and dropped.
  /** Brace strikes back: a braced unit hit by an attack deals ceil(share x its power) to the attacker. */
  braceCounter: number;
  /** A unit that switches in from the garrison is braced this round. */
  switchBrace: boolean;
  /** A unit that shifts may also attack from its new lane in the same action: true always, 'empty' only when shifting into an empty slot. */
  shiftAttack: boolean | 'empty';
  /** War chest: extra emeralds each upkeep for every tower of yours that has fallen. */
  lostTowerIncome: number;
  /** Emeralds a side gains at once when one of its towers falls (bank cap applies). */
  fallBounty: number;
  /** Retake: hold the front of a lane whose tower you lost at upkeep and it is rebuilt with this much health (0 = never). */
  rebuild: number;
  /** Rebuilds allowed per side per war. */
  rebuildMax: number;
  /** Escalating income: +1 emerald of income every this many rounds (0 = flat). */
  incomeStep: number;
  /** Last stand: when a tower falls, the owner's other standing towers gain this much health (above the cap). */
  lastStand: number;
  /**
   * Initiative only while the gap is at most this (0 = always). Gap = the
   * difference in tower score, each standing tower counting 8 plus its health.
   */
  initiativeMaxGap: number;
  /** Strike-back as a flat amount instead of a share of power (0 = use braceCounter). */
  braceCounterFlat: number;
  /**
   * Brace stance: 'off' the brace lasts this round only (a hidden guess);
   * 'extend' it lasts this round and the next, and the opponent sees it while
   * planning the next; 'next' it takes effect next round only (fully open).
   * A unit loses its stance when it switches out or shifts.
   */
  braceStance: 'off' | 'extend' | 'next';
  /** When a shift's attack resolves: 'normal' at the unit's speed, 'last' after every other action. */
  shiftAttackTiming: 'normal' | 'last';
  /** Power share of an attack made after a shift (rounded down, at least 1). */
  shiftAttackPower: number;
  /** Initiative: the side behind on towers wins speed ties and deploys first. true: fewer standing, then less tower health; 'fallen': only fewer standing. */
  underdogInitiative: boolean | 'fallen';
}

export const WAR: WarConfig = {
  towerHp: 6,
  towersToWin: 2,
  roundLimit: 16,
  startHand: 5,
  handMax: 8,
  garrison: 2,
  income: 2,
  bankCap: 8,
  draw: 1,
  costScale: 0.6,
  lanes: 'soft',
  brace: true,
  braceTaken: 0.5,
  perks: true,
  perk: { city: 1, ore: 1, crops: 2, fish: 1, wood: 2 },
  speed: { air: 4, thunder: 3, fire: 2, water: 2, earth: 1 },
  speedMode: 'card',
  fastShare: 0.25,
  speedHealth: 2,
  healthMult: 1.5,
  powerMult: 1,
  siege: 'chip',
  moveCostScale: 0.6,
  moveAndAttack: true,
  limitJudge: 'damage',
  stealthStrike: true,
  bounceOpens: true,
  airTank: 'gust',
  earthTank: 'wall',
  guard: 'opposite',
  chip: 1,
  braceCounter: 0,
  switchBrace: true,
  shiftAttack: 'empty',
  lostTowerIncome: 0,
  fallBounty: 0,
  rebuild: 4,
  rebuildMax: 1,
  incomeStep: 2,
  lastStand: 0,
  underdogInitiative: 'fallen',
  initiativeMaxGap: 0,
  braceCounterFlat: 1,
  braceStance: 'extend',
  shiftAttackTiming: 'last',
  shiftAttackPower: 0.5,
};

/** war-3.2: the v3.1 rules, with live games on the war prices (cards.ts) instead of the duel's. */
export const WAR_RULES_VERSION = 'war-3.2';

/** Friendly wars: seconds to lock in a round's plan (the mulligan uses MULLIGAN_SECONDS). */
export const WAR_ROUND_SECONDS = 60;

export function emeraldCost(tide: number): number {
  return Math.ceil(WAR.costScale * tide - 1e-9);
}

/** What a unit's move costs in emeralds. */
export function moveCost(tide: number): number {
  return Math.ceil(WAR.moveCostScale * tide - 1e-9);
}

// --- Territories -------------------------------------------------------------
//
// From the real map, public/territories_verbose.json, reduced to what the
// game uses (territories.json; `node scripts/duel-lab.mjs territories`
// regenerates it). A territory's perk is its largest resource; a city is
// one making 18,000 emeralds. Territories with no resources listed, or with
// all four equal (the small "rainbow" ones), have no single identity and
// are left out of the draw.

export const TERRITORIES: Territory[] = territories as Territory[];

/** territories_verbose.json -> territories.json rows. */
export function reduceTerritories(raw: Record<string, { resources?: Record<string, string> }>): Territory[] {
  return Object.entries(raw).flatMap(([name, t]) => {
    const r = t.resources;
    if (!r) return [];
    const res = (['ore', 'crops', 'fish', 'wood'] as Resource[]).map(k => [k, Number(r[k] ?? 0)] as const).sort((a, b) => b[1] - a[1]);
    if (!res[0][1] || res[0][1] === res[1][1]) return [];
    return [{ name, city: Number(r.emeralds ?? 0) >= 18000, resource: res[0][0] }];
  });
}
