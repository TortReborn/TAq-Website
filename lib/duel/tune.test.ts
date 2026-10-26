// Fits the balance coefficients by self-play (tune.ts). Opt-in; it plays
// tens of thousands of games:
//
//   DUEL_TUNE=1 npx vitest run lib/duel/tune.test.ts          report only
//   DUEL_TUNE=1 DUEL_TUNE_WRITE=1 npx vitest run lib/duel/tune.test.ts
//                                                   also rewrite the JSON
//
// This runs in one thread. `node scripts/duel-lab.mjs tune` does the same on
// every core, and `... meta` runs it inside the full meta loop.

import fs from 'fs';
import path from 'path';
import { describe, it } from 'vitest';
import { K } from './balance';
import { serialRunner } from './lab';
import { rounded, tunePrices } from './tune';

describe.skipIf(!process.env.DUEL_TUNE)('duel balance tuner', () => {
  it('fits the coefficients', async () => {
    await tunePrices({
      rounds: Number(process.env.DUEL_TUNE_ROUNDS || 8),
      games: Number(process.env.DUEL_TUNE_GAMES || 4000),
      seed: 1000,
      runner: serialRunner(),
      log: console.log,
    });
    const out = JSON.stringify(rounded(K), null, 2) + '\n';
    if (process.env.DUEL_TUNE_WRITE) {
      fs.writeFileSync(path.join(__dirname, 'balance-coefficients.json'), out);
      console.log('wrote balance-coefficients.json');
    } else {
      console.log(out);
    }
  }, 3_600_000);
});
