/**
 * Run every query builder in lib/activity-trends.ts against the database.
 *
 * The vitest suite only asserts query *shape* — it never touches Postgres. This
 * proves the SQL is valid, returns the columns the routes read, and performs
 * acceptably on the real table sizes. Reads only; writes nothing.
 *
 *   npx tsx --env-file=.env scripts/_check-activity-queries.ts
 *
 * --env-file is what supplies the credentials; without it the script has no
 * database to talk to. TEST_MODE in that file (or the environment) selects
 * dev over prod, exactly as lib/db.ts does.
 */
// pg is CommonJS: under a plain ESM run its named exports are not bindable,
// unlike inside the Next bundler where lib/db.ts imports { Pool } directly.
import pg from 'pg';
import {
  playtimeQuery, presenceQuery, eventQuery,
  slotOccurrenceQuery, eventHeatmapQuery, presenceHeatmapQuery,
  buildHeatmapGrid, bestWindow, bucketFor,
  type RangeKey,
} from '../lib/activity-trends';

const isTest = (process.env.TEST_MODE ?? '').toLowerCase().trim() === 'true';
const p = (name: string) => process.env[`${isTest ? 'TEST_' : ''}${name}`];

if (!p('DB_HOST')) {
  console.error('No database configured. Run with:  npx tsx --env-file=.env scripts/_check-activity-queries.ts');
  process.exit(1);
}

console.log(`database: ${p('DB_DATABASE')} @ ${p('DB_HOST')} (TEST_MODE=${isTest})\n`);

const pool = new pg.Pool({
  user: p('DB_LOGIN'),
  password: p('DB_PASS') || undefined,
  host: p('DB_HOST'),
  port: Number(p('DB_PORT')) || 5432,
  database: p('DB_DATABASE'),
  ssl: (p('DB_SSLMODE') || '').toLowerCase() === 'require' ? { rejectUnauthorized: false } : undefined,
});

let failures = 0;

async function run(label: string, q: { text: string; values: unknown[] }) {
  try {
    const started = Date.now();
    const { rows } = await pool.query(q.text, q.values);
    const ms = Date.now() - started;
    const nonZero = rows.filter(
      (r: Record<string, unknown>) => Number(r.value ?? r.total ?? r.occurrences ?? 0) > 0,
    ).length;
    console.log(`  PASS  ${label.padEnd(40)} ${String(rows.length).padStart(5)} rows, ` +
                `${String(nonZero).padStart(5)} non-zero, ${String(ms).padStart(5)}ms`);
    return rows;
  } catch (e) {
    failures++;
    console.log(`  FAIL  ${label}\n        ${(e as Error).message}`);
    return [];
  }
}

console.log('── trend queries ──');
for (const range of ['24h', '7d', '30d', '1y', 'all'] as RangeKey[]) {
  await run(`playtime ${range} (${bucketFor('playtime', range)})`,
            playtimeQuery(bucketFor('playtime', range), range));
  await run(`captures ${range} (${bucketFor('captures', range)})`,
            eventQuery('captures', bucketFor('captures', range), range, 'America/New_York'));
  await run(`presence ${range} (${bucketFor('presence', range)})`,
            presenceQuery(bucketFor('presence', range), range, 'America/New_York'));
}

console.log('\n── timezone handling (same data, four zones) ──');
for (const tz of ['UTC', 'America/New_York', 'Europe/London', 'Australia/Sydney']) {
  const rows = await run(`captures 30d in ${tz}`, eventQuery('captures', 'day', '30d', tz));
  if (rows.length) {
    const first = rows[0].t as Date | string;
    console.log(`        first bucket: ${first instanceof Date ? first.toISOString() : first}`);
  }
}

console.log('\n── per-member filter ──');
const busiest = await pool.query(
  'SELECT uuid::text FROM playtime_daily GROUP BY uuid ORDER BY SUM(hours) DESC LIMIT 1');
if (busiest.rows.length) {
  const uuid = busiest.rows[0].uuid as string;
  console.log(`        busiest member: ${uuid}`);
  await run('playtime 90d for one member', playtimeQuery('day', '90d', { uuid }));
  await run('presence 7d for one member', presenceQuery('hour', '7d', 'UTC', { uuid }));
}

console.log('\n── heatmap queries ──');
await run('slot occurrences 30d', slotOccurrenceQuery('30d', 'America/New_York'));
const caps = await run('capture heatmap 1y', eventHeatmapQuery('captures', '1y', 'America/New_York'));
await run('presence heatmap 30d', presenceHeatmapQuery('30d', 'America/New_York'));

if (caps.length) {
  console.log('\n── derived grid: captures, last year, US Eastern ──');
  const occQ = slotOccurrenceQuery('1y', 'America/New_York');
  const occ = await pool.query(occQ.text, occQ.values);
  const grid = buildHeatmapGrid(caps as never, occ.rows as never);
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const max = Math.max(...grid.map((c) => c.average));
  console.log('        hour  00    04    08    12    16    20');
  for (let d = 0; d < 7; d++) {
    let row = '';
    for (let h = 0; h < 24; h++) {
      const cell = grid.find((c) => c.dow === d && c.hour === h)!;
      row += ' .:-=+*#%@'[Math.min(9, Math.floor((cell.average / max) * 9.99))].repeat(2);
    }
    console.log(`        ${DAYS[d]}   ${row}`);
  }
  const peak = grid.reduce((a, b) => (b.average > a.average ? b : a));
  console.log(`\n        peak slot: ${DAYS[peak.dow]} ${String(peak.hour).padStart(2, '0')}:00 ET ` +
              `(${peak.average.toFixed(2)} captures per occurrence)`);
  console.log(`        best 2h window: ${String(bestWindow(grid, 2).startHour).padStart(2, '0')}:00 ET`);
  console.log(`        best 4h window: ${String(bestWindow(grid, 4).startHour).padStart(2, '0')}:00 ET`);
}

await pool.end();
console.log(`\nRESULT: ${failures === 0 ? 'all queries ran' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
