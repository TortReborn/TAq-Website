#!/usr/bin/env node
/**
 * Find the days the capture log has no rows for.
 *
 *   node scripts/check-log-gaps.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--min N]
 *
 * A guild that vanishes from the exchange record is one of the corpus's better
 * observations — Fantasy's eighteen-day absence in 2018 is a real fact, because
 * the map recorded twelve hundred exchanges a day throughout it. The same shape
 * means nothing if the log itself stopped: there is a sixteen-day hole in
 * 2021 that swallows the Artemis merger talks entirely, and a before-and-after
 * comparison across it looks exactly like a war starting.
 *
 * So before writing that anybody disappeared, check whether the log did. This
 * lists every run of days with no rows at all, longest first.
 */
import pg from 'pg';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);

const from = arg('--from', '2018-01-01');
const to = arg('--to', new Date().toISOString().slice(0, 10));
const min = Number(arg('--min', 2));

const pool = new pg.Pool(DB.prod());
const { rows } = await pool.query(
  `SELECT date_trunc('day', exchange_time)::date AS d
   FROM territory_exchanges WHERE exchange_time >= $1::timestamptz AND exchange_time < $2::timestamptz
   GROUP BY 1 ORDER BY 1`, [from, to]);
await pool.end();

const have = new Set(rows.map((r) => r.d.toISOString().slice(0, 10)));
const gaps = [];
let run = null;
for (let t = Date.parse(from); t < Date.parse(to); t += 86_400_000) {
  const d = new Date(t).toISOString().slice(0, 10);
  if (have.has(d)) { if (run) { gaps.push(run); run = null; } }
  else if (run) run.end = d;
  else run = { start: d, end: d };
}
if (run) gaps.push(run);

const days = (g) => Math.round((Date.parse(g.end) - Date.parse(g.start)) / 86_400_000) + 1;
const big = gaps.filter((g) => days(g) >= min).sort((a, b) => days(b) - days(a));

console.log(`${from} to ${to}: ${have.size} days with rows, ${gaps.length} gap(s), ${big.length} of ${min}+ days.\n`);
for (const g of big) {
  console.log(`  ${String(days(g)).padStart(3)} days   ${g.start} to ${g.end}`);
}
console.log('\nA guild missing from the log inside one of these has not been shown to be');
console.log('missing from the map. Say the record stops, not that the fighting did.');
