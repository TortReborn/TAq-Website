import fs from 'fs';
import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());
const tl = JSON.parse(fs.readFileSync('data/wiki/research/ffa-timeline.json','utf8'));
const mar24 = tl.lists.find(l=>l.date==='2018-03-24');
const ffa = new Set([...(mar24.territories||[]), ...(mar24.alsoUnassigned||[])]);
console.log('FFA list 2018-03-24 size', ffa.size);

const guilds = ['The Super Empire','Nature Kingdom','Nihil','vsauce','Flosh','Mark RPG Clan','DiamondDeities','LE Flowers','LEFlowers','Illustratus','Death Reapers','DeathReapers','Immortalish','Serpentem Empire'];
for (const g of guilds) {
  const { rows } = await pool.query(
    `SELECT count(*)::int n, min(exchange_time) f, max(exchange_time) l FROM territory_exchanges WHERE attacker_name=$1`, [g]);
  const { rows: d } = await pool.query(
    `SELECT count(*)::int n FROM territory_exchanges WHERE defender_name=$1`, [g]);
  console.log(g.padEnd(20), 'as attacker', String(rows[0].n).padStart(6), rows[0].f? rows[0].f.toISOString().slice(0,16):'-', rows[0].l? rows[0].l.toISOString().slice(0,16):'-', '| as defender', d[0].n);
}
await pool.end();
