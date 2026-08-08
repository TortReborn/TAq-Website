import { describe, expect, it } from 'vitest';
import { moveToIndex, slugifyPageName } from './woealer';

const list = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
const ids = (items: { id: number }[] | null) => items?.map(item => item.id) ?? null;

describe('moveToIndex', () => {
  it('moves an item down, accounting for its own removal', () => {
    // Dropping into the gap after index 3 leaves it last, not out of range.
    expect(ids(moveToIndex(list, 1, 4))).toEqual([2, 3, 4, 1]);
    expect(ids(moveToIndex(list, 1, 3))).toEqual([2, 3, 1, 4]);
  });

  it('moves an item up without the removal offset', () => {
    expect(ids(moveToIndex(list, 4, 0))).toEqual([4, 1, 2, 3]);
    expect(ids(moveToIndex(list, 3, 1))).toEqual([1, 3, 2, 4]);
  });

  it('returns null when the item would not actually move', () => {
    expect(moveToIndex(list, 2, 1)).toBeNull();
    expect(moveToIndex(list, 2, 2)).toBeNull();
    expect(moveToIndex(list, 1, 0)).toBeNull();
    expect(moveToIndex(list, 4, 4)).toBeNull();
  });

  it('returns null for an unknown id', () => {
    expect(moveToIndex(list, 99, 0)).toBeNull();
  });

  it('leaves the source list untouched', () => {
    const original = [...list];
    moveToIndex(list, 1, 4);
    expect(list).toEqual(original);
  });
});

describe('slugifyPageName', () => {
  it('lowercases and dashes separators', () => {
    expect(slugifyPageName('Bonus Consu 1')).toBe('bonus-consu-1');
    expect(slugifyPageName("Dry Consu / HE")).toBe('dry-consu-he');
  });

  it('trims leading and trailing separators', () => {
    expect(slugifyPageName('  Account  ')).toBe('account');
    expect(slugifyPageName('---Misc---')).toBe('misc');
  });

  it('returns an empty string when nothing usable remains', () => {
    expect(slugifyPageName('!!!')).toBe('');
  });
});
