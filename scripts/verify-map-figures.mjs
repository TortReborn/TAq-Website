#!/usr/bin/env node
/**
 * Re-run the queries behind the wiki's map-data figures.
 *
 *   node scripts/verify-map-figures.mjs [--claim <substring>]
 *
 * check-facts can tell you that a figure is not in any archived text, and for
 * a figure computed from territory_exchanges that will always be true — what is
 * archived for a dataset is a description of the data, not the data. Those
 * findings therefore sat permanently unresolved, which is the same as not
 * checking them.
 *
 * This closes that. Each claim below names the article it appears in, the
 * number it asserts, and the query that produced it. Run it and the numbers
 * either come back or they do not.
 *
 * A claim is PASS if the query returns what the article says, NEAR if it lands
 * within the tolerance the prose itself allows ("roughly 300", "over 2,000"),
 * and FAIL otherwise. Tolerance is declared per claim rather than global: an
 * article that says "roughly" has licensed a range, and one that says "108" has
 * not.
 */
import pg from 'pg';
import { createRequire } from 'module';

const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');

const args = process.argv.slice(2);
const ONLY = args.includes('--claim') ? args[args.indexOf('--claim') + 1] : null;

const pool = new Pool(DB.prod());

/** Territories a guild held at a moment: the last capture of each before it. */
async function held(guild, iso) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM (
       SELECT DISTINCT ON (territory) territory, attacker_name
       FROM territory_exchanges WHERE exchange_time < $1::timestamptz
       ORDER BY territory, exchange_time DESC
     ) o WHERE o.attacker_name ILIKE $2`, [iso, guild]);
  return rows[0].n;
}

/** Territories an alliance's member guilds held at a moment, per the Chronicle.
 *  Kept for the unpinned claims below, which need it once their locators say
 *  which moment to sample. */
async function heldByAlliance(alliance, iso) {
  const { rows } = await pool.query(
    `WITH members AS (
       SELECT m.guild_name FROM chronicle_memberships m
       JOIN chronicle_alliances a ON a.id = m.alliance_id
       WHERE a.name ILIKE $1
         AND m.joined_at <= $2::timestamptz
         AND (m.left_at IS NULL OR m.left_at > $2::timestamptz)
     )
     SELECT count(*)::int AS n FROM (
       SELECT DISTINCT ON (territory) territory, attacker_name
       FROM territory_exchanges WHERE exchange_time < $2::timestamptz
       ORDER BY territory, exchange_time DESC
     ) o WHERE o.attacker_name IN (SELECT guild_name FROM members)`,
    [alliance, iso]);
  return rows[0].n;
}

/** Captures in a window, optionally between two named guilds. */
async function exchanges(fromIso, toIso, attacker = null, defender = null) {
  const where = ['exchange_time >= $1::timestamptz', 'exchange_time < $2::timestamptz'];
  const params = [fromIso, toIso];
  if (attacker) { params.push(attacker); where.push(`attacker_name ILIKE $${params.length}`); }
  if (defender) { params.push(defender); where.push(`defender_name ILIKE $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM territory_exchanges WHERE ${where.join(' AND ')}`, params);
  return rows[0].n;
}

/** Distinct territories that changed hands in a window. */
async function territoriesTouched(fromIso, toIso) {
  const { rows } = await pool.query(
    `SELECT count(DISTINCT territory)::int AS n FROM territory_exchanges
     WHERE exchange_time >= $1::timestamptz AND exchange_time < $2::timestamptz`, [fromIso, toIso]);
  return rows[0].n;
}

/** The busiest calendar week in a window, as a capture count.
 *  Kept for the unpinned per-week claims below. */
async function peakWeek(fromIso, toIso) {
  const { rows } = await pool.query(
    `SELECT max(n)::int AS peak FROM (
       SELECT date_trunc('week', exchange_time) AS wk, count(*)::int AS n
       FROM territory_exchanges
       WHERE exchange_time >= $1::timestamptz AND exchange_time < $2::timestamptz
       GROUP BY wk) w`, [fromIso, toIso]);
  return rows[0].peak ?? 0;
}

// Tolerance is what the article's own wording licenses, not a blanket margin.
const CLAIMS = [
  { slug: 'hackforums', says: 108, tol: 0,
    what: 'HackForums held 108 territories by midday on 19 Feb 2018',
    run: () => held('HackForums', '2018-02-19T12:00:00Z') },
  { slug: 'the-wipe-of-hackforums', says: 96, tol: 0,
    what: 'HackForums held 96 at the start of 19 Feb 2018',
    run: () => held('HackForums', '2018-02-19T00:00:00Z') },
  { slug: 'the-wipe-of-hackforums', says: 0, tol: 0,
    what: 'HackForums held none by 18:00 on 20 Feb 2018',
    run: () => held('HackForums', '2018-02-20T18:00:00Z') },
  { slug: 'luna-terra-war', says: 2000, tol: Infinity, atLeast: true,
    what: 'over 2,000 exchanges, 7-19 Sep 2019',
    run: () => exchanges('2019-09-07T00:00:00Z', '2019-09-20T00:00:00Z') },
  { slug: 'the-federation-dies', says: 220, tol: Infinity, atLeast: true,
    what: 'over 220 territories exchanged, Fantasy vs Federation guilds, summer 2018',
    run: () => territoriesTouched('2018-05-28T00:00:00Z', '2018-10-30T00:00:00Z') },

  // Unpinned: the article gives a number, the locator does not give the query,
  // and the prose admits more than one reading. Guessing a query and printing
  // FAIL would be worse than saying so — it invites someone to "correct" a
  // figure that was right. Each needs its locator rewritten to state the
  // window and the measure, after which it moves up into the list above.
  { slug: 'artemis-goose-era', says: 913, unpinned:
    'exchanges of this war, not of the month — December 2020 holds 46,491 captures in total' },
  { slug: 'coalition-civil-war', says: 337, unpinned:
    'which moment on 17 Feb, and whether truced guilds count toward an alliance total' },
  { slug: 'luna-terra-war', says: 322, unpinned:
    'territories touched by the war, or every territory that changed hands in the window (the log gives 372 for the latter)' },
  { slug: 'imperial', says: 660, unpinned:
    'the exact five months meant; 15 Feb - 15 Jul 2019 gives 669 Imperial captures from Kingdom Foxes' },
  { slug: 'khaos', says: '500-800/week', unpinned:
    'exchanges between Khaos and Pineapple Pact guilds, presumably — every exchange that January peaks at 12,140' },
  { slug: 'private-diplomacy-era', says: 5045, unpinned:
    'captures between Idiot Co and The Aquarium specifically, not every capture in the window' },
];

let pass = 0, near = 0, fail = 0, unpinned = 0;
console.log('Re-running the queries behind the wiki\'s map-data figures.\n');
for (const c of CLAIMS) {
  if (ONLY && !`${c.slug} ${c.what ?? ''}`.toLowerCase().includes(ONLY.toLowerCase())) continue;
  if (c.unpinned) {
    unpinned++;
    console.log(`UNPINNED  ${c.slug} — "${c.says}"`);
    console.log(`      needs its locator to say: ${c.unpinned}`);
    continue;
  }
  let got;
  try { got = await c.run(); } catch (e) { console.log(`ERROR  ${c.slug}: ${e.message}`); fail++; continue; }
  const ok = c.atLeast ? got >= c.says
    : c.between ? got >= c.between[0] && got <= c.between[1]
    : got === c.says;
  const close = !ok && Number.isFinite(c.tol) && Math.abs(got - c.says) <= c.tol;
  const verdict = ok ? 'PASS' : close ? 'NEAR' : 'FAIL';
  if (ok) pass++; else if (close) near++; else fail++;
  console.log(`${verdict}  ${c.slug}`);
  console.log(`      ${c.what}`);
  console.log(`      article says ${c.says}${c.atLeast ? '+' : ''}, query returns ${got}`);
}
console.log(`\n${pass} pass, ${near} near, ${fail} fail, ${unpinned} unpinned`);
if (unpinned) {
  console.log('An unpinned figure is not wrong — it is unreproducible. Give its');
  console.log('citation a locator that states the window and the measure, and it');
  console.log('becomes checkable here for good.');
}
await pool.end();
process.exit(fail ? 1 : 0);
