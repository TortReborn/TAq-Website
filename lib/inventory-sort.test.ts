import { describe, expect, it } from 'vitest';
import {
  INVENTORY_SORT_OPTIONS,
  inventorySortColumn,
  inventorySortDirection,
  isSortAvailable,
  nextInventorySort,
  sortInventoryRows,
} from './inventory-sort';

interface Row {
  name: string;
  quantity: number;
  reserveQuantity: number;
  desiredQuantity: number | null;
  sortOrder: number;
  updatedAt: string;
  enough?: boolean | null;
  bankPage?: string | null;
}

function row(overrides: Partial<Row> & { name: string }): Row {
  return {
    quantity: 0,
    reserveQuantity: 0,
    desiredQuantity: null,
    sortOrder: 0,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const rows: Row[] = [
  row({ name: 'Charlie', quantity: 30, reserveQuantity: 5, desiredQuantity: 100, sortOrder: 30, updatedAt: '2026-08-01T00:00:00Z' }),
  row({ name: 'Alpha', quantity: 200, reserveQuantity: 1, desiredQuantity: 100, sortOrder: 10, updatedAt: '2026-08-03T00:00:00Z' }),
  row({ name: 'Bravo', quantity: 90, reserveQuantity: 9, desiredQuantity: null, sortOrder: 20, updatedAt: '2026-08-02T00:00:00Z' }),
];

const names = (sorted: Row[]) => sorted.map(entry => entry.name);

describe('sortInventoryRows', () => {
  it('keeps the curated order for the manual option', () => {
    expect(names(sortInventoryRows(rows, 'manual'))).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('does not mutate the input', () => {
    const input = [...rows];
    sortInventoryRows(input, 'quantity_desc');
    expect(names(input)).toEqual(['Charlie', 'Alpha', 'Bravo']);
  });

  it('sorts by inventory in both directions', () => {
    expect(names(sortInventoryRows(rows, 'quantity_desc'))).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(names(sortInventoryRows(rows, 'quantity_asc'))).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('puts the biggest shortfall first and sinks rows without a target', () => {
    // Charlie is 70 short, Alpha is 100 over, Bravo has no target at all.
    expect(names(sortInventoryRows(rows, 'deficit'))).toEqual(['Charlie', 'Alpha', 'Bravo']);
  });

  it('sinks rows without a target when sorting by target', () => {
    expect(names(sortInventoryRows(rows, 'target_desc')).at(-1)).toBe('Bravo');
  });

  it('sorts by reserve, name, and recency', () => {
    expect(names(sortInventoryRows(rows, 'reserve_desc'))).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(names(sortInventoryRows(rows, 'name_asc'))).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(names(sortInventoryRows(rows, 'name_desc'))).toEqual(['Charlie', 'Bravo', 'Alpha']);
    expect(names(sortInventoryRows(rows, 'updated_desc'))).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts by status and natural location labels', () => {
    const statusRows = [
      row({ name: 'Enough', enough: true, bankPage: 'IA10', sortOrder: 10 }),
      row({ name: 'Low', enough: false, bankPage: 'IA2', sortOrder: 20 }),
      row({ name: 'No target', enough: null, bankPage: null, sortOrder: 30 }),
    ];
    expect(names(sortInventoryRows(statusRows, 'status_asc'))).toEqual(['Low', 'Enough', 'No target']);
    expect(names(sortInventoryRows(statusRows, 'status_desc'))).toEqual(['Enough', 'Low', 'No target']);
    expect(names(sortInventoryRows(statusRows, 'location_asc'))).toEqual(['Low', 'Enough', 'No target']);
  });

  it('breaks ties on the curated order', () => {
    const tied = [
      row({ name: 'Second', quantity: 5, sortOrder: 20 }),
      row({ name: 'First', quantity: 5, sortOrder: 10 }),
    ];
    expect(names(sortInventoryRows(tied, 'quantity_desc'))).toEqual(['First', 'Second']);
  });
});

describe('column sort helpers', () => {
  it('toggles the active column and exposes state for table headers', () => {
    expect(nextInventorySort('manual', 'location')).toBe('location_asc');
    expect(nextInventorySort('location_asc', 'location')).toBe('location_desc');
    expect(inventorySortColumn('location_desc')).toBe('location');
    expect(inventorySortDirection('location_desc')).toBe('desc');
  });
});

describe('isSortAvailable', () => {
  it('offers reserve only on the consumables view', () => {
    expect(isSortAvailable('reserve_desc', true)).toBe(true);
    expect(isSortAvailable('reserve_desc', false)).toBe(false);
  });

  it('offers every other option everywhere', () => {
    for (const option of INVENTORY_SORT_OPTIONS.filter(candidate => !candidate.consumableOnly)) {
      expect(isSortAvailable(option.value, false)).toBe(true);
    }
  });
});
