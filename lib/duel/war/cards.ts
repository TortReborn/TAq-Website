// Three-Front War's own card prices. Every card is rebuilt from the same
// slugs, tiers, costs and kits as the duel game's, but its power and health
// come from war/balance-coefficients.json: the duel's model refitted by
// self-play under war rules (`node scripts/duel-lab.mjs tune --ruleset=war
// --write`, README "Prices"), with the war versions of Her Majesty and
// Syndra (signatures.ts). The duel and Warfront catalogs are untouched.
//
// The balance lab refits prices in-process by changing K and rebuilding the
// live catalog, so during a lab run (WAR_PRICES.live) war reads the live
// catalog instead of this file.

import type { Coefficients } from '../balance';
import { catalogWith, getCard } from '../catalog';
import type { CardDef } from '../types';
import { WAR_SIGNATURES } from './signatures';
import prices from './balance-coefficients.json';

/** Mutable only for the lab: true reads the live catalog (the prices being fitted). */
export const WAR_PRICES: { live: boolean } = { live: false };

let built: Record<string, CardDef> | null = null;

/** A card as Three-Front War builds it (tokens and unknown slugs fall back to the live catalog). */
export function warCard(slug: string): CardDef | undefined {
  if (WAR_PRICES.live) return getCard(slug);
  built ??= catalogWith(prices as Coefficients, WAR_SIGNATURES);
  return built[slug] ?? getCard(slug);
}

/** Every card as Three-Front War builds it, for a guide or deck builder showing war stats. */
export function warCards(): CardDef[] {
  if (WAR_PRICES.live) return [];
  built ??= catalogWith(prices as Coefficients, WAR_SIGNATURES);
  return Object.values(built);
}
