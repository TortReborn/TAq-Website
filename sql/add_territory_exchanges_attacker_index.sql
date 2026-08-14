-- Serves the guild_activity_events 'capture' branch, which filters
-- territory_exchanges by attacker_name and then by a time window
-- (lib/activity-trends.ts: eventQuery / eventHeatmapQuery).
--
-- Without it every trend and heatmap request seq-scans all ~3.3M exchange
-- rows to find the ~150k belonging to The Aquarium — measured at ~110ms per
-- query on the dev copy, paid on every chart load and every range change.
--
-- CONCURRENTLY avoids locking territory_exchanges during creation
-- (must be run outside a transaction block).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_te_attacker_time
  ON territory_exchanges (attacker_name, exchange_time DESC);
