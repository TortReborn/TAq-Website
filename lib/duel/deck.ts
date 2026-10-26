// Deck rules and the free starter decks.
//
//   - exactly DECK_SIZE cards
//   - normal cards are free: anyone may run up to 2 copies of any of them
//   - unique and rare: up to 2 copies, and no more than you own
//   - legendary, fabled, mythic and member cards are "renowned": 1 copy each,
//     owned, at most MAX_RENOWNED in a deck and at most one mythic
//
// Practice games against the bot skip the ownership checks, so anyone can
// try any card before chasing it on /reel.

import { allCards, getCard } from './catalog';
import { DECK_SIZE } from './engine';
import evolved from './starter-decks.json';
import type { CardDef, Element } from './types';
import { ELEMENTS } from './types';

export const MAX_COPIES = 2;
export const MAX_RENOWNED = 4;
export const MAX_MYTHIC = 1;
export const RENOWNED = new Set(['legendary', 'fabled', 'mythic', 'member']);

/** slug -> copies owned (summed over star levels). */
export type Owned = Record<string, number>;

export function copyLimit(def: CardDef): number {
  return RENOWNED.has(def.tier) ? 1 : MAX_COPIES;
}

/**
 * Returns the problems with a deck; empty means legal. Pass `owned` to
 * enforce ownership (ranked or friendly games), null for practice.
 * `lookup` resolves member cards, which are not in the static catalog.
 */
export function validateDeck(
  slugs: string[],
  owned: Owned | null,
  lookup: (slug: string) => CardDef | undefined = getCard,
): string[] {
  const errors: string[] = [];
  if (slugs.length !== DECK_SIZE) errors.push(`A deck has exactly ${DECK_SIZE} cards (this one has ${slugs.length}).`);
  const counts = new Map<string, number>();
  for (const s of slugs) counts.set(s, (counts.get(s) ?? 0) + 1);
  let renowned = 0;
  let mythic = 0;
  for (const [slug, n] of counts) {
    const def = lookup(slug);
    if (!def || def.tier === 'token') {
      errors.push(`Unknown card: ${slug}.`);
      continue;
    }
    if (n > copyLimit(def)) errors.push(`${def.name}: at most ${copyLimit(def)} ${copyLimit(def) === 1 ? 'copy' : 'copies'}.`);
    if (RENOWNED.has(def.tier)) renowned += n;
    if (def.tier === 'mythic') mythic += n;
    if (owned && def.tier !== 'normal' && (owned[slug] ?? 0) < n) {
      errors.push(`${def.name}: you own ${owned[slug] ?? 0}.`);
    }
  }
  if (renowned > MAX_RENOWNED) errors.push(`At most ${MAX_RENOWNED} legendary, fabled, mythic or member cards (this deck has ${renowned}).`);
  if (mythic > MAX_MYTHIC) errors.push(`At most ${MAX_MYTHIC} mythic card.`);
  return errors;
}

// --- Starter decks ---------------------------------------------------------

/** Target curve for a 20-card deck, by cost. */
const CURVE: Record<number, number> = { 1: 2, 2: 5, 3: 5, 4: 5, 5: 3 };

export const STARTER_NAMES: Record<Element, string> = {
  earth: 'Ragni Garrison',
  thunder: 'Corkus Circuit',
  water: 'Selchar Tides',
  fire: 'Molten Heights',
  air: 'Canyon Winds',
};

/**
 * A free deck of normal cards for each element, so a member with an empty
 * collection can still play. The decks are found by self-play (meta.ts
 * evolves the best mono-element all-normal deck for each element and writes
 * starter-decks.json); if a listed deck no longer passes the deck rules, say
 * after the card list changed, the rule-built deck stands in.
 */
export function starterDeck(el: Element): string[] {
  const listed = (evolved as Partial<Record<Element, string[]>>)[el];
  if (listed && !validateDeck(listed, null).length && listed.every(s => getCard(s)?.tier === 'normal')) return listed.slice();
  return ruleStarterDeck(el);
}

/** Built by rule from the catalog, so it tracks any change to the card list. */
export function ruleStarterDeck(el: Element): string[] {
  const normals = allCards()
    .filter(c => c.tier === 'normal')
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const deck: string[] = [];
  for (const [costStr, want] of Object.entries(CURVE)) {
    const cost = Number(costStr);
    // Own element first, keyworded cards before vanilla ones, then any
    // element at that cost if the pool runs short.
    const pool = [
      ...normals.filter(c => c.cost === cost && c.element === el && c.keywords.length),
      ...normals.filter(c => c.cost === cost && c.element === el && !c.keywords.length),
      ...normals.filter(c => c.cost === cost && c.element !== el),
    ];
    let got = 0;
    for (const c of pool) {
      for (let k = 0; k < MAX_COPIES && got < want; k++, got++) deck.push(c.slug);
      if (got >= want) break;
    }
  }
  return deck;
}

export function starterDecks(): { id: string; name: string; element: Element; cards: string[] }[] {
  return ELEMENTS.map(el => ({ id: `starter-${el}`, name: STARTER_NAMES[el], element: el, cards: starterDeck(el) }));
}
