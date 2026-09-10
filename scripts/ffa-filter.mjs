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

// A declaration stayed in force *as amended*. This file holds the list as
// published, so for a window opening after an amendment it would be filtering
// against a superseded document — and warning about that and then printing a
// contested count is precisely the pattern that once put a September 2018
// free-for-all share onto a September 2019 war page. Where the amendments are
// known but their names are not, the honest answer is to refuse and say who
// holds them, not to filter and caveat.
const amendedBefore = (inForce.amendedOn ?? []).filter((d) => d <= from);
if (amendedBefore.length) {
  const state = (inForce.amendmentStates ?? []).find(
    (s) => from >= s.from && (s.to === null || from <= s.to),
  );
  console.error(`The declaration of ${inForce.date} was amended on ${amendedBefore.join(', ')},`);
  console.error(`and this window opens on ${from}, after ${amendedBefore.length > 1 ? 'those amendments' : 'that amendment'}.`);
  console.error('This file holds the list as published and the amended names are not in it,');
  console.error('so any figure it printed here would be computed against a superseded list.');
  if (state) {
    console.error('');
    console.error(`The pool in force for this window held ${state.count} territories `
      + `(${state.from} to ${state.to ?? 'the end of the series'}).`);
    if (state.note) console.error(`  ${state.note}`);
    console.error('');
    console.error('Do not infer from the count that the composition is unchanged — it is not');
    console.error('safe to assume that even when the number is the same.');
  }
  console.error('');
  console.error('Send the research session this window and the guilds involved; it returns');
  console.error('raw, free-for-all and contested totals computed against the state actually');
  console.error('in force. The names stay there, the numbers come back. Refusing.');
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
// An edit on the day of posting cannot be caught by a date comparison: the
// window opens at midnight and the revision lands that afternoon, so `from` is
// never less than the edit date and the refusal below never fires. The 4 June
// 2018 list was posted at 14:38 and edited at 19:05, and a capture from that
// afternoon is being tested against text that may postdate it. Refusing the
// whole day would throw away a list that is right for every later window, so
// this warns instead and the prose has to carry it.
if (inForce.editedAfterPosting && from === inForce.date && inForce.editedAfterPosting === inForce.date) {
  console.log(`NOTE: the declaration of ${inForce.date} was edited later the same day.`);
  console.log('This window opens on that date, and a day-granularity check cannot tell');
  console.log('a capture before the revision from one after it. Captures from the day');
  console.log('itself are filtered against text that may postdate them — say so if a');
  console.log('figure from this window is used, or open the window a day later.');
  console.log('');
}

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

// Some ground is on the list because of how it behaved, not because anyone
// declared it: a territory changing hands repeatedly among member guilds with
// nobody complaining is open ground, and that is sometimes the only evidence
// there is. It is also evidence of exactly the kind this tool consumes, so
// filtering a window's captures against a pool inferred from those same
// captures is circular and would print a figure that is partly its own premise.
// The inference is worth keeping; using it silently is not.
const behavioural = (inForce.behaviouralEvidence ?? []).filter(
  (b) => b.finding === 'open' && from < b.window.to && to > b.window.from,
);
// A derived list may already name the inferred territory — the inference is why
// it is on the list at all. Deduplicate, or the printed size is a territory out.
const ffa = [...new Set([
  ...(inForce.territories ?? []),
  ...(inForce.alsoUnassigned ?? []),
  ...behavioural.map((b) => b.territory),
])];

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

// The declarations and the capture log do not spell every territory the same
// way, and exact equality turns a spelling difference into a silent under-
// subtraction — always in the same direction, inflating the contested count,
// which is the only figure this tool says may be cited as hostility.
//
// Two real cases: seven consecutive lists name "Battle Tower (ToA)" where the
// log says "Battle Tower", so 10,419 exchanges on that square never matched;
// and the log itself holds "Ranol's Farm" under both an ASCII and a curly
// apostrophe. So both sides are normalised for comparison — trailing
// parenthetical stripped, apostrophes folded, case ignored — while the register
// keeps the declaration's own wording, which is what it is for.
// No regex here on purpose. The obvious pattern for "strip a trailing
// parenthetical" is a backslash-escaped one, and this connection eats the
// backslashes: `\s*\([^)]*\)\s*$` arrived as an unescaped group and matched the
// whole string, so "Battle Tower" normalised to "" and matched nothing — a
// silent zero that looked exactly like a clean result. split_part cannot do
// that.
const CURLY = '’';
const NORM = (col) =>
  `btrim(split_part(lower(replace(${col}, '${CURLY}', '''')), ' (', 1))`;

const { rows } = await pool.query(
  `SELECT count(*)::int AS total,
          count(*) FILTER (WHERE ${NORM('territory')} = ANY(
            SELECT ${NORM('x')} FROM unnest(${ffaParam}::text[]) AS x))::int AS on_ffa,
          count(DISTINCT territory)::int AS terrs
   FROM territory_exchanges WHERE ${where.join(' AND ')}`,
  params,
);

// A list name that matches nothing in the whole log is a name this filter is
// not subtracting, and nothing else would ever say so.
const { rows: unmatched } = await pool.query(
  `SELECT x AS name FROM unnest($1::text[]) AS x
    WHERE NOT EXISTS (SELECT 1 FROM territory_exchanges te
                       WHERE ${NORM('te.territory')} = ${NORM('x')})`,
  [ffa],
);
if (unmatched.length) {
  console.log(`WARNING: ${unmatched.length} name(s) on the ${inForce.date} list match no territory in the`);
  console.log('capture log, so nothing is being subtracted for them and the contested figure');
  console.log('below is too high by however many exchanges they carried:');
  for (const u of unmatched) console.log(`   ${u.name}`);
  console.log('');
}
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
// A recorded doubt about the list is worth as much as a recorded amendment and
// is easier to forget, because nothing downstream fails when it is ignored. If
// the register knows a map went up in this window whose pool nobody has read,
// the figure below rests on an assumption and the run should say so.
for (const q of inForce.openQuestions ?? []) {
  if (from < q.date) continue;
  console.log(`           ^ OPEN QUESTION on this list, raised ${q.date}:`);
  console.log(`             ${q.question}`);
  console.log(`             ${q.consequence}`);
  console.log(`             Resolve by: ${q.resolvedBy}`);
  console.log('');
}

for (const b of behavioural) {
  console.log('');
  console.log(`           ^ ${b.territory} is counted as open on inferred evidence, not a`);
  console.log(`             declaration (${b.window.from} to ${b.window.to}). ${b.basis.split('.')[0]}.`);
  console.log('             Because that inference is drawn from capture behaviour, a figure');
  console.log('             below that leans on it is partly its own premise. Say so in the');
  console.log('             prose, or run again without the window that needs it.');
}
console.log('');
console.log(`raw captures        ${r.total.toLocaleString()}  across ${r.terrs} territories`);
console.log(`on FFA ground       ${r.on_ffa.toLocaleString()}  (${pct}%)`);
console.log(`contested captures  ${kept.toLocaleString()}   <- the only figure that may be cited as hostility`);

await pool.end();
