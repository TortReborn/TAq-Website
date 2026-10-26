#!/usr/bin/env node
// Runs the Tank Duels balance lab (lib/duel/lab-cli.ts) on every core.
// Opt-in and heavy: a meta run plays millions of bot games.
//
//   node scripts/duel-lab.mjs season|tune|train|meta [--flags]
//
// The TypeScript is bundled with esbuild (already a dependency of the test
// toolchain) into the OS temp dir, then run; worker threads load the same
// bundle. Flags are documented at the top of lib/duel/lab-cli.ts.

import { build } from 'esbuild';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(os.tmpdir(), 'duel-lab', `lab-${process.pid}.mjs`);

await build({
  entryPoints: [path.join(repo, 'lib/duel/lab-cli.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  tsconfig: path.join(repo, 'tsconfig.json'),
  logLevel: 'warning',
});
process.env.DUEL_LAB_REPO = repo;
await import(pathToFileURL(outfile).href);
