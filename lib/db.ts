import { Pool } from "pg";

let _pool: Pool | null = null;

function truthy(v?: string | null) {
  if (!v) return false;
  const s = v.toLowerCase().trim();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function pickEnv(name: string, nameTest: string) {
  const isTest = truthy(process.env.TEST_MODE);
  return isTest ? process.env[nameTest] : process.env[name];
}

function parsePort(v?: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 5432;
}

function sslFor(mode?: string) {
  const m = (mode || "").toLowerCase();
  if (m === "require") {
    // In many managed Postgres providers you need ssl: { rejectUnauthorized: false }
    return { rejectUnauthorized: false };
  }
  // "disable" or unspecified
  return undefined;
}

export function getPool(): Pool {
  if (_pool) return _pool;

  const user = pickEnv("DB_LOGIN", "TEST_DB_LOGIN");
  const password = pickEnv("DB_PASS", "TEST_DB_PASS");
  const host = pickEnv("DB_HOST", "TEST_DB_HOST");
  const port = parsePort(pickEnv("DB_PORT", "TEST_DB_PORT"));
  const database = pickEnv("DB_DATABASE", "TEST_DB_DATABASE");
  const sslmode = pickEnv("DB_SSLMODE", "TEST_DB_SSLMODE");

  if (!user || !host || !database) {
    throw new Error("Database env vars missing. Check .env and TEST_MODE.");
  }

  _pool = new Pool({
    user,
    password: password || undefined,
    host,
    port,
    database,
    ssl: sslFor(sslmode),
    max: 5,            // small pool works well on serverless
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000
  });

  return _pool;
}
