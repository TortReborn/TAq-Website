import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());

// holdings at instant T: for each territory, the attacker of the last exchange at or before T
async function holdings(ts) {
  const q = `select distinct on (territory) territory, attacker_name, exchange_time
             from territory_exchanges where exchange_time <= $1
             order by territory, exchange_time desc`;
  const { rows } = await pool.query(q, [ts]);
  const m = new Map();
  for (const r of rows) m.set(r.attacker_name, (m.get(r.attacker_name) || 0) + 1);
  return m;
}

const dates = process.argv.slice(2);
const guilds = ['HackForums','Emorians','Avicia','ShadowFall','Kingdom Foxes','Imperial','Titans Valor','DiamondDeities','Paladins United','BuildCraftia','Lunatic','The Simple Ones','Fantasy','Blacklisted'];
const table = {};
for (const d of dates) {
  const m = await holdings(d);
  table[d] = m;
  const top = [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,14);
  console.log('=== ' + d + '  (total held ' + [...m.values()].reduce((a,b)=>a+b,0) + ')');
  for (const [g,c] of top) console.log('   ' + String(c).padStart(4) + '  ' + g);
}
console.log('\n=== tracked guilds across dates');
console.log('guild'.padEnd(20) + dates.map(d=>d.slice(0,10).padStart(12)).join(''));
for (const g of guilds) {
  console.log(g.padEnd(20) + dates.map(d=>String(table[d].get(g)||0).padStart(12)).join(''));
}
await pool.end();
