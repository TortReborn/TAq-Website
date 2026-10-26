// Warfront's own card prices. Every card is rebuilt from the same slugs,
// tiers, costs and kits as the duel game's, but its power and health come
// from grid/balance-coefficients.json: the duel's model refitted by
// self-play under Warfront rules (`node scripts/duel-lab.mjs tune
// --ruleset=grid --write`, README "Prices"). The duel and Three-Front War
// catalogs are untouched.
//
// The balance lab refits prices in-process by changing K and rebuilding the
// live catalog, so during a lab run (GRID_PRICES.live) Warfront reads the
// live catalog instead of this file.

import type { Coefficients } from '../balance';
import { catalogWith, getCard } from '../catalog';
import type { Signature } from '../signatures';
import type { CardDef } from '../types';
import { WAR_SIGNATURES } from '../war/signatures';
import prices from './balance-coefficients.json';

/** Hand-written cards whose duel kit does not fit a board game's budget: the war versions fit Warfront too. */
export const GRID_SIGNATURES: Record<string, Signature> = WAR_SIGNATURES;

/** Mutable only for the lab: true reads the live catalog (the prices being fitted). */
export const GRID_PRICES: { live: boolean } = { live: false };

let built: Record<string, CardDef> | null = null;

/** A card as Warfront builds it (tokens and unknown slugs fall back to the live catalog). */
export function gridCard(slug: string): CardDef | undefined {
  if (GRID_PRICES.live) return getCard(slug);
  built ??= catalogWith(prices as Coefficients, GRID_SIGNATURES);
  return built[slug] ?? getCard(slug);
}

/** Every card as Warfront builds it, for a deck builder showing Warfront stats. */
export function gridCards(): CardDef[] {
  if (!GRID_PRICES.live) built ??= catalogWith(prices as Coefficients, GRID_SIGNATURES);
  return GRID_PRICES.live ? [] : Object.values(built!);
}
