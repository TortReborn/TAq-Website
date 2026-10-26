// War versions of hand-written cards whose duel kit does not fit the war
// budget. Under war prices a team-wide buff is worth much more (three
// active slots that fight every round, no retaliation), so these two priced
// themselves past their cost while tuning (README.md, v1 results). Loaded
// into the catalog only for war runs (lab.ts LabConfig.signatures); the
// duel cards are unchanged.

import type { Signature } from '../signatures';

export const WAR_SIGNATURES: Record<string, Signature> = {
  // Duel: other units +1/+1. War: +1 health to the others, +1 power to one.
  'her-majesty': {
    element: 'air', cost: 7,
    abilities: [{ when: 'play', name: 'Royal Decree', target: 'ally_unit', effects: [{ k: 'buff', atk: 0, hp: 1, t: 'other_ally_units' }, { k: 'buff', atk: 1, hp: 0, t: 'chosen' }] }],
  },
  // Duel: Rush, other units +1 power. War: Rush, one unit +1 power.
  'syndra': {
    element: 'thunder', cost: 6, keywords: ['rush'],
    abilities: [{ when: 'play', name: 'Call to Arms', target: 'ally_unit', effects: [{ k: 'buff', atk: 1, hp: 0, t: 'chosen' }] }],
  },
};
