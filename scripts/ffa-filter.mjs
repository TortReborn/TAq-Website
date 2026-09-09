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

// Periods with no declaring body at all. After an alliance dissolves, its last
// declaration is not "the list still in force" — it is a document issued by
// something that no longer exists. The ground kept being fought over and the
// arrangements were carried forward guild to guild, unpublished and unbinding.
for (const gap of timeline.noListInForce ?? []) {
  if (from >= gap.from && from < gap.to) {
    console.error(`No alliance free-for-all list was in force between ${gap.from} and ${gap.to}.`);
    console.error(gap.reason);
    console.error('');
    console.error('Report the raw figure and say in the prose that no list governed the window.');
    console.error('Do not reach back for the last declaration before it.');
    process.exit(1);
  }
}

// Declarations the research session has ruled unusable for a stated span.
if (inForce.unusableUntil && from < inForce.unusableUntil) {
  console.error(`The declaration of ${inForce.date} may not be used for windows before ${inForce.unusableUntil}.`);
  console.error(inForce.note?.match(/RULING:[\s\S]*/)?.[0] ?? '');
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

// Two different reasons a list can have no names here, and they are not the
// same fact about the past. A map-only declaration's names were never written
// down by anybody. A withheld one's names exist, in the research vault, and are
// kept out of this file because the declaration — this alliance, these
// territories, this date — is archive content from a channel that is not one of
// the thirteen sanctioned exports. Saying "not recorded" for the second would be
// this file telling a lie about the record in order to keep a secret.
if (inForce.territories === null) {
  const withheld = inForce.kind === 'listed';
  const size = inForce.count ?? 'an unpublished number of';
  console.log(`FFA declaration in force at ${from}: ${inForce.date} — ${inForce.kind}, ${size} territories, ` +
    (withheld ? 'names held in the research vault.' : 'names never written down.'));
  console.log(inForce.note ?? '');
  if (withheld) {
    console.log('\nRun with --territories to get the list this window needs filtered, send it');
    console.log('to the research session, and it returns raw / free-for-all / contested.');
    console.log('The figures come back the same; the declaration does not move.');
  } else {
    console.log('\nThe count cannot be filtered, only bounded. Report the raw figure and say in');
    console.log('the prose that the free-for-all position for this window is not recoverable.');
    console.log('Do not substitute a later list: the earliest enumerated one is 10 March 2018.');
  }
  if (!args.includes('--territories')) process.exit(1);
}

// Discord exports keep only a message's final text. Where a declaration was
// revised days later, the list we hold is the revised one, and a capture that
// happened between the posting and the revision would be filtered against a
// document that may not yet have said what it now says.
if (inForce.editedAfterPosting && from < inForce.editedAfterPosting) {
  console.error(`The declaration of ${inForce.date} was edited on ${inForce.editedAfterPosting},`);
  console.error(`and this window opens on ${from}, inside that gap. The archive holds only the`);
  console.error('revised text, so filtering these captures against it would test them against a');
  console.error('list that may not yet have said what it now says. Refusing.');
  console.error('');
  console.error(`Start the window on ${inForce.editedAfterPosting} or later, or use the previous`);
  console.error('declaration and say in the prose which document the figure rests on.');
  process.exit(1);
}

const ffa = [...(inForce.territories ?? []), ...(inForce.alsoUnassigned ?? [])];

const pool = new Pool(DB.prod());

// --territories: emit the window's ground and its volume, for a window whose
// declaration this file does not hold. This is our data going out, not theirs
// coming in — the research session marks which of these were free-for-all on
// the date in force and returns the totals.
if (args.includes('--territories')) {
  const w = ['exchange_time >= $1::timestamptz', 'exchange_time < $2::timestamptz'];
  const p = [from, to];
  if (attacker) { p.push(attacker); w.push(`attacker_name = $${p.length}`); }
  if (defender) { p.push(defender); w.push(`defender_name = $${p.length}`); }
  if (involving) { p.push(involving); w.push(`(attacker_name = $${p.length} OR defender_name = $${p.length})`); }
  const { rows: t } = await pool.query(
    `SELECT territory, count(*)::int AS n FROM territory_exchanges
     WHERE ${w.join(' AND ')} GROUP BY 1 ORDER BY 2 DESC, 1`, p);
  const total = t.reduce((a, r) => a + r.n, 0);
  console.log(`\n# window ${from} to ${to}${involving ? ', involving ' + involving : ''}` +
    `${attacker ? ', attacker ' + attacker : ''}${defender ? ', defender ' + defender : ''}`);
  console.log(`# ${total.toLocaleString()} exchanges across ${t.length} territories.`);
  console.log(`# FFA declaration in force: ${inForce.date} (${inForce.count} territories).`);
  console.log('# Mark the free-for-all ones and return raw / free-for-all / contested.\n');
  for (const r of t) console.log(String(r.n).padStart(6) + '  ' + r.territory);
  await pool.end();
  process.exit(0);
}
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
// A declaration stayed in force as amended, not unchanged. This script holds the
// list as published, so for a window after an amendment it is filtering against
// a slightly superseded document.
const amended = (inForce.amendedOn ?? []).filter((d) => d <= from);
if (amended.length) {
  console.log(`           ^ amended on ${amended.join(', ')} — this filter uses the list as`);
  console.log(`             published, so it is out by whatever those amendments changed.`);
}
console.log('');
console.log(`raw captures        ${r.total.toLocaleString()}  across ${r.terrs} territories`);
console.log(`on FFA ground       ${r.on_ffa.toLocaleString()}  (${pct}%)`);
console.log(`contested captures  ${kept.toLocaleString()}   <- the only figure that may be cited as hostility`);

await pool.end();
