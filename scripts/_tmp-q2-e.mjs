import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());
const { rows } = await pool.query(
 `WITH e AS (SELECT territory, exchange_time, attacker_name,
     lead(exchange_time) OVER (PARTITION BY territory ORDER BY exchange_time) nxt
   FROM territory_exchanges WHERE exchange_time>='2018-04-01' AND exchange_time<'2018-06-01')
  SELECT round(EXTRACT(epoch FROM sum(nxt-exchange_time))/60)::int total_min, count(*)::int n
  FROM e WHERE attacker_name='vsauce'`);
console.log('vsauce total possession minutes', rows[0]);
const { rows: r2 } = await pool.query(
 `SELECT count(*)::int n FROM territory_exchanges WHERE attacker_name='The Super Empire'
   AND exchange_time>='2018-04-01' AND exchange_time<'2018-05-01'
   AND defender_name = ANY($1)`, [['Angelic','Constellations','Emorians','Fantasy','Hall of Fame','Holders Of LE','IceBlue Team','Imperial','Kasai Shinrai','Kingdom Foxes','KingdomPhoenixes','Paladins United','Sins of Seedia','The Divine Swords','The Hive','Titans Valor','DiamondDeities']]);
console.log('Super Empire April captures off 22-Apr-map guilds (unfiltered):', r2[0].n);
const { rows: r3 } = await pool.query(
 `SELECT count(*)::int n FROM territory_exchanges WHERE attacker_name='The Super Empire'
   AND exchange_time>='2018-04-01' AND exchange_time<'2018-05-01'
   AND defender_name = ANY($1) AND NOT (territory = ANY($2))`, [['Angelic','Constellations','Emorians','Fantasy','Hall of Fame','Holders Of LE','IceBlue Team','Imperial','Kasai Shinrai','Kingdom Foxes','KingdomPhoenixes','Paladins United','Sins of Seedia','The Divine Swords','The Hive','Titans Valor','DiamondDeities'],
   ["Qira's Battle Room","Hive","Lava Lake","Temple of Legends","Bob's Tomb","Battle Tower (ToA)","Detlas","Cinfras","Avos Temple","Factory Entrance","Swamp Dark Forest Transition Mid","Emerald Trail","Rodoroc","Molten Reach","Molten Heights Portal","Lava Lake Bridge","Active Volcano","Volcanic Slope","Crater Descent","Wybel Island","Herb Cave"]]);
console.log('...FFA-filtered:', r3[0].n);
// Nature Kingdom / Nihil FFA breakdown
for (const g of ['Nature Kingdom','Nihil']) {
  const { rows: r } = await pool.query(
   `SELECT territory, count(*)::int n FROM territory_exchanges WHERE attacker_name=$1
     AND exchange_time>='2018-04-01' AND exchange_time<'2018-05-01' GROUP BY 1 ORDER BY n DESC LIMIT 6`, [g]);
  console.log('== '+g); console.table(r);
  const { rows: d } = await pool.query(
   `SELECT defender_name, count(*)::int n FROM territory_exchanges WHERE attacker_name=$1
     AND exchange_time>='2018-04-01' AND exchange_time<'2018-05-01' GROUP BY 1 ORDER BY n DESC LIMIT 8`, [g]);
  console.table(d);
}
await pool.end();
