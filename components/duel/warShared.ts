// Pieces the war board and the war guide share.

import { Coins, Fish, Gem, Pickaxe, Trees, Wheat } from 'lucide-react';
import { abilityText } from '@/lib/duel/text';
import type { Ability } from '@/lib/duel/types';
import { emeraldCost, moveCost, WAR, warHealth, warKeywordText, warSpeed, type Resource, type Territory } from '@/lib/duel/war/client';
import type { CardRules } from './CardFace';

export const LANE_NAME = ['Left', 'Centre', 'Right'] as const;
export const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];

/** How cards read on a war board: emerald prices, war health, speed, war keyword text. */
export const WAR_CARD_RULES: CardRules = {
  cost: d => emeraldCost(d.cost),
  costLabel: 'Emerald cost',
  costEmerald: true,
  power: d => Math.round(d.power * WAR.powerMult),
  health: d => warHealth(d),
  speed: d => warSpeed(d),
  keywordText: kw => warKeywordText(kw),
  abilityLabel: (a: Ability) => (a.when === 'move' ? `Move (${moveCost(a.cost ?? 0)} emeralds)` : a.when === 'play' ? 'On deploy' : a.when === 'turn_start' ? 'Each round' : abilityText(a).label),
};

export const PERK_ICON: Record<Resource | 'city', typeof Gem> = { city: Coins, ore: Pickaxe, crops: Wheat, fish: Fish, wood: Trees };

/** What holding a lane's front gives, in the config's numbers. */
export function perkText(t: Territory): string {
  const parts: string[] = [];
  if (t.city) parts.push(`+${WAR.perk.city} emerald`);
  if (t.resource === 'ore') parts.push(`+${WAR.perk.ore} power`);
  if (t.resource === 'crops') parts.push(`heal ${WAR.perk.crops}`);
  if (t.resource === 'fish') parts.push(`draw ${WAR.perk.fish}`);
  if (t.resource === 'wood') parts.push(`repair ${WAR.perk.wood}`);
  return parts.join(', ');
}

