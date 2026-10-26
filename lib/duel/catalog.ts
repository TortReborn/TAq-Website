// Builds a battle card for every card the bot can roll.
//
// The bot's cards are Wynncraft NPCs and bosses with a name, art and a
// rarity, nothing else. Each one gets, deterministically from its slug:
//   element  signature > ELEMENT_OVERRIDES > name keywords > slug hash
//   cost     from the tier's cost spread (altar bosses: from their level)
//   kit      keywords/abilities drawn from the element's pool, as many as
//            the tier template allows
//   stats    solved so the whole card lands on its cost budget
// Same slug, same card, on every server and in every browser. Changing any
// of this changes live cards: bump RULES_VERSION in engine.ts when you do.

import raw from '@/data/duel/cards.json';
import { budget, K, solveStats, type Coefficients, type TokenLookup } from './balance';
import { hash, Rng } from './rng';
import { ELEMENT_OVERRIDES, SIGNATURES, type Signature } from './signatures';
import type { Ability, CardDef, Element, Keyword, Tier } from './types';
import { ELEMENTS } from './types';

interface RawCard {
  slug: string;
  name: string;
  tier: string;
  image_url: string;
  wiki_url?: string;
  raid?: string;
  dungeon?: string;
  altar?: string;
  level?: number;
}

export const RAW_CARDS: RawCard[] = (raw as { cards: RawCard[] }).cards;
export const CARD_SETS: { id: string; name: string; slugs: string[] }[] = (raw as { sets: { id: string; name: string; slugs: string[] }[] }).sets;

// --- Elements ---------------------------------------------------------------

/** Share of stat points that go to power. */
export const ELEMENT_SHAPE: Record<Element, number> = {
  fire: 0.62, thunder: 0.56, air: 0.5, water: 0.44, earth: 0.36,
};

/** Checked in this order; the first match wins. */
const NAME_HINTS: [Element, RegExp][] = [
  ['water', /boat|captain|sea|admiral|fish|pirate|lighthouse|island|selchar|olux|tide|frost|ice|snow|lake|river|wave|swamp|sewer|nesaak|lusuco|bath|squid|sailor|port/],
  ['fire', /fire|flame|ember|chef|cook|smith|forge|molten|lava|demon|hell|cinfras|burn|ash|hive|zealot|rage|warlord|executioner|blood|infern|brimstone|dragon|kander/],
  ['earth', /dogun|dwarf|miner|excavat|gert|farm|troll|garden|elder|oak|birch|stone|rock|golem|cow|ragni|detlas|soldier|guard|knight|mountain|sand|tomb|root|tree|forest|druid|mushroom|almuj|mine/],
  ['thunder', /corkus|mechanic|engineer|robot|machine|computer|sky|airship|pilot|thunder|storm|spark|electr|volt|rodoroc|scientist|professor|dr-|inventor|clock|factory/],
  ['air', /air|wind|gust|bird|feather|travel|guide|envoy|seer|spirit|ghost|wraith|eye|void|shadow|phantom|merchant|bard|juggler|child|witch|mage|wizard|sage|oracle|monk|cloud|light/],
];

export function elementFor(slug: string): Element {
  const sig = SIGNATURES[slug];
  if (sig) return sig.element;
  if (ELEMENT_OVERRIDES[slug]) return ELEMENT_OVERRIDES[slug];
  for (const [el, re] of NAME_HINTS) if (re.test(slug)) return el;
  return ELEMENTS[hash(slug) % ELEMENTS.length];
}

// --- Tokens ----------------------------------------------------------------

export const TOKENS: Record<string, CardDef> = Object.fromEntries(([
  ['token-stone-wall', 'Stone Wall', 'earth', 0, 2, ['guard']],
  ['token-grub', 'Wyrmling Grub', 'earth', 2, 2, []],
  ['token-spark', 'Spark', 'thunder', 1, 1, ['rush']],
  ['token-droplet', 'Deckhand', 'water', 1, 2, []],
  ['token-ember', 'Hive Drone', 'fire', 2, 1, []],
  ['token-wisp', 'Wisp', 'air', 1, 1, ['stealth']],
] as [string, string, Element, number, number, Keyword[]][]).map(([slug, name, element, power, health, keywords]) => [
  slug,
  { slug, name, tier: 'token', element, cost: 1, power, health, keywords, abilities: [], image: '' } satisfies CardDef,
]));

const tokenLookup: TokenLookup = slug => TOKENS[slug];

// --- Kits ------------------------------------------------------------------

type AbilityMaker = (cost: number) => Ability;

interface ElementPool {
  keywords: Keyword[];
  play: AbilityMaker[];
  move: AbilityMaker[];
  death: AbilityMaker[];
}

const half = (c: number) => Math.max(1, Math.ceil(c / 2));

const POOLS: Record<Element, ElementPool> = {
  fire: {
    keywords: ['pierce', 'rush'],
    play: [
      c => ({ when: 'play', name: 'Firebolt', target: 'enemy', effects: [{ k: 'damage', n: half(c), t: 'chosen' }] }),
      c => ({ when: 'play', name: 'Wildfire', effects: [{ k: 'damage', n: c >= 6 ? 2 : 1, t: 'all_enemy_units' }] }),
      c => ({ when: 'play', name: 'Kindle', effects: [{ k: 'damage', n: Math.max(1, c - 1), t: 'random_enemy' }] }),
    ],
    move: [
      () => ({ when: 'move', name: 'Scorch', cost: 2, target: 'enemy_unit', effects: [{ k: 'damage', n: 2, t: 'chosen' }] }),
      () => ({ when: 'move', name: 'Flare', cost: 2, effects: [{ k: 'damage', n: 2, t: 'enemy_hero' }] }),
    ],
    death: [
      () => ({ when: 'death', name: 'Last Ember', effects: [{ k: 'damage', n: 2, t: 'random_enemy' }] }),
    ],
  },
  thunder: {
    keywords: ['rush', 'ranged', 'pierce'],
    play: [
      c => ({ when: 'play', name: 'Chain Lightning', effects: [{ k: 'chain', n: Math.max(1, c - 1) }] }),
      () => ({ when: 'play', name: 'Charge Up', effects: [{ k: 'buff', atk: 1, hp: 0, t: 'other_ally_units' }] }),
      () => ({ when: 'play', name: 'Static', effects: [{ k: 'summon', token: 'token-spark', n: 1 }] }),
    ],
    move: [
      () => ({ when: 'move', name: 'Overcharge', cost: 1, target: 'ally_unit', effects: [{ k: 'buff', atk: 1, hp: 0, t: 'chosen' }] }),
      () => ({ when: 'move', name: 'Arc', cost: 2, effects: [{ k: 'chain', n: 2 }] }),
    ],
    death: [
      () => ({ when: 'death', name: 'Discharge', effects: [{ k: 'chain', n: 2 }] }),
    ],
  },
  water: {
    keywords: ['drain', 'regen'],
    play: [
      c => ({ when: 'play', name: 'Renew', target: 'ally', effects: [{ k: 'heal', n: Math.min(4, Math.max(2, c)), t: 'chosen' }] }),
      () => ({ when: 'play', name: 'Frostbite', target: 'enemy_unit', effects: [{ k: 'freeze', t: 'chosen' }] }),
      () => ({ when: 'play', name: 'Insight', effects: [{ k: 'draw', n: 1 }] }),
    ],
    move: [
      () => ({ when: 'move', name: 'Mend', cost: 1, target: 'ally', effects: [{ k: 'heal', n: 2, t: 'chosen' }] }),
      () => ({ when: 'move', name: 'Frost', cost: 2, target: 'enemy_unit', effects: [{ k: 'freeze', t: 'chosen' }] }),
    ],
    death: [
      () => ({ when: 'death', name: 'Undertow', effects: [{ k: 'draw', n: 1 }] }),
    ],
  },
  earth: {
    keywords: ['guard', 'shield', 'regen'],
    play: [
      c => ({ when: 'play', name: 'Harden', target: 'ally_unit', effects: [{ k: 'buff', atk: 0, hp: half(c), t: 'chosen' }] }),
      () => ({ when: 'play', name: 'Raise Wall', effects: [{ k: 'summon', token: 'token-stone-wall', n: 1 }] }),
      () => ({ when: 'play', name: 'Bulwark', target: 'ally_unit', effects: [{ k: 'grant', kw: 'shield', t: 'chosen' }] }),
    ],
    move: [
      () => ({ when: 'move', name: 'Fortify', cost: 1, target: 'ally_unit', effects: [{ k: 'buff', atk: 0, hp: 2, t: 'chosen' }] }),
      () => ({ when: 'move', name: 'Entrench', cost: 2, target: 'ally_unit', effects: [{ k: 'grant', kw: 'guard', t: 'chosen' }] }),
    ],
    death: [
      () => ({ when: 'death', name: 'Rubble', effects: [{ k: 'summon', token: 'token-stone-wall', n: 1 }] }),
    ],
  },
  air: {
    keywords: ['stealth', 'ranged'],
    play: [
      c => ({ when: 'play', name: 'Gale', target: 'enemy_unit', effects: [{ k: 'bounce', t: 'chosen', maxCost: Math.max(1, c - 1) }] }),
      () => ({ when: 'play', name: 'Tailwind', effects: [{ k: 'draw', n: 1 }] }),
      () => ({ when: 'play', name: 'Whisk', effects: [{ k: 'summon', token: 'token-wisp', n: 1 }] }),
    ],
    move: [
      () => ({ when: 'move', name: 'Gust', cost: 3, target: 'enemy_unit', effects: [{ k: 'bounce', t: 'chosen', maxCost: 3 }] }),
      () => ({ when: 'move', name: 'Scout', cost: 2, effects: [{ k: 'draw', n: 1 }] }),
    ],
    death: [
      () => ({ when: 'death', name: 'Drift', effects: [{ k: 'draw', n: 1 }] }),
    ],
  },
};

/** How many of each piece a tier's template gets. `play|move` means one of either. */
const TEMPLATES: Record<string, { keywords: [number, number]; slots: ('play' | 'move' | 'death' | 'play|move' | 'play|death')[] }[]> = {
  normal: [
    { keywords: [0, 0], slots: [] },
    { keywords: [1, 1], slots: [] },
  ],
  unique: [
    { keywords: [1, 1], slots: [] },
    { keywords: [0, 0], slots: ['play|death'] },
  ],
  rare: [
    { keywords: [1, 1], slots: ['play|move'] },
    { keywords: [0, 0], slots: ['play', 'death'] },
  ],
  legendary: [
    { keywords: [1, 2], slots: ['move'] },
    { keywords: [1, 1], slots: ['play', 'move'] },
  ],
  fabled: [
    { keywords: [1, 1], slots: ['play', 'move'] },
  ],
  mythic: [
    { keywords: [1, 2], slots: ['play', 'move'] },
  ],
  member: [
    { keywords: [1, 1], slots: ['play'] },
  ],
};

/** Cost spread per tier: index = cost, value = weight. */
const COST_WEIGHTS: Record<string, number[]> = {
  unique:    [0, 1, 3, 4, 4, 3, 1],
  rare:      [0, 0, 2, 3, 4, 4, 3, 1],
  legendary: [0, 0, 0, 1, 3, 4, 4, 3],
  fabled:    [0, 0, 0, 0, 0, 2, 4, 4, 2],
  mythic:    [0, 0, 0, 0, 0, 0, 0, 3, 3, 2],
  member:    [0, 0, 0, 0, 1, 2, 1],
};

function weighted(rng: Rng, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.float() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

function costFor(card: RawCard, tier: string, rng: Rng): number {
  // Altar bosses span levels 20-119; map that onto cost 2-7.
  if (card.level) return Math.max(2, Math.min(7, Math.round(card.level / 17)));
  // The free tier's spread is a balance lever (how much late game a new
  // player can reach), so it lives with the other coefficients.
  const cost = weighted(rng, tier === 'normal' ? K.normalCostWeights : COST_WEIGHTS[tier] ?? COST_WEIGHTS.normal);
  // A dungeon's final boss should not come down on turn two.
  return card.dungeon || card.raid ? Math.max(4, cost) : cost;
}

function originFor(card: RawCard): string | undefined {
  if (card.raid) return `Raid: ${card.raid}`;
  if (card.dungeon) return `Dungeon: ${card.dungeon}`;
  if (card.altar) return `Boss Altar: ${card.altar}${card.level ? ` (Lv. ${card.level})` : ''}`;
  return undefined;
}

function rollKit(el: Element, tier: string, cost: number, rng: Rng): { keywords: Keyword[]; abilities: Ability[] } {
  const pool = POOLS[el];
  const template = rng.pick(TEMPLATES[tier] ?? TEMPLATES.normal);
  const [lo, hi] = template.keywords;
  const nKw = lo + rng.int(hi - lo + 1);
  const keywords: Keyword[] = [];
  const kwChoices = [...pool.keywords];
  while (keywords.length < nKw && kwChoices.length) {
    const kw = kwChoices.splice(rng.int(kwChoices.length), 1)[0];
    keywords.push(kw);
  }
  const abilities: Ability[] = [];
  for (const slot of template.slots) {
    const kinds = slot.split('|') as ('play' | 'move' | 'death')[];
    const kind = kinds[rng.int(kinds.length)];
    // Moves need a body that lives long enough to use them.
    const k = kind === 'move' && cost < 3 ? 'play' : kind;
    abilities.push(rng.pick(pool[k])(cost));
  }
  return { keywords, abilities };
}

function build(
  card: { slug: string; name: string; image: string; wiki?: string; origin?: string },
  tier: Tier,
  el: Element,
  cost: number,
  keywords: Keyword[],
  abilities: Ability[],
  shape: number,
  signature: boolean,
): CardDef | null {
  const stats = solveStats(budget(cost, tier, el), shape, keywords, abilities, tokenLookup);
  if (!stats) return null;
  return { ...card, tier, element: el, cost, ...stats, keywords, abilities, signature: signature || undefined };
}

/**
 * Ruleset-specific replacements for hand-written cards (war/signatures.ts).
 * Empty for the duel game; the balance lab fills it for a war run and
 * rebuilds the catalog.
 */
export const SIGNATURE_OVERRIDES: Record<string, Signature> = {};

function generate(card: RawCard): CardDef {
  const tier = card.tier as Tier;
  const el = elementFor(card.slug);
  const face = { slug: card.slug, name: card.name, image: card.image_url, wiki: card.wiki_url, origin: originFor(card) };
  const sig = SIGNATURE_OVERRIDES[card.slug] ?? SIGNATURES[card.slug];
  if (sig) {
    const def = build(face, tier, el, sig.cost, sig.keywords ?? [], sig.abilities ?? [], sig.shape ?? ELEMENT_SHAPE[el], true);
    if (def) return def;
    // A coefficient change priced this kit past its cost. Keep the site up
    // with a minimal body; catalog.test.ts fails until the signature is fixed.
    OVER_BUDGET.push(card.slug);
    const minimal = { power: sig.keywords?.includes('guard') ? 0 : 1, health: 1 };
    return { ...face, tier, element: el, cost: sig.cost, ...minimal, keywords: sig.keywords ?? [], abilities: sig.abilities ?? [], signature: true };
  }
  const rng = new Rng(hash(card.slug));
  const cost = costFor(card, tier, rng);
  // A roll can occasionally price itself out of a small budget; retry, then
  // fall back to a vanilla body so every card is playable.
  for (let attempt = 0; attempt < 6; attempt++) {
    const kit = rollKit(el, tier, cost, rng);
    const def = build(face, tier, el, cost, kit.keywords, kit.abilities, ELEMENT_SHAPE[el], false);
    if (def && def.power + def.health >= Math.min(3, cost + 1)) return def;
  }
  // A tuner experiment can price even a vanilla body out of a tiny budget;
  // a 1/1 keeps every card playable (never reached with the shipped prices).
  return build(face, tier, el, cost, [], [], ELEMENT_SHAPE[el], false)
    ?? { ...face, tier, element: el, cost, power: 1, health: 1, keywords: [], abilities: [] };
}

/** Signatures that did not fit their budget on the last build. */
export const OVER_BUDGET: string[] = [];

const buildAll = () => Object.fromEntries(RAW_CARDS.map(c => [c.slug, generate(c)])) as Record<string, CardDef>;
let CATALOG = buildAll();

/**
 * Every card as another set of coefficients would build it (a ruleset's own
 * prices, grid/cards.ts), leaving the live catalog and K exactly as they were.
 */
export function catalogWith(coefficients: Coefficients, signatures: Record<string, Signature> = {}): Record<string, CardDef> {
  const saved = structuredClone(K);
  const over = OVER_BUDGET.slice();
  const sigs = { ...SIGNATURE_OVERRIDES };
  try {
    for (const k of Object.keys(SIGNATURE_OVERRIDES)) delete SIGNATURE_OVERRIDES[k];
    Object.assign(SIGNATURE_OVERRIDES, signatures);
    for (const key of new Set([...Object.keys(K), ...Object.keys(coefficients)]) as Set<keyof Coefficients>) {
      (K as Record<string, unknown>)[key] = structuredClone(coefficients[key]);
    }
    return buildAll();
  } finally {
    for (const key of new Set([...Object.keys(K), ...Object.keys(saved)]) as Set<keyof Coefficients>) {
      if (saved[key] === undefined) delete (K as Record<string, unknown>)[key];
      else (K as Record<string, unknown>)[key] = saved[key];
    }
    OVER_BUDGET.length = 0;
    OVER_BUDGET.push(...over);
    for (const k of Object.keys(SIGNATURE_OVERRIDES)) delete SIGNATURE_OVERRIDES[k];
    Object.assign(SIGNATURE_OVERRIDES, sigs);
  }
}

/** Regenerate every card from the current balance coefficients (tuner only). */
export function rebuildCatalog() {
  OVER_BUDGET.length = 0;
  CATALOG = buildAll();
}

export function getCard(slug: string): CardDef | undefined {
  return CATALOG[slug] ?? TOKENS[slug];
}

export function allCards(): CardDef[] {
  return Object.values(CATALOG);
}

/**
 * A guild member's one-of-a-kind card (card_members). Built from the slug the
 * same way as any other card; the name and portrait come from the member row.
 */
export function memberCard(slug: string, ign: string, uuid: string): CardDef {
  const el = ELEMENTS[hash(slug) % ELEMENTS.length];
  const rng = new Rng(hash(slug));
  const cost = weighted(rng, COST_WEIGHTS.member);
  const face = { slug, name: ign, image: `https://visage.surgeplay.com/bust/256/${uuid}`, origin: 'Guild member' };
  for (let attempt = 0; attempt < 6; attempt++) {
    const kit = rollKit(el, 'member', cost, rng);
    const def = build(face, 'member', el, cost, kit.keywords, kit.abilities, ELEMENT_SHAPE[el], false);
    if (def) return def;
  }
  return build(face, 'member', el, cost, [], [], ELEMENT_SHAPE[el], false)
    ?? { ...face, tier: 'member', element: el, cost, power: 1, health: 1, keywords: [], abilities: [] };
}
