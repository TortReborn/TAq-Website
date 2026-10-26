// Card text, written from the card data so the words on a card can never
// disagree with what the engine does.

import { tankAbility } from './rules';
import type { Ability, Effect, EffectTarget, Element, Keyword, TargetSpec, Tier } from './types';

export const KEYWORD_TEXT: Record<Keyword, { name: string; text: string }> = {
  guard: { name: 'Guard', text: 'Enemies must attack a Guard before anything else.' },
  rush: { name: 'Rush', text: 'Can attack or use its move the turn it is played.' },
  ranged: { name: 'Ranged', text: 'Takes no damage back when it attacks.' },
  stealth: { name: 'Stealth', text: 'Cannot be attacked or chosen by the enemy until it acts.' },
  shield: { name: 'Shield', text: 'Ignores the first damage it would take.' },
  drain: { name: 'Drain', text: 'Damage it deals by attacking heals your tank.' },
  pierce: { name: 'Pierce', text: 'Attack damage beyond a unit\'s health hits the enemy tank.' },
  regen: { name: 'Regen', text: 'Restores 2 health at the start of your turn.' },
};

export const ELEMENT_INFO: Record<Element, { name: string; glyph: string; color: string; style: string }> = {
  earth: { name: 'Earth', glyph: '✤', color: '#3fae45', style: 'Walls, shields and patience. Outlasts aggression, then wins late.' },
  thunder: { name: 'Thunder', glyph: '✦', color: '#e0c030', style: 'Fast and swingy. Rush attackers, chain lightning, team buffs.' },
  water: { name: 'Water', glyph: '❉', color: '#3fb8d8', style: 'Control and sustain. Freezes threats, heals, draws cards.' },
  fire: { name: 'Fire', glyph: '✹', color: '#e5533d', style: 'Pure aggression. Direct damage and hard-hitting bodies.' },
  air: { name: 'Air', glyph: '❋', color: '#b8c4d6', style: 'Tempo and tricks. Stealth, bounce, card flow.' },
};

/** The bot's rarity colours (Helpers/cards.py TIER_COLORS). */
export const TIER_INFO: Record<Tier, { name: string; color: string }> = {
  normal: { name: 'Normal', color: '#d9d9d9' },
  unique: { name: 'Unique', color: '#ffff55' },
  rare: { name: 'Rare', color: '#ff55ff' },
  legendary: { name: 'Legendary', color: '#55ffff' },
  fabled: { name: 'Fabled', color: '#ff5555' },
  mythic: { name: 'Mythic', color: '#aa00aa' },
  member: { name: 'Member', color: '#d52b80' },
  token: { name: 'Token', color: '#8a94a6' },
};

const TOKEN_NAMES: Record<string, string> = {
  'token-stone-wall': 'a 0/2 Stone Wall with Guard',
  'token-grub': 'a 2/2 Wyrmling Grub',
  'token-spark': 'a 1/1 Spark with Rush',
  'token-droplet': 'a 1/2 Deckhand',
  'token-ember': 'a 2/1 Hive Drone',
  'token-wisp': 'a 1/1 Wisp with Stealth',
};

function chosen(spec: TargetSpec | undefined): string {
  switch (spec) {
    case 'enemy': return 'an enemy';
    case 'enemy_unit': return 'an enemy unit';
    case 'ally': return 'a friendly unit or your tank';
    case 'ally_unit': return 'a friendly unit';
    case 'any_unit': return 'a unit';
    default: return 'a target';
  }
}

function who(t: EffectTarget, spec: TargetSpec | undefined): string {
  switch (t) {
    case 'chosen': return chosen(spec);
    case 'self': return 'this unit';
    case 'enemy_hero': return 'the enemy tank';
    case 'ally_hero': return 'your tank';
    case 'all_enemy_units': return 'all enemy units';
    case 'all_ally_units': return 'all your units';
    case 'other_ally_units': return 'your other units';
    case 'all_other_units': return 'all other units';
    case 'random_enemy_unit': return 'a random enemy unit';
    case 'random_enemy': return 'a random enemy';
  }
}

function plural(t: EffectTarget): boolean {
  return t === 'all_enemy_units' || t === 'all_ally_units' || t === 'other_ally_units' || t === 'all_other_units';
}

export function effectText(e: Effect, spec: TargetSpec | undefined): string {
  switch (e.k) {
    case 'damage': return `deal ${e.n} damage to ${who(e.t, spec)}`;
    case 'heal': return `restore ${e.n} health to ${who(e.t, spec)}`;
    case 'buff': {
      const parts = [e.atk ? `+${e.atk} power` : '', e.hp ? `+${e.hp} health` : ''].filter(Boolean).join(' and ');
      return `give ${who(e.t, spec)} ${parts}`;
    }
    case 'draw': return e.n === 1 ? 'draw a card' : `draw ${e.n} cards`;
    case 'freeze': return `freeze ${who(e.t, spec)} (${plural(e.t) ? 'they skip' : 'it skips'} its next turn)`;
    case 'bounce': return `return ${who(e.t, spec)}${e.maxCost !== undefined ? ` costing ${e.maxCost} or less` : ''} to ${plural(e.t) ? 'their owners\'' : 'its owner\'s'} hand`;
    case 'summon': return `summon ${e.n === 1 ? TOKEN_NAMES[e.token] ?? e.token : `${e.n} × ${(TOKEN_NAMES[e.token] ?? e.token).replace(/^an? /, '')}`}`;
    case 'tide': return `gain ${e.n} tide this turn`;
    case 'grant': return `give ${who(e.t, spec)} ${KEYWORD_TEXT[e.kw].name}`;
    case 'destroy': return `destroy ${who(e.t, spec)}${e.maxPower !== undefined ? ` with ${e.maxPower} or less power` : ''}`;
    case 'chain': return `deal 1 damage to a random enemy, ${e.n} times`;
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function abilityText(a: Ability): { label: string; text: string } {
  const body = cap(a.effects.map(e => effectText(e, a.target)).join(', then ')) + '.';
  switch (a.when) {
    case 'play': return { label: 'On play', text: body };
    case 'death': return { label: 'When it dies', text: body };
    case 'turn_start': return { label: 'Each of your turns', text: body };
    case 'move': return { label: `Move (${a.cost ?? 0} tide)`, text: body };
  }
}

/** The Tank ability of an element's tank, for the battle screen and deck builder. */
export function tankText(el: Element): { name: string; cost: number; text: string } {
  const a = tankAbility(el);
  return { name: a.name ?? 'Tank', cost: a.cost ?? 0, text: abilityText(a).text + ' Once a turn.' };
}
