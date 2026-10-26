// Balance simulations. The quick block always runs and keeps the harness
// honest; the full report is opt-in because it plays thousands of games:
//
//   DUEL_SIM=1 npx vitest run lib/duel/sim.test.ts
//
// Numbers from the last full run are recorded in lib/duel/README.md.

import { describe, expect, it } from 'vitest';
import { allCards } from './catalog';
import { starterDeck } from './deck';
import { Rng } from './rng';
import { buildDeck, matchup, playGame, rate, type DeckSpec } from './sim';
import type { Element } from './types';
import { ELEMENTS } from './types';

const ALL = new Set(['normal', 'unique', 'rare', 'legendary', 'fabled', 'mythic']);
const NORMAL_ONLY = new Set(['normal']);
const NO_NORMALS = new Set(['unique', 'rare', 'legendary', 'fabled', 'mythic']);

const deckOf = (spec: DeckSpec) => (r: Rng) => buildDeck(spec, r);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

describe('duel simulations (quick)', () => {
  it('bot games between starter decks finish cleanly', () => {
    for (let i = 0; i < 10; i++) {
      const r = playGame(starterDeck(ELEMENTS[i % 5]), starterDeck(ELEMENTS[(i + 2) % 5]), 1000 + i);
      expect(r.reason).not.toBeNull();
      expect(r.reason).not.toBe('turn_limit');
    }
  });

  it('builds legal decks for every element and tier mix', () => {
    const rng = new Rng(5);
    for (const el of ELEMENTS) {
      expect(buildDeck({ elements: [el], tiers: NORMAL_ONLY }, rng)).toHaveLength(20);
      expect(buildDeck({ elements: [el], tiers: NO_NORMALS, maxRenowned: true }, rng)).toHaveLength(20);
    }
  });
});

describe.skipIf(!process.env.DUEL_SIM)('duel simulations (full report)', () => {
  const N = Number(process.env.DUEL_SIM_GAMES || 200);

  it('rarity does not decide games', () => {
    // The fairness question: a member who owns every card against one who
    // owns none (free normals only), same element, same bot. "any card"
    // builds from the whole pool to a curve; "all renowned" also forces the
    // four legendary+ slots full, the way a collector showing off would;
    // "no normals" skips the free cheap cards entirely.
    const lines: string[] = [];
    let total = { games: 0, wins: 0, draws: 0 };
    for (const el of ELEMENTS) {
      const t = matchup(
        deckOf({ elements: [el], tiers: ALL }),
        deckOf({ elements: [el], tiers: NORMAL_ONLY }),
        N, 11,
      );
      const flex = matchup(
        deckOf({ elements: [el], tiers: ALL, maxRenowned: true }),
        deckOf({ elements: [el], tiers: NORMAL_ONLY }),
        Math.round(N / 2), 12,
      );
      const bare = matchup(
        deckOf({ elements: [el], tiers: NO_NORMALS, maxRenowned: true }),
        deckOf({ elements: [el], tiers: NORMAL_ONLY }),
        Math.round(N / 2), 13,
      );
      total = { games: total.games + t.games, wins: total.wins + t.wins, draws: total.draws + t.draws };
      lines.push(`  ${el.padEnd(8)} any card ${pct(rate(t)).padStart(6)}   all renowned ${pct(rate(flex)).padStart(6)}   no normals ${pct(rate(bare)).padStart(6)}   (avg ${(t.turns / t.games).toFixed(1)} turns)`);
    }
    const mixed = matchup(
      deckOf({ elements: ['fire', 'earth'], tiers: ALL }),
      deckOf({ elements: ['fire', 'earth'], tiers: NORMAL_ONLY }), N, 12,
    );
    lines.push(`  fire+earth any card ${pct(rate(mixed))}`);
    console.log(`RARITY (win rate against a free all-normal deck of the same element)\n${lines.join('\n')}\n  overall (any card): ${pct(rate(total))}`);
  }, 600_000);

  it('going first is roughly even', () => {
    const t = matchup(deckOf({ elements: ['water', 'air'], tiers: ALL }), deckOf({ elements: ['fire', 'thunder'], tiers: ALL }), N * 2, 21);
    console.log(`FIRST PLAYER win rate: ${pct(t.firstWins / t.games)} over ${t.games} games`);
  }, 600_000);

  it('no element dominates', () => {
    const rows: string[] = [];
    const overall: Record<string, { games: number; wins: number; draws: number }> = {};
    for (const a of ELEMENTS) {
      const cells: string[] = [];
      for (const b of ELEMENTS) {
        if (a === b) { cells.push('   -  '); continue; }
        const t = matchup(deckOf({ elements: [a], tiers: ALL }), deckOf({ elements: [b], tiers: ALL }), Math.round(N / 2), 31 + a.length * 7 + b.length);
        const o = (overall[a] ??= { games: 0, wins: 0, draws: 0 });
        o.games += t.games; o.wins += t.wins; o.draws += t.draws;
        cells.push(pct(rate(t)).padStart(6));
      }
      rows.push(`  ${a.padEnd(8)}${cells.join(' ')}   overall ${pct(rate(overall[a]))}`);
    }
    console.log(`ELEMENTS (row's win rate vs column, mono-element decks, all tiers)\n          ${ELEMENTS.map(e => e.padStart(6)).join(' ')}\n${rows.join('\n')}`);
  }, 600_000);

  it('per-card and per-tier played win rates', () => {
    const rng = new Rng(41);
    const byCard = new Map<string, { games: number; wins: number }>();
    const games = N * 10;
    for (let g = 0; g < games; g++) {
      const pick = (): Element[] => {
        const a = rng.pick(ELEMENTS);
        const b = rng.pick(ELEMENTS);
        return a === b ? [a] : [a, b];
      };
      const da = buildDeck({ elements: pick(), tiers: ALL, maxRenowned: rng.float() < 0.5 }, rng);
      const db = buildDeck({ elements: pick(), tiers: ALL, maxRenowned: rng.float() < 0.5 }, rng);
      const r = playGame(da, db, rng.int(2 ** 31));
      if (r.winner === null) continue;
      for (const side of [0, 1] as const) {
        for (const slug of new Set(r.played[side])) {
          const t = byCard.get(slug) ?? { games: 0, wins: 0 };
          t.games++;
          if (r.winner === side) t.wins++;
          byCard.set(slug, t);
        }
      }
    }
    const defs = new Map(allCards().map(c => [c.slug, c]));
    const byTier = new Map<string, { games: number; wins: number }>();
    const byKit = new Map<string, { games: number; wins: number }>();
    for (const [slug, t] of byCard) {
      const d = defs.get(slug)!;
      const add = (m: Map<string, { games: number; wins: number }>, k: string) => {
        const x = m.get(k) ?? { games: 0, wins: 0 };
        x.games += t.games; x.wins += t.wins; m.set(k, x);
      };
      add(byTier, d.tier);
      for (const kw of d.keywords) add(byKit, `kw:${kw}`);
      for (const a of d.abilities) add(byKit, `${a.when}:${a.name}`);
      if (!d.keywords.length && !d.abilities.length) add(byKit, 'vanilla');
    }
    const fmt = (m: Map<string, { games: number; wins: number }>) => [...m.entries()]
      .filter(([, t]) => t.games >= 30)
      .sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games)
      .map(([k, t]) => `  ${k.padEnd(28)} ${pct(t.wins / t.games).padStart(6)}  (${t.games})`).join('\n');
    const cards = [...byCard.entries()].filter(([, t]) => t.games >= 40)
      .sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games);
    const show = (xs: typeof cards) => xs.map(([s, t]) => `  ${s.padEnd(28)} ${defs.get(s)!.tier.padEnd(9)} c${defs.get(s)!.cost} ${pct(t.wins / t.games).padStart(6)} (${t.games})`).join('\n');
    console.log(`PLAYED WIN RATE BY TIER (${games} games)\n${fmt(byTier)}\n\nBY MECHANIC\n${fmt(byKit)}\n\nTOP CARDS\n${show(cards.slice(0, 12))}\n\nBOTTOM CARDS\n${show(cards.slice(-12))}`);
  }, 900_000);
});
