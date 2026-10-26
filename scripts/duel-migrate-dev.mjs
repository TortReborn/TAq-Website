#!/usr/bin/env node
// Applies sql/create_card_duels.sql (idempotent) to the LOCAL dev database.
//
//   node scripts/duel-migrate-dev.mjs
//
// Reads DB_* from the repo .env and refuses unless DB_HOST is this machine:
// the repo .env is dev-only, and prod schema changes go through the
// documented rollout (lib/duel/README.md), never through this script.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of fs.readFileSync(path.join(repo, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^(['"])([\s\S]*)\1$/, '$2');
}
const host = env.DB_HOST || '127.0.0.1';
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing: DB_HOST is ${host}, not this machine. This script only migrates the local dev database.`);
  process.exit(1);
}

const client = new pg.Client({
  host, port: Number(env.DB_PORT) || 5432, user: env.DB_LOGIN, password: env.DB_PASS, database: env.DB_DATABASE || 'tortreborn',
});
await client.connect();
try {
  await client.query(fs.readFileSync(path.join(repo, 'sql', 'create_card_duels.sql'), 'utf8'));
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'duel_matches' AND column_name = 'ruleset'`,
  );
  const { rows: checks } = await client.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'duel_matches_ruleset_check' AND conrelid = 'duel_matches'::regclass`,
  );
  const grid = checks.some(c => c.def.includes("'grid'"));
  console.log(rows.length
    ? `Applied to ${host}; duel_matches.ruleset is present${grid ? ' and accepts grid (Warfront)' : ', but its check does not accept grid'}.`
    : 'Applied, but duel_matches.ruleset is missing.');
} finally {
  await client.end();
}
