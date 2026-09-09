import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());
const q=(s,p)=>pool.query(s,p).then(r=>r.rows);
console.log('--- HaHaUnited daily Sep-Nov 2019 ---');
console.log('  '+(await q(`select to_char(exchange_time::date,'MM-DD') d,count(*) n from territory_exchanges where attacker_name='HaHaUnited' and exchange_time>='2019-09-01' and exchange_time<'2019-12-01' group by 1 order by 1`)).map(r=>r.d+':'+r.n).join('  '));
console.log('--- captures ON HaHaUnited, 15-30 Sep 2019, by attacker ---');
for(const r of await q(`select attacker_name a,count(*) n,min(exchange_time) f,max(exchange_time) l from territory_exchanges where defender_name='HaHaUnited' and exchange_time>='2019-09-15' and exchange_time<'2019-10-01' group by 1 order by n desc limit 8`)) console.log('   '+String(r.n).padStart(3)+'  '+r.a.padEnd(22)+r.f.toISOString().slice(0,16)+' .. '+r.l.toISOString().slice(0,16));
console.log('--- FinalFront last captures Sep-Oct 2019 ---');
console.log('  '+(await q(`select to_char(exchange_time::date,'MM-DD') d,count(*) n from territory_exchanges where attacker_name='FinalFront' and exchange_time>='2019-09-15' and exchange_time<'2019-11-15' group by 1 order by 1`)).map(r=>r.d+':'+r.n).join('  '));
console.log('--- Nethers Ascent monthly 2018-06..2020-04 ---');
console.log('  '+(await q(`select to_char(date_trunc('month',exchange_time),'YY-MM') m,count(*) n from territory_exchanges where attacker_name='Nethers Ascent' and exchange_time<'2020-05-01' group by 1 order by 1`)).map(r=>r.m+':'+r.n).join('  '));
console.log('--- Solis Crudelia first days ---');
console.log('  '+(await q(`select to_char(exchange_time::date,'MM-DD') d,count(*) n from territory_exchanges where attacker_name='Solis Crudelia' and exchange_time<'2019-10-16' group by 1 order by 1`)).map(r=>r.d+':'+r.n).join('  '));
console.log('--- top holders at snapshots ---');
for(const t of ['2019-09-09 12:00:00+00','2019-10-01 00:00:00+00','2019-12-01 00:00:00+00','2019-12-31 00:00:00+00','2020-03-01 00:00:00+00']){
  const rows = await q(`select distinct on (territory) territory, attacker_name from territory_exchanges where exchange_time <= $1 order by territory, exchange_time desc`,[t]);
  const m=new Map(); for(const r of rows) m.set(r.attacker_name,(m.get(r.attacker_name)||0)+1);
  console.log('  '+t.slice(0,10)+': '+[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([g,c])=>g+' '+c).join(', '));
}
await pool.end();
