-- Serves the DISTINCT ON (territory) ... ORDER BY territory, exchange_time ASC
-- queries in lib/exchange-data.ts (getInitialOwners) and related initial-state
-- scans, letting Postgres walk the index instead of sorting the whole table.
-- CONCURRENTLY avoids locking territory_exchanges during creation
-- (must be run outside a transaction block).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_te_territory_time_asc ON territory_exchanges (territory, exchange_time ASC);
