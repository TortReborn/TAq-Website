/**
 * Era-aware trade route graphs.
 *
 * Trading routes are a guild-economy mechanic introduced with 1.20 Gavel
 * Reborn (January 2021) — before that the guild map had no trade routes at
 * all, so the history view must not draw any for earlier timestamps.
 * Since then the graph has changed whenever the territory map changed
 * (2.0 Spellbound, 2.1 Rekindled World, 2.2 Fruma, plus patches), so each
 * era gets its own route-graph file.
 *
 * Era files live under /public and hold the standard verbose-territory
 * shape: { [territoryName]: { "Trading Routes": string[], ... } }. Only the
 * route pairs are read from them; endpoint coordinates come from the
 * territories actually displayed on the map.
 */

import { ROL_UPDATE_CUTOFF_MS, REKINDLED_WORLD_CUTOFF_MS } from "./territory-abbreviations";

/** No trade routes existed before 1.20 Gavel Reborn went live. */
export const TRADE_ROUTES_EPOCH_MS = ROL_UPDATE_CUTOFF_MS;

export interface TradeRouteEra {
  /** Inclusive start of this era's validity (ms since epoch). */
  startMs: number;
  /** Public URL of the era's route graph. */
  url: string;
}

/**
 * Route-graph eras, ascending by start. A timestamp resolves to the last
 * era that started at or before it.
 *
 * Graphs recovered from dated community snapshots (avicia routefinder,
 * fa-rog/economy, titantimes/valor, jakematt123, dernal — cross-verified):
 * - 1.20 launch graph: 648 pairs (Jan 2021)
 * - 1.20.3 tweaked a few routes (Jul 2021); 2.0 Spellbound changed nothing,
 *   so one graph spans Jul 2021 → Aug 2024
 * - 2.1 Rekindled renamed ~236 territories but kept the topology (Aug 2024)
 * - 2.2 Fruma added 31 territories / 48 routes (Apr 2026) — the present-day
 *   graph, served from territories_verbose.json
 */
export const TRADE_ROUTE_ERAS: TradeRouteEra[] = [
  // 1.20 launch graph (648 pairs)
  { startMs: TRADE_ROUTES_EPOCH_MS, url: "/trade-routes/2021-01.json?v=1" },
  // 1.20.3 route fixes: jungle connections changed (Jul 5, 2021)
  { startMs: new Date("2021-07-05T00:00:00Z").getTime(), url: "/trade-routes/2021-07.json?v=1" },
  // Bloody Beach <-> Corkus Countryside removed (evidence window Jul 16 –
  // Nov 13, 2021; boundary set at first confirmed absence). Graph then
  // verified stable through all of 2.0.
  { startMs: new Date("2021-11-13T00:00:00Z").getTime(), url: "/trade-routes/2021-11.json?v=1" },
  // 2.1 Rekindled World — same cutoff the territory-name expansion uses.
  // Mass renames (e.g. Corkus City South -> Corkus City Crossroads), topology
  // otherwise preserved.
  { startMs: REKINDLED_WORLD_CUTOFF_MS, url: "/trade-routes/2024-08.json?v=1" },
  // Corkus City Crossroads <-> Picnic Pond removed (evidence window Jun 2 –
  // Jul 31, 2025; boundary at first confirmed absence)
  { startMs: new Date("2025-07-31T00:00:00Z").getTime(), url: "/trade-routes/2025-07.json?v=1" },
  // 2.2 Fruma — the present-day graph (+31 territories, +48 routes)
  { startMs: new Date("2026-04-04T00:00:00Z").getTime(), url: "/territories_verbose.json?v=4" },
];

/**
 * The era whose route graph applies at `timestampMs` (null = live/now).
 * Returns null for timestamps before trade routes existed.
 */
export function tradeRouteEraFor(timestampMs: number | null): TradeRouteEra | null {
  const t = timestampMs ?? Date.now();
  if (t < TRADE_ROUTES_EPOCH_MS) return null;
  let chosen: TradeRouteEra | null = null;
  for (const era of TRADE_ROUTE_ERAS) {
    if (t >= era.startMs) chosen = era;
    else break;
  }
  return chosen;
}
