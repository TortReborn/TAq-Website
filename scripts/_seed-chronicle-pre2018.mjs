/**
 * Backfill Chronicle alliances and events for 2014-2017.
 *
 * The chronicle layer began at February 2018 because that is where the
 * territory-exchange log begins. The map now runs from the Guild Update, so
 * the layer needs the era before it: the alliances people actually fought in
 * and the events that turned the map over.
 *
 * Every date and roster below comes from the Chronicle wiki (data/wiki/
 * seed-articles.json), which cites its sources per claim. Every membership is
 * closed: an unrecorded dissolution is not an alliance that never ended, and an
 * open row draws a band from 2016 to the present day. Where no end was recorded
 * the band closes at the last dated evidence, and the description says so.
 *
 * Idempotent: alliances are matched by name and events by title, so re-running
 * changes nothing. Existing rows are never modified except to add pre-2018
 * memberships to alliances that already exist (Valkyrie, Coalition).
 *
 * Target follows the convention of seed-wiki-articles.mjs:
 *   node scripts/_seed-chronicle-pre2018.mjs --prod --dry-run
 *   node scripts/_seed-chronicle-pre2018.mjs --prod --apply
 *   node scripts/_seed-chronicle-pre2018.mjs --dev  --apply   (TEST_DB_*)
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTHOR = 'chronicle-backfill';

const unquote = (v) => v.replace(/^(['"])(.*)\1$/s, '$2');
for (const name of ['.env', '.env.local']) {
  const p = path.join(__dirname, '..', name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = unquote(t.slice(i + 1).trim());
  }
}

const apply = process.argv.includes('--apply');
const useProd = process.argv.includes('--prod');
if (!apply && !process.argv.includes('--dry-run')) {
  console.error('Pass --dry-run or --apply.');
  process.exit(2);
}
if (!useProd && !process.argv.includes('--dev')) {
  console.error('Pass --dev (TEST_DB_*) or --prod (DB_*).');
  process.exit(2);
}
/** DB_* in prod, TEST_DB_* in dev — the app picks the same way via TEST_MODE. */
const env = (n) => (useProd ? process.env[n] : process.env['TEST_' + n]);

const D = (s) => `${s}T00:00:00Z`;

/** Every membership here must have an end. An unrecorded dissolution is not an
 *  alliance that never ended, and an open row draws a band to the present day. */
function assertAllClosed(groups) {
  const open = [];
  for (const g of groups) for (const [guild, , left] of g.members) if (!left) open.push(`${g.name} / ${guild}`);
  if (open.length) { console.error('Open memberships are not allowed:\n  ' + open.join('\n  ')); process.exit(1); }
}

/* ---------------------------------------------------------------- alliances */
const ALLIANCES = [
  {
    name: 'Legio Praetoria', tag: 'Legio', color: '#8d6e63', kind: 'war',
    description: 'One of the earliest Wynncraft alliances, founded in early March 2015 by KnightOfValor, Imperial, Nether\'s Ascent and Kangronomicon. Two of the four left on 5 June 2015 and it collapsed about a month later; it was afterwards cited repeatedly as the standard example of an alliance destroyed from within.',
    members: [
      ['KnightOfValor', '2015-03-01', '2015-06-05'],
      ['Imperial', '2015-03-01', '2015-06-05'],
      ["Nether's Ascent", '2015-03-01', '2015-07-01'],
      ['Kangronomicon', '2015-03-01', '2015-07-01'],
    ],
  },
  {
    name: 'Concordia', tag: 'Con', color: '#5e8c6a', kind: 'war',
    description: 'The war alliance of autumn 2015, founded by the guild Validus under Ezura to break the hold of Kangronomicon and Nether\'s Ascent on the territory map. It peaked in October 2015, was answered by the creation of Ordo Malleus on 6 November, and was declared disbanded on a forum thread two days later.',
    members: [
      ['Validus', '2015-07-05', '2015-11-08'],
      ['Travellers', '2015-07-05', '2015-11-08'],
      ['Historical', '2015-07-05', '2015-11-08'],
      ['Holders of LE', '2015-07-05', '2015-08-15'],
    ],
  },
  {
    name: 'Ordo Malleus', tag: 'Ordo', color: '#c0392b', kind: 'war',
    description: 'The Order of the Hammer, dominant war alliance of the winter of 2015-16. Founded on 6 November 2015 by seven guilds to defeat Concordia, it held the map through a system of designated territories, grew to twelve members by February 2016, and broke apart over three days in March after three founding guilds left in sixteen.',
    members: [
      ['Kangronomicon', '2015-11-06', '2016-03-11'],
      ['Holders of LE', '2015-11-06', '2016-03-11'],
      ['Ha Ha United', '2015-11-06', '2016-03-11'],
      ['End of Everything', '2015-11-06', '2016-03-11'],
      ['HackForums', '2015-11-06', '2016-02-01'],
      ['ToastedPandas', '2015-11-06', '2016-03-11'],
      ['Sinners', '2015-11-06', '2016-03-11'],
      ['Libertas', '2015-12-01', '2016-03-11'],
      ['UltimateXeons', '2016-01-15', '2016-03-11'],
    ],
  },
  {
    name: 'Vesta', tag: 'Vesta', color: '#3f51b5', kind: 'war',
    description: 'A fourteen-guild alliance created on 10 December 2015 by 3zPz from the remnants of Concordia. Larger on paper than Ordo Malleus, it fought no recorded campaign and was declared dead a month later.',
    members: [
      ['Historical', '2015-12-10', '2016-01-10'], ['Validus', '2015-12-10', '2016-01-10'],
      ['Travellers', '2015-12-10', '2016-01-10'], ['TheNoLifes', '2015-12-10', '2016-01-10'],
      ['Super Crafters', '2015-12-10', '2016-01-10'], ['Wynn Try Hards', '2015-12-10', '2016-01-10'],
      ['Da Classy Goats', '2015-12-10', '2016-01-10'], ['NightStriders', '2015-12-10', '2016-01-10'],
      ['BOOM', '2015-12-10', '2016-01-10'], ['Frosted Pants', '2015-12-10', '2016-01-10'],
      ['Omegamine', '2015-12-10', '2016-01-10'], ['Silver of Anarchy', '2015-12-10', '2016-01-10'],
      ['IceBlue Team', '2015-12-10', '2016-01-10'], ['Artifact', '2015-12-10', '2016-01-10'],
    ],
  },
  {
    name: 'Halcyon', tag: 'Hal', color: '#26a69a', kind: 'community',
    description: 'A two-guild community alliance founded on 5 June 2016 between ToastedPandas and Holders of LE, announced by Yamipanda with Drew1011 as co-signatory. Explicitly a mutual-aid and social pact rather than a war bloc. No dissolution was recorded and it was never mentioned again after June 2016, which is where the band ends.',
    members: [['ToastedPandas', '2016-06-05', '2016-06-30'], ['Holders of LE', '2016-06-05', '2016-06-30']],
  },
  {
    name: 'The Banhammer', tag: 'Ban', color: '#ef6c00', kind: 'war',
    description: 'An open anti-HackForums alliance of June 2016, opened by Mr_Robin_Hood on 8 June as a universal non-aggression pact among smaller guilds against a guild then holding 94 territories. Ten days later participants reported Hax reduced to almost none, a reversal disputed at the time which did not last. No end was recorded; it was active through at least 29 June 2016, which is where the band ends.',
    members: [
      ['World of Crafters', '2016-06-08', '2016-06-29'],
      ['The Wynn Guard', '2016-06-08', '2016-06-29'],
      ['MythicZodiac', '2016-06-10', '2016-06-29'],
    ],
  },
  {
    name: 'The Separatists', tag: 'Sep', color: '#795548', kind: 'war',
    description: 'A Star Wars-themed open-enrolment alliance founded on 26 June 2016 by Tapu_Fini around the guild The Anarchy, the second of the two anti-HackForums blocs of that month. Its founder claimed attacks on the Hax-Libertas bloc around Ragni and Katoa Ranch; neither anti-Hax bloc changed the map. No dissolution was recorded and it was last mentioned on 1 July 2016, which is where the band ends.',
    members: [['The Anarchy', '2016-06-26', '2016-07-01']],
  },
  {
    name: 'Seraphim', tag: 'Ser', color: '#c9a227', kind: 'community',
    description: 'A self-consciously unserious community alliance opened on 8 August 2016 by Dacleos, declaring itself "100% community based" with "no intention of actively providing support for guild wars". Its four recorded members included Libertas, then the second-largest territory holder on the map. No dissolution was recorded; the opening post was last revised on 20 August 2016, which is where the band ends.',
    members: [
      ['Saltiest', '2016-08-08', '2016-08-20'], ['Libertas', '2016-08-08', '2016-08-20'],
      ['FOX', '2016-08-08', '2016-08-20'], ['Holders of LE', '2016-08-08', '2016-08-20'],
    ],
  },
  {
    name: 'Lux Imperius', tag: 'Lux', color: '#7e57c2', kind: 'community',
    description: 'A closed, invite-only community alliance of late 2016 founded by five guild leaders around Dragon\'s Arise and UltimateXeons. Its roster reached seven guilds and it took no part in the territory war. No dissolution was ever recorded; the last roster stood on 25 October 2016, which is where the band ends.',
    members: [
      ["Dragon's Arise", '2016-09-16', '2016-10-25'], ['UltimateXeons', '2016-09-16', '2016-10-25'],
      ['Eternal Legacy', '2016-09-16', '2016-10-25'], ['WarLords', '2016-09-16', '2016-10-25'],
      ['GrimNation', '2016-09-16', '2016-10-25'], ['Beasts', '2016-09-16', '2016-10-25'],
      ['Aquafinity', '2016-10-02', '2016-10-25'],
    ],
  },
  {
    name: 'Aurelion', tag: 'Aur', color: '#ec407a', kind: 'community',
    description: 'A four-guild community alliance formed in February 2017 around House of Sentinels, with Hippies of Snuggles, The Dark Phoenix and Dragons Arise joining over the following fortnight. It ran its own Discord and last appears in April 2017; no war activity is recorded for it.',
    members: [
      ['House of Sentinels', '2017-02-14', '2017-04-30'],
      ['Hippies of Snuggles', '2017-02-15', '2017-04-30'],
      ['The Dark Phoenix', '2017-02-26', '2017-04-30'],
      ['Dragons Arise', '2017-02-27', '2017-04-30'],
    ],
  },
  {
    name: 'Emperium of Wynn', tag: 'Emp', color: '#00897b', kind: 'community',
    description: 'Founded on 21 April 2017 and dissolved that October, governed by an Emperator, a Shadow Advisor, a High Council and a bench of judges. By its fall on 17 October 2017 Angry_will was Emperator, Drew1011 Shadow Advisor, and Kingdom Foxes among its four remaining member guilds.',
    members: [
      ['UltimateXeons', '2017-04-21', '2017-10-17'], ['Sinners', '2017-04-21', '2017-10-17'],
      ['LE Flowers', '2017-04-21', '2017-10-17'], ['TheNoLifes', '2017-04-21', '2017-10-17'],
      ['IceBlue Team', '2017-04-21', '2017-10-17'], ['TheForsaken', '2017-04-21', '2017-10-17'],
      ['Beasts', '2017-04-21', '2017-10-17'], ['The Divine Souls', '2017-04-21', '2017-10-17'],
      ['BuildCraftia', '2017-04-21', '2017-10-17'], ['Sins of Seedia', '2017-04-21', '2017-10-17'],
      ['Titans Valor', '2017-04-21', '2017-10-17'], ['Kingdom Foxes', '2017-04-21', '2017-10-17'],
    ],
  },
  {
    name: 'War Syndicate', tag: 'WS', color: '#546e7a', kind: 'war',
    description: 'The Coalition\'s principal opponent in the winter of 2017, created on 17 July 2017 and destroyed in the Gavel Invasion of 21-25 December. It never posted on the forums under its own name, but its charter survives, naming eleven member guilds, a 24-territory cap on every guild on the map, and a rule against attacking the province of Wynn.',
    members: [
      ['BuildCraftia', '2017-07-17', '2017-12-25'], ['Sins of Seedia', '2017-07-17', '2017-12-23'],
      ['DogsAmongUs', '2017-07-17', '2017-12-25'], ['Tranquility', '2017-07-17', '2017-12-25'],
      ['Fantasy', '2017-07-17', '2017-12-15'], ['TheOldKeepers', '2017-07-17', '2017-12-25'],
      ['The Divine Souls', '2017-07-17', '2017-12-25'], ['The Divine Swords', '2017-07-17', '2017-12-25'],
      ['Titans Valor', '2017-07-17', '2017-12-25'], ['DeadBushes', '2017-07-17', '2017-12-25'],
      ['Serpentem Empire', '2017-07-17', '2017-12-25'],
    ],
  },
];

/* Pre-2018 memberships for alliances the layer already carries. */
const BACKFILL = [
  {
    name: 'Valkyrie',
    // Valkyrie outlived the era; the band closes at its last dated appearance.
    members: [['Kingdom Foxes', '2015-06-02', '2022-09-19'], ['Imperial', '2015-06-02', '2022-09-19']],
  },
  {
    name: 'Coalition',
    members: [
      // The Coalition shattered on 16 February 2018 when Alliance Alliance split.
      ['Kingdom Foxes', '2017-10-19', '2018-02-16'], ['KingdomPhoenixes', '2017-10-19', '2018-02-16'],
      ['Gilded Sparrows', '2017-11-17', '2018-02-16'], ['House of Sentinels', '2017-11-01', '2018-02-16'],
    ],
  },
];

/* ------------------------------------------------------------------- events */
const EVENTS = [
  ['other', 'The Guild Update', 'Version 1.13, the Wynnter Update, adds guilds and guild wars on 22 December 2014 — the starting point of all guild warfare history. Nether\'s Ascent and Holders of LE were created the day before, Kangronomicon on the 23rd and HackForums on the 24th.', '2014-12-22', null, []],
  ['founding', 'Legio Praetoria forms', 'KnightOfValor, Imperial, Nether\'s Ascent and Kangronomicon form what a later recollection calls the first mega alliance.', '2015-03-01', null, ['KnightOfValor', 'Imperial', "Nether's Ascent", 'Kangronomicon']],
  ['founding', 'Valkyrie is founded', 'Kingdom of Foxes and Imperial found what becomes the longest-lived alliance in Wynncraft history, still active as late as September 2022.', '2015-06-02', null, ['Kingdom Foxes', 'Imperial']],
  ['founding', 'Concordia forms', 'Validus, under its leader Ezura, builds an alliance out of guilds that resented the control of the map by Kangronomicon and Nether\'s Ascent.', '2015-07-05', null, ['Validus']],
  ['war', 'Concordia at its peak', 'Validus and Travellers hold the overwhelming majority of Wynn. Holders of LE are reduced to a Detlas pocket and Kangronomicon appear nowhere on the map.', '2015-10-01', null, ['Validus', 'Travellers']],
  ['founding', 'Ordo Malleus is created', 'Seven guilds organise under Paladin A\'renos for the sole stated purpose of defeating Concordia.', '2015-11-06', null, ['Kangronomicon', 'Holders of LE', 'ToastedPandas']],
  ['disband', 'Concordia is declared disbanded', '3zPz posts a thread declaring the alliance disbanded, two days after Ordo Malleus was created to defeat it.', '2015-11-08', null, ['Validus']],
  ['founding', 'Vesta is created', '3zPz assembles fourteen guilds from the Concordia remnant. Larger on paper than Ordo Malleus, it fights no recorded campaign.', '2015-12-10', null, ['Historical', 'Validus']],
  ['other', 'Gavel opens', 'The Gavel province is released and the whole map is frozen for roughly two weeks afterwards, so guilds holding good territory when it landed kept it. ToastedPandas, which had captured the entire jungle days earlier, rose to guild level 51 during the freeze.', '2015-12-21', null, ['ToastedPandas']],
  ['disband', 'Vesta is declared dead', 'A month after its creation the alliance is declared dead, having fought no recorded campaign.', '2016-01-10', null, []],
  ['disband', 'Ordo Malleus falls', 'Three founding guilds leave in sixteen days and the alliance breaks apart over three, ending the dominant bloc of the winter.', '2016-03-09', '2016-03-11', ['Kangronomicon', 'ToastedPandas', 'Holders of LE']],
  ['founding', 'The Banhammer opens', 'Mr_Robin_Hood proposes a universal non-aggression pact so smaller guilds can hold land against HackForums, then on 94 territories. It is the first of two anti-Hax blocs formed within three weeks.', '2016-06-08', null, ['HackForums']],
  ['founding', 'The Separatists form', 'Tapu_Fini founds the second anti-HackForums bloc of the month around the guild The Anarchy. Neither bloc changed the map.', '2016-06-26', null, ['The Anarchy', 'HackForums']],
  ['disband', 'The Kingdom of Foxes is disbanded', 'LoveLusting disbands the guild; rogue HackForums members re-register the name and tag the next day, which is why the revival needed a new name.', '2016-07-02', null, ['Kingdom Foxes']],
  ['other', 'HackForums take the map', 'The community timeline dates Hax\'s dominance to the summer of 2016 and attributes it to a glitch. They held 94 territories on 8 June and 146 by late September.', '2016-07-15', null, ['HackForums']],
  ['other', 'The guild leaderboard capture', 'The only machine-readable record of the pre-2018 map: an archived API capture showing 26 guilds holding 332 territories, with HackForums on 146, Libertas on 60 and UltimateXeons on 53.', '2016-09-23', null, ['HackForums', 'Libertas', 'UltimateXeons']],
  ['founding', 'The Kingdom of Foxes is revived', 'Drew1011, LoveLusting, Pyrias and Killerfish revive the guild as Foxton Legacy, a new name being needed because the Fox name and tag had been re-registered by outsiders. The original name and tag were negotiated back on 3 December.', '2016-11-24', null, ['Kingdom Foxes']],
  ['founding', 'The Emperium of Wynn is founded', 'Twelve guilds under an Emperator, a Shadow Advisor, a High Council and a bench of judges — the era\'s most elaborate institution.', '2017-04-21', null, ['UltimateXeons', 'Sinners', 'TheNoLifes']],
  ['other', 'HackForums at their record', 'Hax\'s own recruitment thread advertises "#1 Guild on the statistics board holding 300+ territories", a line dated quotes carry from 15 June. Three weeks earlier an outsider had asked why Hax held more than 300 when a mob-spawning bug stopped anyone else taking any. On 18 July a member conceded the number was "less than 300"; the maximum was later recalled as close to 350.', '2017-06-15', '2017-07-18', ['HackForums']],
  ['founding', 'War Syndicate is created', 'Eleven guilds form off the forums with a 24-territory cap on every guild on the map and a rule against attacking Wynn, expressly to bring down HackForums.', '2017-07-17', null, ['BuildCraftia', 'Sins of Seedia', 'Titans Valor']],
  ['disband', 'The Emperium of Wynn falls', 'The alliance dissolves with Angry_will as Emperator, Drew1011 as Shadow Advisor and four member guilds remaining.', '2017-10-17', null, []],
  ['founding', 'The Coalition forms', 'Kingdom Foxes and KingdomPhoenixes found the alliance jointly, with Gilded Sparrows and House of Sentinels following; planning began around 19 October.', '2017-10-19', null, ['Kingdom Foxes', 'KingdomPhoenixes', 'Gilded Sparrows', 'House of Sentinels']],
  ['war', 'The Coalition takes the Wynn mainland', 'Every mainland territory falls to a Coalition guild. The only holdings left outside the alliance are Titans Valor on the Durum Isles and The Mage Legacy on Mage Island.', '2017-11-23', null, ['Kingdom Foxes', 'KingdomPhoenixes', 'Gilded Sparrows']],
  ['war', 'The Gavel Invasion', 'Five days of war take the province of Gavel from War Syndicate. Declared on the third anniversary of the guild release, it ends with the Coalition holding all 349 territories by Christmas.', '2017-12-21', '2017-12-25', ['BuildCraftia', 'Sins of Seedia', 'Kingdom Foxes', 'Paladins United']],
];

/* --------------------------------------------------------------------- run */
const pool = new pg.Pool({
  host: env('DB_HOST'),
  port: parseInt(env('DB_PORT') || '5432'),
  user: env('DB_LOGIN'),
  password: env('DB_PASS'),
  database: env('DB_DATABASE'),
  ssl: env('DB_SSLMODE') === 'disable' ? undefined : { rejectUnauthorized: false },
  max: 1,
});
console.log(`target: ${useProd ? 'prod (DB_*)' : 'dev (TEST_DB_*)'}`);

assertAllClosed([...ALLIANCES, ...BACKFILL]);

const existingAlliances = new Map(
  (await pool.query('SELECT id, name FROM chronicle_alliances')).rows.map(r => [r.name.toLowerCase(), r.id]),
);
const existingEvents = new Set(
  (await pool.query('SELECT title FROM chronicle_events')).rows.map(r => r.title.toLowerCase()),
);

let addedAlliances = 0, addedMemberships = 0, addedEvents = 0, skipped = 0;

for (const a of ALLIANCES) {
  if (existingAlliances.has(a.name.toLowerCase())) {
    console.log(`skip alliance  ${a.name} (already present)`);
    skipped++;
    continue;
  }
  console.log(`add  alliance  ${a.name} (${a.kind}, ${a.members.length} members)`);
  if (!apply) { addedAlliances++; addedMemberships += a.members.length; continue; }
  const res = await pool.query(
    `INSERT INTO chronicle_alliances (name, tag, color, kind, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [a.name, a.tag, a.color, a.kind, a.description, AUTHOR],
  );
  const id = res.rows[0].id;
  for (const [guild, joined, left] of a.members) {
    await pool.query(
      `INSERT INTO chronicle_memberships (alliance_id, guild_name, joined_at, left_at) VALUES ($1,$2,$3,$4)`,
      [id, guild, D(joined), left ? D(left) : null],
    );
    addedMemberships++;
  }
  addedAlliances++;
}

for (const b of BACKFILL) {
  const id = existingAlliances.get(b.name.toLowerCase());
  if (!id) { console.log(`skip backfill  ${b.name} (alliance not found)`); continue; }
  for (const [guild, joined, left] of b.members) {
    const dup = await pool.query(
      `SELECT 1 FROM chronicle_memberships WHERE alliance_id=$1 AND guild_name=$2 AND joined_at=$3`,
      [id, guild, D(joined)],
    );
    if (dup.rowCount) { console.log(`skip member    ${b.name} / ${guild} (already present)`); continue; }
    console.log(`add  member    ${b.name} / ${guild} from ${joined}`);
    if (!apply) { addedMemberships++; continue; }
    await pool.query(
      `INSERT INTO chronicle_memberships (alliance_id, guild_name, joined_at, left_at) VALUES ($1,$2,$3,$4)`,
      [id, guild, D(joined), left ? D(left) : null],
    );
    addedMemberships++;
  }
}

for (const [type, title, desc, starts, ends, guilds] of EVENTS) {
  if (existingEvents.has(title.toLowerCase())) {
    console.log(`skip event     ${title} (already present)`);
    skipped++;
    continue;
  }
  console.log(`add  event     ${starts}  ${type.padEnd(9)} ${title}`);
  if (!apply) { addedEvents++; continue; }
  await pool.query(
    `INSERT INTO chronicle_events (event_type, title, description, starts_at, ends_at, guilds, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [type, title, desc, D(starts), ends ? D(ends) : null, JSON.stringify(guilds), AUTHOR],
  );
  addedEvents++;
}

/* Alliances seeded before the end dates were curated left their memberships
   open, which ran month-long blocs to the present on the timeline. Bring any
   row that this file now bounds into line. */
let corrected = 0;
for (const a of [...ALLIANCES, ...BACKFILL]) {
  const id = existingAlliances.get(a.name.toLowerCase());
  if (!id) continue;
  for (const [guild, joined, left] of a.members) {
    if (!left) continue;
    const row = await pool.query(
      `SELECT id, left_at FROM chronicle_memberships WHERE alliance_id=$1 AND guild_name=$2 AND joined_at=$3`,
      [id, guild, D(joined)],
    );
    for (const r of row.rows) {
      const have = r.left_at ? new Date(r.left_at).toISOString().slice(0, 10) : null;
      if (have === left) continue;
      console.log(`fix  member    ${a.name} / ${guild}: ${have ?? 'open'} -> ${left}`);
      corrected++;
      if (apply) await pool.query(`UPDATE chronicle_memberships SET left_at=$1 WHERE id=$2`, [D(left), r.id]);
    }
  }
}

console.log(`\n${apply ? 'APPLIED' : 'DRY RUN'} — alliances ${addedAlliances}, memberships ${addedMemberships}, events ${addedEvents}, corrected ${corrected}, skipped ${skipped}`);
await pool.end();
