// Pieces the Warfront board, its replay and its guide share. Every number
// comes from GRID or the grid text exports (lib/duel/grid/client.ts), so the
// words track the rules as they are tuned.

import { Coins, Fish, Pickaxe, Trees, Wheat } from 'lucide-react';
import { abilityText } from '@/lib/duel/text';
import type { Ability } from '@/lib/duel/types';
import {
  abilityCost, GRID, gridHealth, gridKeywordText, gridMoveText, gridSpeed, moveRange,
  type CardDef, type GridConfig, type GridNode, type GridUnit, type GridView, type Resource, type Side,
} from '@/lib/duel/grid/client';
import type { CardRules } from './CardFace';

/**
 * How cards read on a Warfront board, under a game's rules: emerald prices,
 * grid health, movement range for the speed tag and the grid keyword text.
 * Card defs must come from gridCard / gridDef.
 */
export function gridCardRules(g: GridConfig = GRID): CardRules {
  return {
  cost: d => Math.ceil(g.costScale * d.cost - 1e-9),
  costLabel: 'Emerald cost',
  costEmerald: true,
  power: d => d.power,
  health: d => gridHealth(d, g),
  speed: d => gridSpeed(d, g) + 2,
  speedTag: d => {
    const sp = gridSpeed(d, g);
    return { text: String(moveRange(d.element, sp, g)), title: `${speedWord(sp)}: ${gridMoveText(d.element, sp, g)}` };
  },
  keywordText: kw => gridKeywordText(kw, g),
  abilityLabel: (a: Ability) => {
    if (a.when === 'move') {
      const cost = Math.ceil(g.moveCostScale * (a.cost ?? 0) - 1e-9);
      return `Order (${cost} emerald${cost === 1 ? '' : 's'})`;
    }
    return a.when === 'play' ? 'On deploy' : a.when === 'turn_start' ? 'Each turn' : abilityText(a).label;
  },
  };
}

/** The 7x7 rules' card reading (the guide and the lobby). */
export const GRID_CARD_RULES: CardRules = gridCardRules(GRID);

const GRID_DEFAULT = GRID;

export const PERK_ICON: Record<Resource | 'city', typeof Coins> = { city: Coins, ore: Pickaxe, crops: Wheat, fish: Fish, wood: Trees };

/** What a connected node gives, in the config's numbers (every node also gives income and armour). */
export function nodePerkText(n: Pick<GridNode, 'city' | 'resource'>, GRID: GridConfig = GRID_DEFAULT): string {
  const parts: string[] = [];
  if (!GRID.perks) return '';
  if (n.city && GRID.perk.city) parts.push(`+${GRID.perk.city} emerald`);
  if (n.resource === 'ore' && GRID.perk.ore) parts.push(`+${GRID.perk.ore} power to your unit on it`);
  if (n.resource === 'crops' && GRID.perk.crops) parts.push(`heals your unit on it ${GRID.perk.crops}`);
  if (n.resource === 'fish' && GRID.perk.fish) parts.push(`draw ${GRID.perk.fish} every ${GRID.fishEvery === 1 ? 'turn' : `${GRID.fishEvery} turns`}`);
  if (n.resource === 'wood' && GRID.perk.wood && GRID.hqHealShare > 0) parts.push(`repairs your HQ ${GRID.perk.wood}`);
  return parts.join(', ');
}

/** Everything a connected node gives, in one line. */
export function nodeGivesText(n: Pick<GridNode, 'city' | 'resource'>, GRID: GridConfig = GRID_DEFAULT): string {
  const perk = nodePerkText(n, GRID);
  const parts: string[] = [];
  if (GRID.scoreTarget > 0) {
    const pts = n.city ? GRID.scoreCity : GRID.scoreNode;
    parts.push(`${pts} point${pts === 1 ? '' : 's'} a turn${!n.city && GRID.scoreFar !== GRID.scoreNode ? ` (${GRID.scoreFar} on the enemy's half)` : ''}`);
  }
  if (GRID.nodeIncome > 0) parts.push(`+${GRID.nodeIncome} emerald a turn`);
  if (GRID.armourPerNode > 0) parts.push(`+${GRID.armourPerNode} HQ armour`);
  parts.push('forward deploys');
  if (perk) parts.push(perk);
  return parts.join(', ');
}

export const RESOURCE_NAME: Record<Resource, string> = { ore: 'Ore', crops: 'Crops', fish: 'Fish', wood: 'Wood' };

/** Movement range and the speed word, for a unit or a card. */
export function speedWord(sp: number): string {
  return sp > 0 ? 'Fast' : sp < 0 ? 'Slow' : 'Normal';
}

export function unitRange(u: Pick<GridUnit, 'element' | 'speed'>, g: GridConfig = GRID): number {
  return moveRange(u.element, u.speed, g);
}

/** A unit's move-ability cost, from its card. */
export function unitAbilityCost(def: CardDef, g: GridConfig = GRID): number {
  return abilityCost(def, g);
}

// --- Orientation ---------------------------------------------------------------
//
// The player's own side is always drawn at the bottom. Side 0's back row is
// the bottom row of the state already; side 1 sees the board turned 180
// degrees (the layouts are point-symmetric, so it looks the same).

export interface Orient { w: number; h: number; flip: boolean }

export const orientOf = (v: Pick<GridView, 'width' | 'height' | 'you'>): Orient => ({ w: v.width, h: v.height, flip: v.you === 1 });

/** Display column and row (0-based, row 0 at the top of the screen) of a tile. */
export function dispXY(o: Orient, t: number): [number, number] {
  const x = t % o.w;
  const y = Math.floor(t / o.w);
  return o.flip ? [o.w - 1 - x, o.h - 1 - y] : [x, y];
}

/** Tile centre in board units (the SVG layer's viewBox is 0 0 w h). */
export function centre(o: Orient, t: number): [number, number] {
  const [x, y] = dispXY(o, t);
  return [x + 0.5, y + 0.5];
}

export const sideWord = (side: Side, me: Side, name: string) => (side === me ? 'you' : name);
