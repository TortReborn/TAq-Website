const fs = require('fs');
const path = require('path');
const pg = require('pg');
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath) === false) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(String.fromCharCode(10))) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv();
const pool = new pg.Pool({
  user: process.env.DB_LOGIN, password: process.env.DB_PASS,
  host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false,
});
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'territory_exchanges' ORDER BY ordinal_position").then(r => {
  r.rows.forEach(x => console.log(x.column_name + ' (' + x.data_type + ')'));
  pool.end();
}).catch(e => { console.error(e); pool.end(); });
