// Hand-written cards. A signature fixes a card's element, cost and kit; its
// power and health are still solved from the same budget as every generated
// card (balance.ts), so a signature can be more interesting than a template
// card but never bigger. Cards listed only in ELEMENT_OVERRIDES keep the tier
// template and just take a themed element.

import type { Ability, Element, Keyword } from './types';

export interface Signature {
  element: Element;
  cost: number;
  keywords?: Keyword[];
  abilities?: Ability[];
  /** Share of stat points in power; defaults to the element's shape. */
  shape?: number;
}

export const SIGNATURES: Record<string, Signature> = {
  // --- The Raid Pantheon (mythic) ---
  'orphion': {
    element: 'thunder', cost: 8,
    abilities: [{ when: 'play', name: 'Nexus of Light', effects: [{ k: 'damage', n: 2, t: 'all_enemy_units' }] }],
  },
  'anathema': {
    element: 'fire', cost: 7, keywords: ['pierce'],
    abilities: [{ when: 'move', name: 'Corruption', cost: 2, target: 'enemy', effects: [{ k: 'damage', n: 2, t: 'chosen' }] }],
  },
  'grootslang-wyrmling': {
    element: 'earth', cost: 7, keywords: ['guard'],
    abilities: [{ when: 'death', name: 'The Nest', effects: [{ k: 'summon', token: 'token-grub', n: 2 }] }],
  },
  'the-canyon-colossus': {
    element: 'earth', cost: 9, keywords: ['guard', 'shield'],
    abilities: [{ when: 'play', name: 'Canyon Wall', effects: [{ k: 'buff', atk: 0, hp: 2, t: 'other_ally_units' }] }],
  },
  'the-nameless-anomaly': {
    element: 'air', cost: 8, keywords: ['stealth'],
    abilities: [{ when: 'play', name: 'Unmake', effects: [{ k: 'bounce', t: 'all_enemy_units', maxCost: 3 }] }],
  },
  'annihilation': {
    element: 'fire', cost: 9,
    abilities: [{ when: 'play', name: 'Cataclysm', effects: [{ k: 'damage', n: 3, t: 'all_other_units' }] }],
  },

  // --- The Fruman Crown (fabled) ---
  'her-majesty': {
    element: 'air', cost: 7,
    abilities: [{ when: 'play', name: 'Royal Decree', effects: [{ k: 'buff', atk: 1, hp: 1, t: 'other_ally_units' }] }],
  },
  'tasim': {
    element: 'earth', cost: 6, keywords: ['regen'],
    abilities: [{ when: 'move', name: 'Overgrowth', cost: 2, effects: [{ k: 'summon', token: 'token-stone-wall', n: 1 }] }],
  },
  'sovereign-majin': {
    element: 'fire', cost: 5, keywords: ['rush'],
    abilities: [{ when: 'play', name: 'Sovereign Flame', target: 'enemy', effects: [{ k: 'damage', n: 2, t: 'chosen' }] }],
  },
  'sovereign-two': {
    element: 'thunder', cost: 5, keywords: ['ranged'],
    abilities: [{ when: 'play', name: 'Split Bolt', effects: [{ k: 'chain', n: 3 }] }],
  },
  'sovereign-zhiraok': {
    element: 'water', cost: 7,
    abilities: [{ when: 'play', name: 'Still Waters', effects: [{ k: 'freeze', t: 'all_enemy_units' }] }],
  },
  'sovereign-gikyo': {
    element: 'air', cost: 5, keywords: ['stealth'],
    abilities: [{ when: 'move', name: 'Veil', cost: 1, target: 'ally_unit', effects: [{ k: 'grant', kw: 'stealth', t: 'chosen' }] }],
  },
  'sovereign-soosu': {
    element: 'earth', cost: 5, keywords: ['guard', 'shield'],
    abilities: [{ when: 'play', name: 'Aegis', target: 'ally_unit', effects: [{ k: 'grant', kw: 'shield', t: 'chosen' }] }],
  },

  // --- The Fruman Resistance ---
  'sui': {
    element: 'water', cost: 5, keywords: ['drain'],
    abilities: [{ when: 'move', name: 'Tidecall', cost: 2, target: 'ally', effects: [{ k: 'heal', n: 3, t: 'chosen' }] }],
  },
  'rex': { element: 'fire', cost: 6, keywords: ['pierce', 'rush'] },
  'zeph': {
    element: 'air', cost: 5,
    abilities: [{ when: 'play', name: 'Intel', effects: [{ k: 'draw', n: 2 }] }],
  },
  'syndra': {
    element: 'thunder', cost: 6, keywords: ['rush'],
    abilities: [{ when: 'play', name: 'Call to Arms', effects: [{ k: 'buff', atk: 1, hp: 0, t: 'other_ally_units' }] }],
  },

  // --- Legends of the Provinces ---
  'aledar': {
    element: 'earth', cost: 6, keywords: ['guard'],
    abilities: [{ when: 'play', name: 'Hold the Line', effects: [{ k: 'grant', kw: 'shield', t: 'other_ally_units' }] }],
  },
  'lari': {
    element: 'water', cost: 7,
    abilities: [{ when: 'play', name: 'Light of Lari', effects: [{ k: 'heal', n: 5, t: 'ally_hero' }, { k: 'buff', atk: 0, hp: 2, t: 'other_ally_units' }] }],
  },
  'seaskipper-captain': {
    element: 'water', cost: 5,
    abilities: [{ when: 'play', name: 'All Hands', effects: [{ k: 'summon', token: 'token-droplet', n: 2 }] }],
  },
  'bob': { element: 'thunder', cost: 7, keywords: ['rush', 'pierce'] },
  'ragni-s-king': {
    element: 'earth', cost: 5, keywords: ['guard'],
    abilities: [{ when: 'play', name: 'Royal Guard', effects: [{ k: 'buff', atk: 0, hp: 1, t: 'other_ally_units' }] }],
  },

  // --- Boss Altars ---
  'hyhet': {
    element: 'fire', cost: 7,
    abilities: [{ when: 'move', name: 'Apostasy', cost: 3, effects: [{ k: 'damage', n: 1, t: 'all_enemy_units' }] }],
  },
  'durum-protector': { element: 'earth', cost: 2, keywords: ['guard'] },

  // --- Dungeon Keepers ---
  'arakadicus': {
    element: 'earth', cost: 4,
    abilities: [{ when: 'play', name: 'Web', target: 'enemy_unit', effects: [{ k: 'freeze', t: 'chosen' }] }],
  },
  'charon': {
    element: 'water', cost: 4,
    abilities: [{ when: 'death', name: 'Toll', effects: [{ k: 'draw', n: 1 }] }],
  },
  'antikythera-supercomputer': {
    element: 'thunder', cost: 5,
    abilities: [{ when: 'move', name: 'Compute', cost: 2, effects: [{ k: 'draw', n: 1 }] }],
  },
  'the-eye': {
    element: 'air', cost: 5, keywords: ['ranged'],
    abilities: [{ when: 'play', name: 'Gaze', effects: [{ k: 'freeze', t: 'random_enemy_unit' }] }],
  },

  // --- Festival Spirits and others ---
  'qira-mistress-of-the-hive': {
    element: 'fire', cost: 5,
    abilities: [{ when: 'play', name: 'Swarm', effects: [{ k: 'summon', token: 'token-ember', n: 2 }] }],
  },
  'ankou': {
    element: 'air', cost: 6,
    abilities: [{ when: 'death', name: 'Reap', effects: [{ k: 'destroy', t: 'random_enemy_unit', maxPower: 3 }] }],
  },
};

/** Themed elements for cards that otherwise keep their tier template. */
export const ELEMENT_OVERRIDES: Record<string, Element> = {
  // legendary
  'ava': 'air', 'aster': 'air', 'bonfire-keeper': 'fire', 'the-traveler': 'air', 'yuman': 'thunder',
  'maxie': 'air', 'elise': 'water', 'mora': 'fire', 'siegfried': 'earth', 'axelus': 'thunder',
  'the-guide': 'air', 'santa': 'water', 'dodegar': 'earth', 'nohno': 'water', 'enzan': 'fire',
  'dr-legendary': 'thunder', 'junes': 'water', 'orange-wybel': 'air', 'panic-zealot': 'fire',
  // rare, from the sets
  'witherhead': 'water', 'garoth': 'earth', 'hashr': 'earth', 'theorick-twain': 'air',
  'slykaar': 'fire', 'captain-redbeard': 'water', 'master-azael': 'thunder', 'captain-cileon': 'water',
  'captain-fuhue': 'fire', 'dr-picard': 'thunder', 'elphaba': 'air', 'king-draani': 'earth',
  'bak-al': 'fire', 'caissop': 'water', 'chef-hamsey': 'fire', 'the-envoy': 'air', 'the-seer': 'air',
  'revenant-of-skien': 'air', 'adamastor': 'air',
  // unique / normal, from the sets
  'haros': 'water', 'rymek-luke': 'thunder', 'festival-worker': 'fire',
};
