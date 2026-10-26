// The deck-search league. Opt-in: it plays hundreds of thousands of games
// in one thread; `node scripts/duel-lab.mjs season` runs the same on every
// core and is what the numbers in README.md come from.
//
//   DUEL_EVOLVE=1 npx vitest run lib/duel/evolve.test.ts
//     DUEL_EVOLVE_GENS=40   generations (default 30)
//     DUEL_EVOLVE_WRITE=1   also write starter-decks.json
//
// Two questions (meta.ts season):
//   1. Meta: what are the strongest decks a new player (free normals only)
//      and a veteran (any card) can build, and how far apart are they?
//   2. Starters: the best mono-element normal-only deck for each element,
//      which become the free starter decks.

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { starterDecks, validateDeck } from './deck';
import { poolFor, repair } from './evolve';
import { serialRunner } from './lab';
import { health, season } from './meta';
import { Rng } from './rng';
import evolved from './starter-decks.json';

const ALL = ['normal', 'unique', 'rare', 'legendary', 'fabled', 'mythic'];
const GENS = Number(process.env.DUEL_EVOLVE_GENS || 30);

describe('deck search (quick)', () => {
  it('repairs any list into a legal deck', () => {
    const rng = new Rng(1);
    const pool = poolFor(ALL);
    for (let i = 0; i < 50; i++) {
      const junk = Array.from({ length: 5 + rng.int(40) }, () => rng.pick(pool).slug);
      const d = repair(junk, pool, rng);
      expect(validateDeck(d, null)).toEqual([]);
    }
  });

  it('ships the evolved starter decks, not the rule-built fallback', () => {
    for (const d of starterDecks()) {
      expect(d.cards.slice().sort(), d.element).toEqual(((evolved as Record<string, string[]>)[d.element] ?? []).slice().sort());
    }
  });
});

describe.skipIf(!process.env.DUEL_EVOLVE)('deck search (full)', () => {
  it('finds the meta and the starters', async () => {
    const report = await season({
      runner: serialRunner(), seed: 2026, generations: GENS, popSize: 10, gamesPerDeck: 24, log: console.log,
    });
    console.log(JSON.stringify({ health: health(report), report }, null, 1));
    if (process.env.DUEL_EVOLVE_WRITE) {
      fs.writeFileSync(path.join(__dirname, 'starter-decks.json'), JSON.stringify(report.starters, null, 1) + '\n');
      console.log('wrote starter-decks.json');
    }
  }, 7_200_000);
});
