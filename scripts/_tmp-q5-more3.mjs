import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());
const q=(s,p)=>pool.query(s,p).then(r=>r.rows);
console.log('-- Mystic Woods vs Kingdom Foxes, 6-9 Sep 2019 --');
for(const r of await q(`select attacker_name a, defender_name d, count(*) n, min(exchange_time) f from territory_exchanges where exchange_time>='2019-09-06' and exchange_time<'2019-09-10' and ((attacker_name='Mystic Woods' ) or (defender_name='Mystic Woods')) group by 1,2 order by n desc limit 12`)) console.log('   '+String(r.n).padStart(3)+'  '+r.a+' -> '+r.d+'   first '+r.f.toISOString().slice(0,16));
console.log('-- Nethers Ascent vs The Simple Ones, Oct 2019 --');
for(const r of await q(`select to_char(exchange_time::date,'MM-DD') d, count(*) n from territory_exchanges where attacker_name='Nethers Ascent' and defender_name='The Simple Ones' and exchange_time>='2019-10-01' and exchange_time<'2019-11-01' group by 1 order by 1`)) console.log('   '+r.d+': '+r.n);
console.log('-- who took The Simple Ones ground Oct 2019 --');
for(const r of await q(`select attacker_name a,count(*) n from territory_exchanges where defender_name='The Simple Ones' and exchange_time>='2019-10-01' and exchange_time<'2019-11-01' group by 1 order by n desc limit 8`)) console.log('   '+String(r.n).padStart(4)+'  '+r.a);
console.log('-- Imperial holdings month ends --');
for(const t of ['2019-11-30 23:59:00+00','2019-12-30 23:59:00+00','2020-01-31 23:59:00+00']){
  const rows = await q(`select distinct on (territory) territory, attacker_name from territory_exchanges where exchange_time <= $1 order by territory, exchange_time desc`,[t]);
  const m=new Map(); for(const r of rows) m.set(r.attacker_name,(m.get(r.attacker_name)||0)+1);
  const s=[...m.entries()].sort((a,b)=>b[1]-a[1]);
  console.log('   '+t.slice(0,10)+' total='+rows.length+' :: '+s.slice(0,8).map(([g,c])=>g+' '+c).join(', '));
}
console.log('-- Hyperion Faction daily Oct 2019 --');
console.log('   '+(await q(`select to_char(exchange_time::date,'MM-DD') d,count(*) n from territory_exchanges where attacker_name='Hyperion Faction' and exchange_time<'2019-11-01' group by 1 order by 1`)).map(r=>r.d+':'+r.n).join('  '));
await pool.end();
