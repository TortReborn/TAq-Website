/**
 * RETIRED_TERRITORIES — territories that have been removed from the live Wynncraft game.
 *
 * Rules:
 *  - In LIVE mode:    retired territories are NEVER rendered (they no longer exist)
 *  - In HISTORY mode: retired territories ARE rendered when present in historical data
 *                     (they legitimately existed at those timestamps)
 *
 * To retire a territory: add its exact name here (case-sensitive, matches verbose JSON key).
 * To un-retire:           remove it from this set.
 */
export const RETIRED_TERRITORIES = new Set<string>([
  // ── Old Realm of Light (region deleted in the Jan 2021 RoL rework) ──────────
  "Spiraling Trees",
  "Light Realm Mushrooms",
  "Light Realm East",
  "Light Realm East Lower",
  "Light Realm East Mid",
  "Light Realm East Mid-Upper",
  "Light Realm East Upper",
  "Light Realm Entrance",
  "Light Realm Entrance Upper",
  "Light Realm Corruption",
  "Road to Corruption",
  "Orphion's Seal",
  "Orphion's Seal Upper",

  // ── Light Forest (removed in Rekindled) ─────────────────────────────────────
  "Light Forest South Entrance",
  "Light Forest East Lower",
  "Light Forest East Mid",
  "Light Forest East Upper",
  "Light Forest Canyon",
  "Light Forest Entrance",
  "Light Forest North Entrance",
  "Light Forest North Exit",
  "Light Forest South Exit",
  "Light Forest West Lower",
  "Light Forest West Mid",
  "Light Forest West Upper",
  "Road to Light Forest",
  "Road To Light Forest",
  "Pre-Light Forest Transition",

  // ── Old Camps (removed) ──────────────────────────────────────────────────────
  "Red Camp",
  "Green Camp",
  "Black Camp",

  // ── Old Ozoth path territories (removed in Rekindled World) ─────────────────
  // "Path to Ozoth's Spire" (lowercase-t) is the NEW post-Rekindled territory — NOT retired.
  "Path To Ozoth's Spire Lower",
  "Path To Ozoth's Spire Mid",
  "Path To Ozoth's Spire Upper",

  // ── Old Aldorei-area territories (removed) ───────────────────────────────────
  "Aldorei's River",
  "Aldorei's Waterfall",
  "Aldorei's North Exit",
  "Aldorei's Arch",

  // ── Other old territories ────────────────────────────────────────────────────
  "Abandoned Manor",
]);

/**
 * Returns true if the territory should be rendered.
 *
 * - Live mode:    retired territories are suppressed (they no longer exist)
 * - History mode: ALL territories are rendered — retired ones existed at historical timestamps
 *                 and must appear when scrubbing through the timeline
 */
export function shouldRenderTerritory(
  name: string,
  viewMode: "live" | "history",
): boolean {
  if (viewMode === "live" && RETIRED_TERRITORIES.has(name)) return false;
  return true;
}

// (Trade-route endpoint filtering now lives in components/TradeRoutesOverlay.tsx,
// anchored to the displayed territories and era-selected via lib/trade-routes.ts.)
