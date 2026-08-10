import { describe, expect, it } from 'vitest';
import {
  aggregateInventorySnapshots,
  isReserveInventorySource,
  matchInventoryLocationReports,
  matchInventoryLocations,
  matchInventorySnapshot,
} from './inventory-snapshots';

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

  it('only classifies Bonus Consu snapshots as reserve', () => {
    expect(isReserveInventorySource('character_bank:bonus-consu-1')).toBe(true);
    expect(isReserveInventorySource('character_bank:bonus-consu-3')).toBe(true);
    expect(isReserveInventorySource('character_bank:dry-consu')).toBe(false);
    expect(isReserveInventorySource('account_bank')).toBe(false);
  });

  it('maps reported pages onto matched item ids and skips unknown names', () => {
    const locations = matchInventoryLocations({ 'Golden Avia Feather': 3, Mystery: 1 }, items);
    expect(locations.get(1)).toBe(3);
    expect(locations.has(2)).toBe(false);
    expect(locations.size).toBe(1);
  });

  it('chooses the page where the matched item was seen most often', () => {
    const locations = matchInventoryLocationReports([
      { name: 'Golden Avia Feather', page: 7, quantity: 12 },
      { name: 'Golden Avia Feathers', page: 4, quantity: 80 },
      { name: 'Golden Avia Feathers', page: 2, quantity: 80 },
      { name: 'Mystery', page: 1, quantity: 99 },
    ], items);
    expect(locations.get(1)).toBe(2);
    expect(locations.has(2)).toBe(false);
  });
});
