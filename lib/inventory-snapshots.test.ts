import { describe, expect, it } from 'vitest';
import { aggregateInventorySnapshots, matchInventorySnapshot } from './inventory-snapshots';

const items = [
  { id: 1, name: 'Golden Avia Feathers', scanKey: 'Golden Avia Feathers', aliases: ['Golden Avia Feather'] },
  { id: 2, name: 'MR Pot', scanKey: 'MR Pot', aliases: [] },
];

describe('inventory source snapshots', () => {
  it('matches aliases and preserves unknown entries', () => {
    const result = matchInventorySnapshot({ 'Golden Avia Feather': 12, Mystery: 4 }, items);
    expect(result.matchedCounts).toEqual({ 'Golden Avia Feathers': 12 });
    expect(result.unmatched).toEqual({ Mystery: 4 });
    expect(result.matched).toBe(1);
  });

  it('adds quantities from independent storage classes', () => {
    const totals = aggregateInventorySnapshots([
      { 'Golden Avia Feathers': 64, 'MR Pot': 3 },
      { 'Golden Avia Feather': 32, 'MR Pot': 5 },
    ], items);
    expect(totals.get(1)).toBe(96);
    expect(totals.get(2)).toBe(8);
  });

  it('keeps a zeroed source from erasing another source', () => {
    const totals = aggregateInventorySnapshots([
      { 'MR Pot': 0 },
      { 'MR Pot': 7 },
    ], items);
    expect(totals.get(2)).toBe(7);
  });
});
