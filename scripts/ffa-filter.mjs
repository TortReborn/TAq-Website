#!/usr/bin/env node
/**
 * Recompute a capture claim with free-for-all ground taken out.
 *
 *   node scripts/ffa-filter.mjs --from 2018-09-01 --to 2018-09-16
 *   node scripts/ffa-filter.mjs --from 2018-09-01 --to 2018-09-16 --attacker "BuildCraftia"
 *   node scripts/ffa-filter.mjs --from 2018-08-01 --to 2018-09-01 --attacker X --defender Y
 *
 * The Coalition and then the Federation published lists of territories that
 * were open to anyone. Taking one was not an act of war against whoever held
 * it a minute earlier — several sat on the busiest ground on the map and turned
 * over constantly. So a capture count offered as evidence that two parties were
 * hostile, or that one had left an alliance, has to have that churn removed
 * first, or it is measuring the map's noise floor.
 *
 * The lists changed size through 2018, from twelve territories to twenty-three.
 * Borrowing a neighbouring month's list is the specific mistake this exists to
 * stop: a March list applied to a February window over-subtracted and produced
 * a figure that reached a page.
 *
 * Prints the raw count, the FFA-only count, and the count that survives — and
 * says which list it used and how far its date is from the window. Judgement
 * about whether the surviving number supports the claim stays with the writer.
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { createRequire } from 'module';

const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');

const args = process.argv.slice(2);
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);

const from = arg('--from');
const to = arg('--to');
if (!from || !to) {
  console.error('usage: ffa-filter.mjs --from YYYY-MM-DD --to YYYY-MM-DD [--attacker G] [--defender G] [--involving G]');
  process.exit(2);
}
const attacker = arg('--attacker');
const defender = arg('--defender');
// Either side. A guild fighting a bloc is the attacker on some exchanges and
// the defender on others, and the claim is nearly always about the pair.
const involving = arg('--involving');

const timeline = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'data/wiki/research/ffa-timeline.json'), 'utf8'),
);

/** The list in force at the window's start: latest declaration on or before it. */
const inForce = timeline.lists.filter((l) => l.date <= from).at(-1);
if (!inForce) {
  console.error(`No FFA list published on or before ${from}. Earliest is ${timeline.lists[0].date}.`);
  console.error('Do not substitute a later one — say in the prose that the FFA position is unknown.');
  process.exit(1);
}

const days = Math.round((Date.parse(from) - Date.parse(inForce.date)) / 86400000);

// Beyond this the list is not evidence about the window, and saying so with a
// warning is not enough: a run that printed "stale" and then a contested count
// put a September 2018 free-for-all share onto a September 2019 war page. The
// lists were reissued every three to eight weeks while the institution was
// alive, so a gap this long means it had lapsed or moved somewhere unrecorded.
const STALE_DAYS = 90;
if (days > STALE_DAYS) {
  console.error(`Nearest FFA declaration is ${inForce.date}, ${days} days before ${from}.`);
  console.error(`Nothing was published within ${STALE_DAYS} days of this window, so the`);
  console.error('free-for-all position for it is not recoverable. Refusing to filter.');
  console.error('');
  console.error('Say in the prose that no list was published for the window. Do not');
  console.error('subtract an older one, and do not quote a share computed against it —');
  console.error('that share is a fact about the older list, not about this window.');
  process.exit(1);
}

if (inForce.territories === null) {
  const size = inForce.count === null || inForce.count === undefined
    ? 'an unrecorded number of'
    : `${inForce.count}`;
  console.log(`FFA declaration in force at ${from}: ${inForce.date} — ${inForce.kind}, ${size} territories, names not recorded.`);
  console.log(inForce.note ?? '');
  console.log('\nThe count cannot be filtered, only bounded. Report the raw figure and say in');
  console.log('the prose that the free-for-all position for this window is not recoverable.');
  console.log('Do not substitute a later list: the earliest enumerated one is 10 March 2018.');
  process.exit(1);
}

const ffa = [...(inForce.territories ?? []), ...(inForce.alsoUnassigned ?? [])];

const pool = new Pool(DB.prod());
const where = ['exchange_time >= $1::timestamptz', 'exchange_time < $2::timestamptz'];
const params = [from, to];
if (attacker) { params.push(attacker); where.push(`attacker_name = $${params.length}`); }
if (defender) { params.push(defender); where.push(`defender_name = $${params.length}`); }
if (involving) {
  params.push(involving);
  where.push(`(attacker_name = $${params.length} OR defender_name = $${params.length})`);
}
params.push(ffa);
const ffaParam = `$${params.length}`;

const { rows } = await pool.query(
  `SELECT count(*)::int AS total,
          count(*) FILTER (WHERE territory = ANY(${ffaParam}))::int AS on_ffa,
          count(DISTINCT territory)::int AS terrs
   FROM territory_exchanges WHERE ${where.join(' AND ')}`,
  params,
);
const r = rows[0];
const kept = r.total - r.on_ffa;
const pct = r.total ? ((r.on_ffa / r.total) * 100).toFixed(1) : '0.0';

console.log(`window     ${from} to ${to}`);
if (attacker) console.log(`attacker   ${attacker}`);
if (defender) console.log(`defender   ${defender}`);
if (involving) console.log(`involving  ${involving} (either side)`);
console.log(`FFA list   ${inForce.date} (${ffa.length} territories, declared ${days} day(s) before the window)`);
if (days > 45) console.log(`           ^ stale: nothing was published nearer. Say so if the figure is used.`);
console.log('');
console.log(`raw captures        ${r.total.toLocaleString()}  across ${r.terrs} territories`);
console.log(`on FFA ground       ${r.on_ffa.toLocaleString()}  (${pct}%)`);
console.log(`contested captures  ${kept.toLocaleString()}   <- the only figure that may be cited as hostility`);

await pool.end();
