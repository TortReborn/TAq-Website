import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());
const pats = ['Lumin','Solis','HHU','Hyper','TNA','LxT','Mera','Tempest','Blacklist','IceBlue','Vindicat','BlueStone','Sentinel','Spectral','Cabbage','Fux','NYM','Achte','Mystic','Zer','MasterWynn','FinalFront','Oce','ThisIsMurica','TheNoLifes','Phantom','Sindria','Mage Legacy','X Hunters','My Wynn'];
for (const p of pats) {
  const { rows } = await pool.query(
    `select attacker_name as g, count(*) n, min(exchange_time) f, max(exchange_time) l
     from territory_exchanges where attacker_name ilike $1 group by 1 order by n desc limit 6`, ['%'+p+'%']);
  if (!rows.length) { console.log(p.padEnd(14)+' -- no attacker match'); continue; }
  for (const r of rows) console.log(p.padEnd(14)+' | '+r.g.padEnd(24)+' n='+String(r.n).padStart(6)+'  '+r.f.toISOString().slice(0,10)+' .. '+r.l.toISOString().slice(0,10));
}
await pool.end();
