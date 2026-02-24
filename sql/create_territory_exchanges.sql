CREATE TABLE IF NOT EXISTS territory_exchanges (
    exchange_time TIMESTAMPTZ NOT NULL,
    territory     VARCHAR(100) NOT NULL,
    attacker_name VARCHAR(100) NOT NULL,
    defender_name VARCHAR(100) NOT NULL
);

-- Primary lookup: reconstruct state at a point in time (latest exchange per territory before timestamp)
CREATE INDEX IF NOT EXISTS idx_te_territory_time ON territory_exchanges (territory, exchange_time DESC);

-- Range scans: get all exchanges in a time window
CREATE INDEX IF NOT EXISTS idx_te_time ON territory_exchanges (exchange_time);
