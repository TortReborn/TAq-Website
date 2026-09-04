// Credentials come from TEST_DB_*, the same variables the vitest suite reads.
// They are not written here: a password in a file gets committed, and this
// repository is public.
const pg = require('pg');

if (!process.env.TEST_DB_LOGIN || !process.env.TEST_DB_PASS) {
  process.stdout.write('set TEST_DB_LOGIN and TEST_DB_PASS first\n');
  process.exit(1);
}

const pool = new pg.Pool({
  user: process.env.TEST_DB_LOGIN,
  password: process.env.TEST_DB_PASS,
  host: process.env.TEST_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT ?? 5432),
  database: process.env.TEST_DB_DATABASE ?? 'tortreborn',
  ssl: false,
});

const needed = [
  'discord_links','new_app','profile_backgrounds','profile_customization','shells',
  'aspect_queue','aspect_blacklist','uncollected_raids','distribution_log',
  'graid_events','graid_event_totals','player_activity','guild_bank_transactions',
  'guild_settings','api_keys','cache_entries','le_balance_log',
  'agenda_bau_topics','agenda_requested_topics','audit_log','applications',
  'application_votes','blacklist','kick_list','bot_settings','promotion_queue',
  'guild_generated_colors','guild_prefixes','territory_exchanges','promo_suggestions',
];

pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
  .then(r => {
    const have = new Set(r.rows.map(x => x.tablename));
    const missing = needed.filter(t => !have.has(t));
    if (missing.length === 0) {
      process.stdout.write('All tables present!\n');
    } else {
      process.stdout.write('Missing tables (' + missing.length + '):\n');
      missing.forEach(t => process.stdout.write('  - ' + t + '\n'));
    }
    pool.end();
  })
  .catch(e => { process.stdout.write('ERROR: ' + e.message + '\n'); pool.end(); });
