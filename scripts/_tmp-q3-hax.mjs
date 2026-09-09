import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const DB = require('./lib/db-config.cjs');
const { Pool } = require('pg');
const fs = require('fs');
const ffa = JSON.parse(fs.readFileSync('data/wiki/research/ffa-timeline.json','utf8'));
const arr = ffa.declarations||ffa.lists||ffa.entries||Object.values(ffa).find(v=>Array.isArray(v));
const list = arr.find(d=>d.date==='2018-08-06');
const excl = new Set([...(list.territories||[]), ...(list.alsoUnassigned||[])]);
const pool = new Pool(DB.prod());
const q = async (s,p)=> (await pool.query(s,p)).rows;
const rows = await q(`select exchange_time, territory, attacker_name, defender_name
  from territory_exchanges
  where exchange_time >= '2018-08-06 00:00:00Z' and exchange_time < '2018-08-07 00:00:00Z'
    and (attacker_name='HackForums' or defender_name='HackForums') order by exchange_time`);
const f = rows.filter(r=>!excl.has(r.territory));
const byHour = {};
for (const r of f) {
  const h = r.exchange_time.toISOString().slice(11,13);
  byHour[h] = byHour[h] || {gain:0, loss:0};
  if (r.attacker_name==='HackForums') byHour[h].gain++; else byHour[h].loss++;
}
console.log('contested rows', f.length, 'of', rows.length);
for (const h of Object.keys(byHour).sort()) console.log(h+':00', 'gained', byHour[h].gain, 'lost', byHour[h].loss);
const g=f.filter(r=>r.attacker_name==='HackForums').length, l=f.length-g;
console.log('DAY total gained', g, 'lost', l, 'net', g-l);
// running net across the 18:00-21:00 window
let net=0; const trace=[];
for (const r of f){ net += r.attacker_name==='HackForums'?1:-1; trace.push([r.exchange_time.toISOString(), net]); }
console.log('peak net', Math.max(...trace.map(t=>t[1])), 'at', trace.find(t=>t[1]===Math.max(...trace.map(x=>x[1])))[0]);
console.log('min after peak', Math.min(...trace.map(t=>t[1])));
// distinct guilds attacking Hax in 18:00-21:00
const w = f.filter(r=>r.exchange_time>=new Date('2018-08-06T18:00:00Z') && r.exchange_time<new Date('2018-08-06T21:00:00Z'));
const att=new Set(w.filter(r=>r.defender_name==='HackForums').map(r=>r.attacker_name));
console.log('18-21 UTC: rows', w.length, 'Hax gains', w.filter(r=>r.attacker_name==='HackForums').length, 'Hax losses', w.filter(r=>r.defender_name==='HackForums').length, 'distinct attackers', att.size, [...att].join(', '));
const vic=new Set(w.filter(r=>r.attacker_name==='HackForums').map(r=>r.defender_name));
console.log('victims 18-21', [...vic].join(', '));
await pool.end();
