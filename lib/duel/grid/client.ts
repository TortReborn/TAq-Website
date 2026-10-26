// Everything a Warfront board screen needs, in one browser-safe import (no
// pg, crypto or fs anywhere below). Every helper takes the player's GridView
// directly (it satisfies GridBoard and GridPlay), so the browser offers
// exactly the moves the server will accept.
//
// The contract, in short (README.md here, "Server and client"):
//   - Tiles are numbers: tile = y * width + x; row 0 is side 1's back row.
//   - A turn is a series of GridActions POSTed one at a time: deploy (free of
//     orders), move then optionally attack / ability / brace (one order per
//     unit), hq (one order), end_turn. unitOrders() and deployOptions() list
//     what is legal now; previewAttack() says what an attack would do.
//   - The log (view.log, from view.logBase) replays a turn step by step:
//     GridEvent in types.ts.

import {
  armourGrown, armouredDamage, atUnitCap, attackTargets, behind, canStartOrder, connectedNodes, deployTiles, distance, flankBonus, gridDef,
  gridHealth, gridSpeed, hqArmour, hqSideAt, isAdjacent, isBraced, isFrozen, isRanged, moveOptions, moveRange, neighbours, network,
  nodeAt, nodeScore, onEnemyHalf, other, braceShare, outnumberedBonus, reinforced, rulesOf, scoreOf, scoreRate, scoring, scoringNodes, tileOf, tileXY, unitAt, unitById, GridError,
  type AttackTarget, type GridBoard, type MoveOption,
} from './board';
import { GRID, GRID_PRESETS, gridRulesFor, GRID_RULES_VERSION, GRID_TURN_SECONDS, gridEmeraldCost, gridMoveCost, type GridConfig } from './config';
import {
  abilityCost, braceCost, cardCost, deployActions, deployDiscount, gridHqAbility, hqFirePower, legalGridActions, moveOf, ownTurns, playOf, setbackOf, specTiles,
  type GridPlay, type GridPlaySide,
} from './engine';
import { LAYOUTS } from './layouts';
import type { GridAction, GridUnit, Side } from './types';
import type { GridView } from './view';
import { MULLIGAN_SECONDS } from '../rules';
import { gridHqText, gridScoreText } from './text';

export {
  armourGrown, armouredDamage, atUnitCap, attackTargets, behind, canStartOrder, connectedNodes, deployTiles, distance, flankBonus, gridDef,
  gridHealth, gridSpeed, hqArmour, hqSideAt, isAdjacent, isBraced, isFrozen, isRanged, moveOptions, moveRange, neighbours, network,
  nodeAt, nodeScore, onEnemyHalf, other, braceShare, outnumberedBonus, reinforced, rulesOf, scoreOf, scoreRate, scoring, scoringNodes, tileOf, tileXY, unitAt, unitById, GridError,
  type AttackTarget, type GridBoard, type MoveOption,
};
export { gridCard, gridCards } from './cards';
export { GRID, GRID_PRESETS, gridRulesFor, GRID_RULES_VERSION, GRID_TURN_SECONDS, gridEmeraldCost, gridMoveCost, LAYOUTS, type GridConfig };
export { abilityCost, braceCost, cardCost, deployActions, deployDiscount, gridHqAbility, hqFirePower, legalGridActions, moveOf, ownTurns, playOf, setbackOf, specTiles, type GridPlay, type GridPlaySide };
export {
  gridBraceText, gridCardMoveText, gridCombatText, gridComebackText, gridHqText, gridKeywordText, gridMoveText, gridNodeValues, gridScoreText, gridTankText, gridTerrainText, gridTurnText,
} from './text';
export { type GridView, type GridPlayerView } from './view';
export * from './types';

/** Is it your turn to act (the mulligan counts)? */
export function isYourTurn(v: GridView): boolean {
  if (v.phase === 'mulligan') return !v.players[v.you].mulliganed;
  return v.phase === 'main' && v.active === v.you;
}

export interface UnitOrders {
  uid: string;
  /** It can start an order now (your turn, orders left, not acted, not frozen, not just arrived unless Rush). */
  canAct: boolean;
  /** It has moved this turn and may still attack, use its ability or brace. */
  pending: boolean;
  /** Where it can move this order, with paths (empty when pending). */
  moves: MoveOption[];
  /** What it can attack from where it stands now. */
  attacks: AttackTarget[];
  /** Its move ability, if it has one: cost, whether you can pay, and legal targets (tiles; empty = untargeted). used: already used this turn. */
  ability: { name: string; cost: number; affordable: boolean; targets: number[]; targeted: boolean; used: boolean } | null;
  canBrace: boolean;
}

/** What one of your units can do right now. */
export function unitOrders(v: GridView, uid: string): UnitOrders | null {
  const u = unitById(v, uid);
  if (!u || u.side !== v.you) return null;
  const mine = v.phase === 'main' && v.active === v.you;
  const pending = mine && v.pending === uid;
  const canAct = mine && canStartOrder(v, u) && v.ordersLeft >= 1;
  const g = rulesOf(v);
  const def = gridDef(u.slug, v.extraDefs);
  const m = moveOf(def);
  const cost = m ? abilityCost(def, g) : 0;
  const live = pending || canAct;
  return {
    uid,
    canAct,
    pending,
    moves: canAct ? moveOptions(v, u) : [],
    attacks: live ? attackTargets(v, u, u.tile) : [],
    ability: m ? {
      name: m.name ?? 'Move', cost, affordable: v.players[v.you].emeralds >= cost,
      targets: live && m.target && !u.usedAbility ? specTiles(v, v.you, m.target, u.tile, u.uid) : [], targeted: !!m.target, used: !!u.usedAbility,
    } : null,
    canBrace: pending || (mine && canStartOrder(v, u) && v.ordersLeft >= braceCost(g)),
  };
}

/** What a unit could attack if it stood on `from` (for highlighting before a move is made). */
export function attacksFrom(v: GridView, uid: string, from: number): AttackTarget[] {
  const u = unitById(v, uid);
  return u ? attackTargets(v, u, from) : [];
}

export interface AttackPreview {
  /** Damage to the target (after flank, brace, shield and HQ armour). */
  damage: number;
  flank: number;
  /** HQ armour soaking part of the hit. */
  armour: number;
  kills: boolean;
  /** Damage struck back at the attacker (0 for Ranged, or if the target dies). */
  strikeBack: number;
  /** A Pierce attack's second target: the tile behind and what it takes. */
  pierce: { tile: number; damage: number } | null;
}

/** What an attack by `uid` on `target` would do, from where it stands (deterministic: no random effects). */
export function previewAttack(v: GridView, uid: string, target: number): AttackPreview | null {
  const u = unitById(v, uid);
  if (!u) return null;
  const g = rulesOf(v);
  const t = attackTargets(v, u, u.tile).find(x => x.tile === target);
  if (!t) return null;
  const flank = flankBonus(v, u.side, u.uid, target);
  const hit = u.power + u.boost + flank + outnumberedBonus(v, u.side);
  let damage = hit, armour = 0, kills = false, strikeBack = 0;
  if (t.hq !== undefined) {
    damage = armouredDamage(v, t.hq, hit);
    armour = hit - damage;
    kills = damage >= v.players[t.hq].hp;
  } else {
    const d = unitById(v, t.unit!)!;
    damage = d.shield ? 0 : isBraced(v, d) ? Math.floor(hit * braceShare(v, d)) : hit;
    kills = damage >= d.health;
    if (!kills && g.retaliation && !isRanged(u) && !isRanged(d) && d.power > 0 && !isFrozen(v, d)) strikeBack = u.shield ? 0 : isBraced(v, u) ? Math.floor(d.power * braceShare(v, u)) : d.power;
  }
  let pierce: AttackPreview['pierce'] = null;
  if (u.keywords.includes('pierce') && g.pierceShare > 0) {
    const b = behind(v, u.tile, target);
    const w = b >= 0 ? v.units.find(x => x.tile === b && x.side !== u.side && !x.stealth) : undefined;
    const h = b >= 0 ? hqSideAt(v, b) : null;
    const n = Math.max(1, Math.ceil((u.power + u.boost + outnumberedBonus(v, u.side)) * g.pierceShare - 1e-9));
    if (w) pierce = { tile: b, damage: w.shield ? 0 : isBraced(v, w) ? Math.floor(n * braceShare(v, w)) : n };
    else if (h !== null && h !== u.side) pierce = { tile: b, damage: armouredDamage(v, h, n) };
  }
  return { damage, flank, armour, kills, strikeBack, pierce };
}

export interface DeployOption {
  uid: string;
  slug: string;
  cost: number;
  affordable: boolean;
  /** Tiles it may go on now; forward = next to a connected node. */
  tiles: { tile: number; forward: boolean }[];
  /** Its on-play ability's target spec, if any; list targets for a chosen tile with deployTargets(). */
  targeted: boolean;
}

/** Each card in your hand: what it costs and where it can go. */
export function deployOptions(v: GridView): DeployOption[] {
  const me = v.players[v.you];
  const mine = v.phase === 'main' && v.active === v.you;
  const tiles = mine ? deployTiles(v, v.you) : [];
  return (me.hand ?? []).map(h => {
    const def = gridDef(h.slug, v.extraDefs);
    const cost = cardCost(v, h.slug, v.you);
    return { uid: h.uid, slug: h.slug, cost, affordable: cost <= me.emeralds, tiles: cost <= me.emeralds ? tiles : [], targeted: !!playOf(def)?.target };
  });
}

/** Legal targets for a hand card's on-play ability if deployed on `tile` (empty: none needed, or none exist). */
export function deployTargets(v: GridView, uid: string, tile: number): number[] {
  const h = v.players[v.you].hand?.find(x => x.uid === uid);
  const a = h ? playOf(gridDef(h.slug, v.extraDefs)) : undefined;
  return a?.target ? specTiles(v, v.you, a.target, tile) : [];
}

/** The tank (HQ) ability now: cost, whether it can be used, and legal targets. */
export function hqOptions(v: GridView): { name: string; cost: number; usable: boolean; targets: number[]; targeted: boolean } {
  const me = v.players[v.you];
  const a = gridHqAbility(me, rulesOf(v));
  const mine = v.phase === 'main' && v.active === v.you;
  const usable = mine && !v.hqUsed && v.ordersLeft >= 1 && me.emeralds >= (a.cost ?? 0);
  return { name: a.name ?? 'HQ', cost: a.cost ?? 0, usable, targets: usable && a.target ? specTiles(v, v.you, a.target, v.hq[v.you]) : [], targeted: !!a.target };
}

/**
 * Both sides' networks: tiles linked to each HQ, connected nodes, HQ armour
 * (nodes plus what it has grown) and what the HQ fires for. With the
 * territory score: the score, the target, and the nodes that would score
 * now with their points (rate is their sum).
 */
export function connection(v: Pick<GridView, keyof GridBoard | 'players'>) {
  const g = rulesOf(v);
  return ([0, 1] as Side[]).map(side => {
    const n = network(v as GridBoard, side);
    const grown = armourGrown(v, side);
    const scores = scoringNodes(v as GridBoard, side);
    return {
      side, tiles: [...n.tiles].sort((a, b) => a - b), nodes: n.nodes, armour: g.armourPerNode * n.nodes.length + grown, grown, hqFire: hqFirePower(v.players[side].hp, g),
      score: scoreOf(v.players[side]), target: g.scoreTarget, scoring: scores, rate: scores.reduce((a, x) => a + x.n, 0),
    };
  }) as [ConnectionInfo, ConnectionInfo];
}
export interface ConnectionInfo {
  side: Side; tiles: number[]; nodes: number[]; armour: number; hqFire: number;
  /** Armour grown from damage taken (GRID.armourGrowth), included in armour. */
  grown: number;
  /** Territory score (0 and target 0 when the score is off). */
  score: number; target: number;
  /** Nodes that would score for this side now, with their points; rate is their sum. */
  scoring: { tile: number; n: number; objective?: boolean }[]; rate: number;
}

/** Every legal action for you now (the UI can use unitOrders/deployOptions instead; this is the flat list the server checks against). */
export function legalActions(v: GridView): GridAction[] {
  return legalGridActions(v, v.you);
}

/** A unit's movement line for its card (pass the view for a game with its own preset). */
export function unitMoveRange(u: Pick<GridUnit, 'element' | 'speed'>, v?: Pick<GridView, 'cfg'>): number {
  return moveRange(u.element, u.speed, rulesOf(v));
}

/**
 * The numbers a rules page shows. With no argument: the 7x7 rules (GRID);
 * with a size, that size's preset; with a view, the game's own rules.
 */
export function gridGuide(of?: 5 | 7 | Pick<GridView, 'cfg'>) {
  const g = of === undefined ? GRID : typeof of === 'number' ? gridRulesFor(of) : rulesOf(of);
  return {
    ...structuredClone(g),
    rules: GRID_RULES_VERSION,
    turnSeconds: GRID_TURN_SECONDS,
    mulliganSeconds: MULLIGAN_SECONDS,
    layouts: { 7: LAYOUTS[7].map(l => l.name), 5: LAYOUTS[5].map(l => l.name) },
    /** The territory score, objective and HQ rules as a player reads them (empty score lines when the score is off). */
    scoreText: gridScoreText(g),
    hqText: gridHqText(g),
  };
}

export { tileOf as tileAt };
