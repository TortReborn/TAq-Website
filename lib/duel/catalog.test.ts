import { describe, expect, it } from 'vitest';
import { budget, cardValue } from './balance';
import { allCards, getCard, memberCard, OVER_BUDGET, RAW_CARDS, TOKENS } from './catalog';
import { SIGNATURES, ELEMENT_OVERRIDES } from './signatures';
import { ELEMENTS } from './types';

const tokens = (slug: string) => TOKENS[slug];

describe('duel catalog', () => {
  it('builds a battle card for every card the bot can roll', () => {
    expect(allCards()).toHaveLength(RAW_CARDS.length);
    for (const c of allCards()) {
      expect(c.health).toBeGreaterThanOrEqual(1);
      expect(c.power).toBeGreaterThanOrEqual(0);
      expect(c.cost).toBeGreaterThanOrEqual(1);
      expect(c.cost).toBeLessThanOrEqual(9);
    }
  });

  it('fits every hand-written signature inside its cost budget', () => {
    expect(OVER_BUDGET).toEqual([]);
  });

  it('prices every card within a point of its cost budget, whatever its rarity', () => {
    for (const c of allCards()) {
      const v = cardValue(c, tokens);
      const b = budget(c.cost, c.tier, c.element);
      expect(v, c.slug).toBeLessThanOrEqual(b + 0.5);
      expect(v, c.slug).toBeGreaterThanOrEqual(b - 1.5);
    }
  });

  it('is deterministic', () => {
    const a = JSON.stringify(allCards().map(c => [c.slug, c.cost, c.power, c.health, c.keywords, c.abilities]));
    const m1 = memberCard('member-test', 'Test', '00000000000000000000000000000000');
    const m2 = memberCard('member-test', 'Test', '00000000000000000000000000000000');
    expect(m1).toEqual(m2);
    expect(a.length).toBeGreaterThan(1000);
  });

  it('only names cards that exist', () => {
    for (const slug of [...Object.keys(SIGNATURES), ...Object.keys(ELEMENT_OVERRIDES)]) {
      expect(getCard(slug), slug).toBeDefined();
    }
  });

  it('spreads elements evenly enough that every element can fill a deck at every tier', () => {
    const counts = Object.fromEntries(ELEMENTS.map(e => [e, 0])) as Record<string, number>;
    for (const c of allCards()) counts[c.element]++;
    for (const e of ELEMENTS) {
      expect(counts[e], e).toBeGreaterThan(allCards().length * 0.12);
      expect(counts[e], e).toBeLessThan(allCards().length * 0.28);
      const normals = allCards().filter(c => c.element === e && c.tier === 'normal');
      expect(normals.length, e).toBeGreaterThanOrEqual(20);
    }
  });
});
