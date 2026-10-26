// Entry point of the balance lab on every core. Not imported by the app;
// scripts/duel-lab.mjs bundles this file and runs it, and the same bundle
// runs in each worker thread. See lib/duel/README.md, "Balance method".
//
//   node scripts/duel-lab.mjs season            evolve the league, measure health
//   node scripts/duel-lab.mjs tune [--write]    refit mechanic prices
//   node scripts/duel-lab.mjs train [--write]   learn the bot's weights
//   node scripts/duel-lab.mjs meta [--write]    the whole outer loop
//
//   node scripts/duel-lab.mjs versus --a=5 --b=0   bot search width A vs B
//
// Warfront (--ruleset=grid, lib/duel/grid/README.md): season, tune and free
// work as for the duel; gprobe (traced random-deck games, grid stats) and
// gversus --a=full --b=greedy|random (the skill guard). Board and rules:
// --size=5, --layout=Name, --movement=uniform, --flank=0, --surround=1,
// --grid=JSON (any GridConfig fields); bot: --gwidth, --prune, --reply=0,
// --geval=JSON (evaluation weights).
//
// Common flags: --out=DIR (reports; default the OS temp dir), --seed=N,
// --workers=N, --width=N (bot search width), --hp=N, --tanks=0 (measure
// without the Tank ability), --config=FILE (a LabConfig JSON to start from).
// Season sizes: --gens, --pop (per niche), --games; tuning: --rounds, --tgames.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { isMainThread, parentPort, Worker } from 'worker_threads';
import { K } from './balance';
import { getCard } from './catalog';
import { WEIGHTS } from './ai';
import { RULES } from './engine';
import { applyConfig, playTasks, type GameTask, type LabConfig, type Runner } from './lab';
import { health, metaLoop, randomEngagement, season, type MetaCandidate } from './meta';
import { reduceTerritories, type WarConfig } from './war/config';
import { WAR_SIGNATURES } from './war/signatures';
import { GRID_SIGNATURES } from './grid/cards';
import type { GridConfig } from './grid/config';
import type { GameResult } from './sim';
import { duel, trainBot } from './train';
import { rounded, tunePrices } from './tune';

type Msg = { id: number; config?: LabConfig; tasks?: GameTask[] };

function workerRunner(n: number): Runner {
  const workers = Array.from({ length: n }, () => new Worker(new URL(import.meta.url), { workerData: { duelLabWorker: true } }));
  let nextId = 1;
  const pending = new Map<number, (v: unknown) => void>();
  for (const w of workers) {
    w.on('message', (m: { id: number; results?: GameResult[] }) => { pending.get(m.id)?.(m.results); pending.delete(m.id); });
    w.on('error', e => { console.error(e); process.exit(1); });
  }
  const send = (w: Worker, msg: Omit<Msg, 'id'>) => new Promise<unknown>(resolve => {
    const id = nextId++;
    pending.set(id, resolve);
    w.postMessage({ id, ...msg });
  });
  return {
    async configure(cfg) {
      applyConfig(cfg);
      const plain = JSON.parse(JSON.stringify(cfg));
      await Promise.all(workers.map(w => send(w, { config: plain })));
    },
    async play(tasks) {
      const out: GameResult[] = new Array(tasks.length);
      const chunk = Math.max(2, Math.ceil(tasks.length / (n * 6)));
      let at = 0;
      const pump = async (w: Worker) => {
        while (at < tasks.length) {
          const from = at;
          at += chunk;
          const res = (await send(w, { tasks: tasks.slice(from, from + chunk) })) as GameResult[];
          res.forEach((r, i) => { out[from + i] = r; });
        }
      };
      await Promise.all(workers.map(pump));
      return out;
    },
    async close() { await Promise.all(workers.map(w => w.terminate())); },
  };
}

function flags(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of process.argv.slice(3)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] ?? '1';
  }
  return out;
}

const REPO = path.resolve(process.env.DUEL_LAB_REPO ?? process.cwd());
const file = (name: string) => path.join(REPO, 'lib', 'duel', name);

async function main() {
  const cmd = process.argv[2];
  const f = flags();
  const out = path.resolve(f.out ?? path.join(os.tmpdir(), 'duel-lab'));
  fs.mkdirSync(out, { recursive: true });
  const seed = Number(f.seed ?? 2026);
  const t0 = Date.now();
  const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
  const runner = workerRunner(Number(f.workers ?? Math.max(1, os.cpus().length - 2)));
  if (f.tanks !== undefined) RULES.tanks = f.tanks !== '0';
  if (f.hp) RULES.heroHp = Number(f.hp);
  // A narrower search than the shipped bot's makes long runs affordable.
  if (f.width) WEIGHTS.width = Number(f.width);
  // Three-Front War and its controls: --ruleset=war [--lanes=hard] [--brace=0]
  // [--perks=0] [--candidates=N --samples=N] [--war=JSON of WarConfig fields].
  const ruleset = f.ruleset === 'war' ? 'war' as const : f.ruleset === 'grid' ? 'grid' as const : 'duel' as const;
  const war: Partial<WarConfig> = {
    ...(f.lanes ? { lanes: f.lanes as WarConfig['lanes'] } : {}),
    ...(f.brace !== undefined ? { brace: f.brace !== '0' } : {}),
    ...(f.perks !== undefined ? { perks: f.perks !== '0' } : {}),
    ...(f.war ? JSON.parse(f.war) : {}),
  };
  // The war ruleset prices its cards from war/balance-coefficients.json when
  // there is one (`tune --ruleset=war --write`), unless --noprices.
  const warPrices = file('war/balance-coefficients.json');
  if (ruleset === 'war' && !f.noprices && fs.existsSync(warPrices)) applyConfig({ coefficients: JSON.parse(fs.readFileSync(warPrices, 'utf8')) });
  // Warfront likewise prices from grid/balance-coefficients.json (also what the live game uses).
  const gridPrices = file('grid/balance-coefficients.json');
  if (ruleset === 'grid' && !f.noprices && fs.existsSync(gridPrices)) applyConfig({ coefficients: JSON.parse(fs.readFileSync(gridPrices, 'utf8')) });
  // --config goes on top, so a config with only rules keeps the war prices.
  if (f.config) applyConfig(JSON.parse(fs.readFileSync(f.config, 'utf8')));
  const warBot = { ...(f.candidates ? { candidates: Number(f.candidates) } : {}), ...(f.samples ? { samples: Number(f.samples) } : {}) };
  // Warfront and its controls: --ruleset=grid [--size=5] [--layout=Name] [--movement=uniform]
  // [--flank=0] [--surround=1] [--grid=JSON of GridConfig fields]; bot: --gwidth=N --prune=N --reply=0.
  const grid: Partial<GridConfig> = {
    ...(f.size ? { size: Number(f.size) as 5 | 7 } : {}),
    ...(f.layout ? { layout: f.layout } : {}),
    ...(f.movement ? { movement: f.movement as GridConfig['movement'] } : {}),
    ...(f.flank !== undefined ? { flank: Number(f.flank) } : {}),
    ...(f.surround !== undefined ? { surround: f.surround !== '0' } : {}),
    ...(f.grid ? JSON.parse(f.grid) : {}),
  };
  // With --size, --grid (and --preset=JSON) also go into that size's preset, so they win over it.
  const { GRID_PRESETS } = await import('./grid/config');
  const gridPresets = f.size ? { [Number(f.size)]: { ...GRID_PRESETS[Number(f.size) as 5 | 7], ...(f.preset ? JSON.parse(f.preset) : {}), ...(f.grid ? JSON.parse(f.grid) : {}) } } : undefined;
  const gridBot = {
    ...(f.gwidth ? { width: Number(f.gwidth) } : {}), ...(f.prune ? { prune: Number(f.prune) } : {}),
    ...(f.reply !== undefined ? { reply: f.reply !== '0' } : {}), ...(f.rprune ? { replyPrune: Number(f.rprune) } : {}),
  };
  // War runs use the war versions of hand-written cards (war/signatures.ts) unless --nosigs.
  const signatures = f.nosigs || ruleset === 'duel' ? {} : ruleset === 'grid' ? GRID_SIGNATURES : WAR_SIGNATURES;
  const gridEval = f.geval ? JSON.parse(f.geval) : {};
  await runner.configure({ ruleset, war, warBot, grid, ...(gridPresets ? { gridPresets } : {}), gridBot, gridEval, signatures, coefficients: K, rules: RULES, bot: WEIGHTS });
  const seasonOpts = {
    generations: Number(f.gens ?? 40), popSize: Number(f.pop ?? 10), gamesPerDeck: Number(f.games ?? 30),
    tracedGames: Number(f.traced ?? 2000)
  };
  const save = (name: string, data: unknown) => {
    fs.writeFileSync(path.join(out, name), JSON.stringify(data, null, 1) + '\n');
    log(`wrote ${path.join(out, name)}`);
  };

  if (cmd === 'speed') {
    // Games a second on every core, random curve-built decks.
    const t = Date.now();
    const e = await randomEngagement(runner, Number(f.n ?? 400), seed);
    log(`${e.games} games in ${((Date.now() - t) / 1000).toFixed(1)}s: ${(e.games / ((Date.now() - t) / 1000)).toFixed(1)} games/s`);
  } else if (cmd === 'territories') {
    const raw = JSON.parse(fs.readFileSync(path.join(REPO, 'public', 'territories_verbose.json'), 'utf8'));
    const rows = reduceTerritories(raw);
    fs.writeFileSync(file('war/territories.json'), JSON.stringify(rows).replace(/},{/g, '},\n{') + '\n');
    log(`wrote ${rows.length} territories`);
  } else if (cmd === 'season') {
    if (f.tune) await tunePrices({ rounds: Number(f.rounds ?? 8), games: Number(f.tgames ?? 6000), seed, runner, log });
    const seasons = Number(f.seasons ?? 1);
    for (let i = 1; i < seasons; i++) {
      const r = await season({ ...seasonOpts, runner, seed: seed + 1000 * i, log });
      save(`season-${f.tag ?? 'latest'}-${i}.json`, { health: health(r), report: r });
    }
    const report = await season({ ...seasonOpts, runner, seed, log });
    const h = health(report);
    log(`health ${h.score} ${JSON.stringify(h.parts)}`);
    save(`season-${f.tag ?? 'latest'}.json`, { health: h, report, rules: RULES, budget: K.budget });
  } else if (cmd === 'tune') {
    // --pressure=a.json,b.json: season reports whose elite over-use of each
    // mechanic (meta.ts elitePressure) is averaged and added to the fit.
    let pressure: Record<string, number> | undefined;
    if (f.pressure) {
      const reports = f.pressure.split(',').map(p => JSON.parse(fs.readFileSync(p, 'utf8')).report.pressure as Record<string, number>);
      pressure = {};
      for (const r of reports) for (const [k, v] of Object.entries(r)) pressure[k] = (pressure[k] ?? 0) + v / reports.length;
    }
    const t = await tunePrices({ rounds: Number(f.rounds ?? 8), games: Number(f.tgames ?? 6000), seed, runner, log, pressure, allowOverBudget: ruleset !== 'duel', elementLimit: f.elimit ? Number(f.elimit) : undefined, normalOffsets: !!f.normaloffsets, fixStats: !!f.fixstats,
      fitTiers: !!f.fittiers, gapTarget: f.gaptarget ? Number(f.gaptarget) : undefined });
    if (t.overBudget.length) log(`signatures over budget in some round (fall back to a minimal body): ${t.overBudget.join(', ')}`);
    const json = JSON.stringify(rounded(K), null, 2) + '\n';
    // War prices live beside the war rules; the duel game's file is the live one.
    const target = ruleset === 'war' ? 'war/balance-coefficients.json' : ruleset === 'grid' ? 'grid/balance-coefficients.json' : 'balance-coefficients.json';
    if (f.write) { fs.writeFileSync(file(target), json); log(`wrote ${target}`); }
    else save('coefficients.json', rounded(K));
  } else if (cmd === 'peek') {
    // --cards=slug,slug: print cards as the current configuration builds them.
    for (const slug of (f.cards ?? '').split(',').filter(Boolean)) {
      const c = getCard(slug);
      console.log(c ? `${slug} ${c.tier} ${c.element} c${c.cost} ${c.power}/${c.health} [${c.keywords.join(',')}] ${c.abilities.map(a => `${a.when}:${a.name}`).join(',')}` : `${slug} ?`);
    }
  } else if (cmd === 'free') {
    // Element win rates of random mono-element all-normal decks (free decks), --n pairings.
    const { buildDeck } = await import('./sim');
    const { Rng } = await import('./rng');
    const rng = new Rng(seed);
    const els = ['earth', 'thunder', 'water', 'fire', 'air'] as const;
    const tasks: GameTask[] = [];
    const who: [string, string][] = [];
    for (let g = 0; g < Number(f.n ?? 1500); g++) {
      const a = rng.pick(els), b = rng.pick(els.filter(x => x !== a));
      who.push([a, b]);
      tasks.push({ a: buildDeck({ elements: [a], tiers: new Set(['normal']) }, rng), b: buildDeck({ elements: [b], tiers: new Set(['normal']) }, rng), seed: rng.int(2 ** 31) });
    }
    const res = await runner.play(tasks);
    const t: Record<string, [number, number]> = {};
    res.forEach((r, i) => { for (const sd of [0, 1] as const) { const x = (t[who[i][sd]] ??= [0, 0]); x[1]++; if (r.winner === sd) x[0]++; else if (r.winner === null) x[0] += 0.5; } });
    log(els.map(e => `${e} ${(100 * t[e][0] / t[e][1]).toFixed(0)}%`).join('  '));
  } else if (cmd === 'starters') {
    // Head-to-head matrix of the starter decks in a season report (--from=season.json), under the current config.
    const { headToHead } = await import('./evolve');
    const decks = JSON.parse(fs.readFileSync(f.from, 'utf8')).report.starters as Record<string, string[]>;
    const els = Object.keys(decks);
    const n = Number(f.n ?? 200);
    const rows = els.map(() => els.map(() => NaN));
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const r = await headToHead(decks[els[i]], decks[els[j]], n, seed + i * 7 + j, runner);
      rows[i][j] = r; rows[j][i] = 1 - r;
    }
    log(els.map((e, i) => `${e} ${(rows[i].filter(x => !isNaN(x)).reduce((a, b) => a + b, 0) / (els.length - 1)).toFixed(2)}`).join('  '));
  } else if (cmd === 'wprobe') {
    // Quick look at a war configuration: traced games between random curve decks.
    const { buildDeck } = await import('./sim');
    const { Rng } = await import('./rng');
    const { ALL_TIERS } = await import('./meta');
    const { engagement } = await import('./metrics');
    const { summarizeWar } = await import('./war/sim');
    const rng = new Rng(seed);
    const els = ['earth', 'thunder', 'water', 'fire', 'air'] as const;
    const tasks: GameTask[] = [];
    for (let g = 0; g < Number(f.n ?? 400); g++) {
      const pick = () => { const a = rng.pick(els), b = rng.pick(els); return a === b ? [a] : [a, b]; };
      tasks.push({ a: buildDeck({ elements: pick(), tiers: new Set(ALL_TIERS) }, rng), b: buildDeck({ elements: pick(), tiers: new Set(ALL_TIERS) }, rng), seed: rng.int(2 ** 31), opts: { trace: true } });
    }
    const res = await runner.play(tasks);
    const w = summarizeWar(res);
    const e = engagement(res);
    // Diagnostics: comebacks whose 5-point deficit came only in the first third, and the
    // largest deficit a winner came back from (per exchange samples).
    let cbEarly = 0, cbAll = 0, deep = 0;
    for (const r of res) {
      if (!r.trace || r.winner === null) continue;
      const L = r.trace.leads.filter((_, i) => i % 2 === 1);
      const sg = r.winner === 0 ? 1 : -1;
      const behind = L.map(l => sg * l <= -5);
      if (!behind.some(Boolean)) continue;
      cbAll++;
      if (!behind.some((b, i) => b && i >= L.length / 3)) cbEarly++;
      deep += -Math.min(...L.map(l => sg * l));
    }
    log(`comebacks with the deficit only in the first third: ${(100 * cbEarly / Math.max(1, cbAll)).toFixed(0)}%; mean deepest deficit ${(deep / Math.max(1, cbAll)).toFixed(1)}`);
    log(JSON.stringify({ rounds: w.roundsMean, p10: e.length.p10, p90: e.length.p90, limit: e.turnLimitRate, hitsToKo: w.hitsToKo, captures: w.capturesPerGame, mix: w.orderMix, towerHit: w.towerHitShare, nonAtk: w.nonAttackShare, nonAtkStrict: w.nonAttackStrict, H: w.orderEntropy, luck: w.braceLuck, ctrDmg: w.counterDamagePerGame, swapped: w.swappedHitRate, flips: e.leadChanges, comeback: e.comebackRate, early: e.decidedEarly, x: e.perExchange, choices: e.distinctPerTurn, seat0: e.firstPlayerWin }));
  } else if (cmd === 'gprobe') {
    // Quick look at a Warfront configuration: traced games between random curve decks.
    const { buildDeck } = await import('./sim');
    const { Rng } = await import('./rng');
    const { ALL_TIERS } = await import('./meta');
    const { engagement } = await import('./metrics');
    const { summarizeGrid } = await import('./grid/sim');
    const rng = new Rng(seed);
    const els = ['earth', 'thunder', 'water', 'fire', 'air'] as const;
    const tiers = f.free ? new Set(['normal']) : new Set(ALL_TIERS);
    const tasks: GameTask[] = [];
    for (let g = 0; g < Number(f.n ?? 400); g++) {
      const pick = () => { const a = rng.pick(els), b = rng.pick(els); return f.free || a === b ? [a] : [a, b]; };
      // --mirror: both seats play the same deck (separates the rules' swings from deck strength).
      const da = buildDeck({ elements: pick(), tiers }, rng);
      tasks.push({ a: da, b: f.mirror ? da : buildDeck({ elements: pick(), tiers }, rng), seed: rng.int(2 ** 31), opts: { trace: true } });
    }
    const t = Date.now();
    const res = await runner.play(tasks);
    const secs = (Date.now() - t) / 1000;
    const e = engagement(res);
    const g = summarizeGrid(res);
    // Diagnostics: the exchange read at the other phase (after the first player's turn), and the mean of both turns.
    const { leadStats } = await import('./metrics');
    const shifted = res.map(r => (r.trace ? { ...r, trace: { ...r.trace, leads: r.trace.leads.filter((_, i) => i % 2 === 0) } } : r));
    const meaned = res.map(r => (r.trace ? { ...r, trace: { ...r.trace, leads: r.trace.leads.flatMap((l, i, L) => (i % 2 === 1 ? [(l + L[i - 1]) / 2] : i === L.length - 1 ? [l] : [])) } } : r));
    const out = { gps: +(res.length / secs).toFixed(1), turnsEach: g.turnsEachMean, p10: e.length.p10, p90: e.length.p90, limit: g.limitShare, hqWin: g.hqWinShare, x: e.perExchange, x0: leadStats(shifted, 1), xm: leadStats(meaned, 1), seat: e.firstPlayerWin, choices: e.distinctPerTurn, acts: e.actionsPerTurn, grid: g };
    log(JSON.stringify(out));
    if (f.save) save(`gprobe-${f.save}.json`, out);
  } else if (cmd === 'gversus') {
    // Warfront bot against a baseline: --a=full --b=greedy|random, random curve decks, seats mirrored.
    const { buildDeck } = await import('./sim');
    const { Rng } = await import('./rng');
    const { ALL_TIERS } = await import('./meta');
    const { score } = await import('./lab');
    const rng = new Rng(seed);
    const tasks: GameTask[] = [];
    const A = { mode: (f.a ?? 'full') as 'full', ...(f.aw ? { width: Number(f.aw) } : {}), ...(f.aeval ? { eval: JSON.parse(f.aeval) } : {}) };
    const B = { mode: (f.b ?? 'greedy') as 'full', ...(f.bw ? { width: Number(f.bw) } : {}), ...(f.beval ? { eval: JSON.parse(f.beval) } : {}) };
    for (let g = 0; g < Number(f.n ?? 300); g++) {
      const d1 = buildDeck({ elements: [rng.pick(['earth', 'thunder', 'water', 'fire', 'air'] as const)], tiers: new Set(ALL_TIERS) }, rng);
      const d2 = buildDeck({ elements: [rng.pick(['earth', 'thunder', 'water', 'fire', 'air'] as const)], tiers: new Set(ALL_TIERS) }, rng);
      const sd = rng.int(2 ** 31);
      tasks.push({ a: d1, b: d2, seed: sd, opts: { gridBots: [A, B] } }, { a: d1, b: d2, seed: sd, opts: { gridBots: [B, A] } });
    }
    const t = Date.now();
    const res = await runner.play(tasks);
    const w = res.reduce((x, r, i) => x + score(r, (i % 2) as 0 | 1), 0) / res.length;
    log(`${A.mode} vs ${B.mode}: ${(100 * w).toFixed(1)}% over ${res.length} games (${(res.length / ((Date.now() - t) / 1000)).toFixed(1)} games/s)`);
  } else if (cmd === 'wversus') {
    // War bot against a baseline: --a=full --b=greedy|random, random curve decks.
    const { buildDeck } = await import('./sim');
    const { Rng } = await import('./rng');
    const { ALL_TIERS } = await import('./meta');
    const { score } = await import('./lab');
    const rng = new Rng(seed);
    const tasks: GameTask[] = [];
    const A = { mode: (f.a ?? 'full') as 'full' }, B = { mode: (f.b ?? 'greedy') as 'full' };
    for (let g = 0; g < Number(f.n ?? 300); g++) {
      const d1 = buildDeck({ elements: [rng.pick(['earth', 'thunder', 'water', 'fire', 'air'] as const)], tiers: new Set(ALL_TIERS) }, rng);
      const d2 = buildDeck({ elements: [rng.pick(['earth', 'thunder', 'water', 'fire', 'air'] as const)], tiers: new Set(ALL_TIERS) }, rng);
      const sd = rng.int(2 ** 31);
      tasks.push({ a: d1, b: d2, seed: sd, opts: { warBots: [A, B] } }, { a: d1, b: d2, seed: sd, opts: { warBots: [B, A] } });
    }
    const t = Date.now();
    const res = await runner.play(tasks);
    const w = res.reduce((x, r, i) => x + score(r, (i % 2) as 0 | 1), 0) / res.length;
    log(`${A.mode} vs ${B.mode}: ${(100 * w).toFixed(1)}% over ${res.length} games (${(res.length / ((Date.now() - t) / 1000)).toFixed(1)} games/s)`);
  } else if (cmd === 'versus') {
    // Search width A against width B, same weights otherwise.
    const a = { ...WEIGHTS, width: Number(f.a ?? 3) };
    const b = { ...WEIGHTS, width: Number(f.b ?? 0) };
    const t = Date.now();
    const r = await duel(a, b, Number(f.tgames ?? 1000), seed, runner);
    log(`width ${a.width} vs width ${b.width}: ${(100 * r).toFixed(1)}% in ${((Date.now() - t) / 1000).toFixed(0)}s`);
  } else if (cmd === 'train') {
    const w = await trainBot({ runner, seed, iterations: Number(f.iters ?? 40), games: Number(f.tgames ?? 3000), log });
    if (f.write) { fs.writeFileSync(file('ai-weights.json'), JSON.stringify(rounded(w), null, 2) + '\n'); log('wrote ai-weights.json'); }
    else save('ai-weights.json', rounded(w));
  } else if (cmd === 'meta') {
    const best = await metaLoop({
      runner, seed, log,
      iterations: Number(f.iters ?? 8),
      tuneRounds: Number(f.rounds ?? 6),
      tuneGames: Number(f.tgames ?? 6000),
      season: seasonOpts,
      onCandidate: (c: MetaCandidate) => save(`meta-${c.iteration}.json`, c),
    });
    log(`best: iteration ${best.iteration}, health ${best.health.score}, ${JSON.stringify(best.structure)}`);
    save('meta-best.json', best);
    if (f.write) {
      fs.writeFileSync(file('balance-coefficients.json'), JSON.stringify(rounded(best.config.coefficients), null, 2) + '\n');
      fs.writeFileSync(file('starter-decks.json'), JSON.stringify(best.report.starters, null, 1) + '\n');
      log(`wrote balance-coefficients.json and starter-decks.json; set RULES in rules.ts to ${JSON.stringify(best.config.rules)}`);
    }
  } else {
    console.log('usage: node scripts/duel-lab.mjs season|tune|train|meta [--flags]');
  }
  await runner.close();
}

if (isMainThread) {
  main().catch(e => { console.error(e); process.exit(1); });
} else {
  parentPort!.on('message', (m: Msg) => {
    if (m.config) { applyConfig(m.config); parentPort!.postMessage({ id: m.id }); }
    if (m.tasks) parentPort!.postMessage({ id: m.id, results: playTasks(m.tasks) });
  });
}
