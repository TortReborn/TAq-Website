import { Pool } from "pg";

let _pool: Pool | null = null;

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

  // One set of names. The repo .env carries dev values; Vercel carries prod.
  // There is no switch between them any more (TAQ-96): which database this
  // process talks to is decided by where it runs, not by a boolean.
  const user = process.env.DB_LOGIN;
  const password = process.env.DB_PASS;
  const host = process.env.DB_HOST;
  const port = parsePort(process.env.DB_PORT);
  const database = process.env.DB_DATABASE;
  const sslmode = process.env.DB_SSLMODE;

  if (!user || !host || !database) {
    throw new Error("Database env vars missing: set DB_LOGIN, DB_HOST and DB_DATABASE.");
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
