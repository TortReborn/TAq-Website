/**
 * Database connection settings for the one-off scripts in this directory,
 * read from .env.
 *
 * These scripts used to carry the dev and production passwords inline. That is
 * how a live Neon credential ended up in a public repository's history. Nothing
 * here writes a secret down; a missing variable is a loud failure rather than a
 * silent fallback to someone's machine.
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    // `vercel env pull` writes values quoted, and a password carrying quote
    // marks fails authentication in a way that reads as "wrong password".
    const val = trimmed.slice(idx + 1).trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv();

function require_(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — put it in .env`);
  return v;
}

/** The deployed database, as configured in .env. */
function prod() {
  return {
    user: require_('DB_LOGIN'),
    password: require_('DB_PASS'),
    host: require_('DB_HOST'),
    port: Number(process.env.DB_PORT ?? 5432),
    database: require_('DB_DATABASE'),
    ssl: process.env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  };
}

/** The local development database, as configured by TEST_DB_*. */
function dev() {
  return {
    user: require_('TEST_DB_LOGIN'),
    password: require_('TEST_DB_PASS'),
    host: process.env.TEST_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TEST_DB_PORT ?? 5432),
    database: process.env.TEST_DB_DATABASE ?? 'tortreborn',
    ssl: false,
    connectionTimeoutMillis: 5000,
  };
}

module.exports = { dev, prod };
