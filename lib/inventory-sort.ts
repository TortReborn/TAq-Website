// Sort options for the exec Inventory list (TAQ-62).
//
// The list has a curated manual order (inventory_items.sort_order, moved with
// the ↑/↓ row actions) which stays the default; every other option is a pure
// client-side re-ordering of the already-loaded rows. Ties always fall back to
// the manual order so the table never reshuffles arbitrarily.

export type InventorySort =
  | 'manual'
  | 'quantity_desc'
  | 'quantity_asc'
  | 'deficit'
  | 'target_desc'
  | 'target_asc'
  | 'reserve_desc'
  | 'reserve_asc'
  | 'name_asc'
  | 'name_desc'
  | 'updated_desc'
  | 'updated_asc'
  | 'status_asc'
  | 'status_desc'
  | 'location_asc'
  | 'location_desc'
  | 'charges_asc'
  | 'charges_desc'
  | 'category_asc'
  | 'category_desc';

export type InventorySortColumn =
  | 'name'
  | 'quantity'
  | 'target'
  | 'reserve'
  | 'status'
  | 'location'
  | 'charges'
  | 'category'
  | 'updated';

export type InventorySortDirection = 'asc' | 'desc';

export interface SortableInventoryRow {
  name: string;
  quantity: number;
  reserveQuantity: number;
  desiredQuantity: number | null;
  sortOrder: number;
  updatedAt: string;
  enough?: boolean | null;
  bankPage?: string | null;
  reserveBankPage?: string | null;
  charges?: number | null;
  categoryId?: number;
  categoryName?: string | null;
}

export const INVENTORY_SORT_OPTIONS: Array<{ value: InventorySort; label: string; consumableOnly?: boolean }> = [
  { value: 'manual', label: 'Manual order' },
  { value: 'quantity_desc', label: 'Inventory (high → low)' },
  { value: 'quantity_asc', label: 'Inventory (low → high)' },
  { value: 'deficit', label: 'Furthest below target' },
  { value: 'target_desc', label: 'Target (high → low)' },
  { value: 'reserve_desc', label: 'Reserve (high → low)', consumableOnly: true },
  { value: 'name_asc', label: 'Name (A → Z)' },
  { value: 'name_desc', label: 'Name (Z → A)' },
  { value: 'updated_desc', label: 'Recently updated' },
];

const COLUMN_SORTS: Record<InventorySortColumn, { asc: InventorySort; desc: InventorySort; defaultDirection: InventorySortDirection }> = {
  name: { asc: 'name_asc', desc: 'name_desc', defaultDirection: 'asc' },
  quantity: { asc: 'quantity_asc', desc: 'quantity_desc', defaultDirection: 'desc' },
  target: { asc: 'target_asc', desc: 'target_desc', defaultDirection: 'desc' },
  reserve: { asc: 'reserve_asc', desc: 'reserve_desc', defaultDirection: 'desc' },
  status: { asc: 'status_asc', desc: 'status_desc', defaultDirection: 'asc' },
  location: { asc: 'location_asc', desc: 'location_desc', defaultDirection: 'asc' },
  charges: { asc: 'charges_asc', desc: 'charges_desc', defaultDirection: 'desc' },
  category: { asc: 'category_asc', desc: 'category_desc', defaultDirection: 'asc' },
  updated: { asc: 'updated_asc', desc: 'updated_desc', defaultDirection: 'desc' },
};

export function isSortAvailable(sort: InventorySort, consumableView: boolean): boolean {
  return consumableView || (sort !== 'reserve_asc' && sort !== 'reserve_desc');
}

export function inventorySortColumn(sort: InventorySort): InventorySortColumn | null {
  for (const [column, options] of Object.entries(COLUMN_SORTS) as Array<[InventorySortColumn, typeof COLUMN_SORTS[InventorySortColumn]]>) {
    if (sort === options.asc || sort === options.desc) return column;
  }
  return null;
}

export function inventorySortDirection(sort: InventorySort): InventorySortDirection | null {
  const column = inventorySortColumn(sort);
  if (!column) return null;
  return sort === COLUMN_SORTS[column].desc ? 'desc' : 'asc';
}

export function nextInventorySort(sort: InventorySort, column: InventorySortColumn): InventorySort {
  const options = COLUMN_SORTS[column];
  if (sort === options.asc) return options.desc;
  if (sort === options.desc) return options.asc;
  return options[options.defaultDirection];
}

function compareOptionalNumber(a: number | null | undefined, b: number | null | undefined, direction: InventorySortDirection): number {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;
  if (aMissing || bMissing) return (aMissing ? 1 : 0) - (bMissing ? 1 : 0);
  return direction === 'asc' ? a - b : b - a;
}

function compareLocation(a: string | null | undefined, b: string | null | undefined, direction: InventorySortDirection): number {
  const aValue = (a ?? '').trim();
  const bValue = (b ?? '').trim();
  if (!aValue || !bValue) return (!aValue ? 1 : 0) - (!bValue ? 1 : 0);
  const result = aValue.localeCompare(bValue, 'en-US', { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

function compareStatus(a: boolean | null | undefined, b: boolean | null | undefined, direction: InventorySortDirection): number {
  const rank = (value: boolean | null | undefined) => {
    if (value === null || value === undefined) return 2;
    if (direction === 'asc') return value ? 1 : 0;
    return value ? 0 : 1;
  };
  return rank(a) - rank(b);
}

function compare(sort: InventorySort, a: SortableInventoryRow, b: SortableInventoryRow): number {
  switch (sort) {
    case 'quantity_desc':
      return b.quantity - a.quantity;
    case 'quantity_asc':
      return a.quantity - b.quantity;
    case 'deficit': {
      // Rows without a target have no deficit to speak of, so they sink.
      if (a.desiredQuantity === null || b.desiredQuantity === null) {
        return (a.desiredQuantity === null ? 1 : 0) - (b.desiredQuantity === null ? 1 : 0);
      }
      return (b.desiredQuantity - b.quantity) - (a.desiredQuantity - a.quantity);
    }
    case 'target_desc': {
      if (a.desiredQuantity === null || b.desiredQuantity === null) {
        return (a.desiredQuantity === null ? 1 : 0) - (b.desiredQuantity === null ? 1 : 0);
      }
      return b.desiredQuantity - a.desiredQuantity;
    }
    case 'target_asc':
      return compareOptionalNumber(a.desiredQuantity, b.desiredQuantity, 'asc');
    case 'reserve_desc':
      return b.reserveQuantity - a.reserveQuantity;
    case 'reserve_asc':
      return a.reserveQuantity - b.reserveQuantity;
    case 'name_asc':
      return a.name.localeCompare(b.name, 'en-US');
    case 'name_desc':
      return b.name.localeCompare(a.name, 'en-US');
    case 'updated_desc':
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    case 'updated_asc':
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    case 'status_asc':
      return compareStatus(a.enough, b.enough, 'asc');
    case 'status_desc':
      return compareStatus(a.enough, b.enough, 'desc');
    case 'location_asc':
      return compareLocation(a.bankPage, b.bankPage, 'asc');
    case 'location_desc':
      return compareLocation(a.bankPage, b.bankPage, 'desc');
    case 'charges_asc':
      return compareOptionalNumber(a.charges, b.charges, 'asc');
    case 'charges_desc':
      return compareOptionalNumber(a.charges, b.charges, 'desc');
    case 'category_asc':
      return (a.categoryName ?? String(a.categoryId ?? '')).localeCompare(b.categoryName ?? String(b.categoryId ?? ''), 'en-US');
    case 'category_desc':
      return (b.categoryName ?? String(b.categoryId ?? '')).localeCompare(a.categoryName ?? String(a.categoryId ?? ''), 'en-US');
    default:
      return 0;
  }
}

export function sortInventoryRows<T extends SortableInventoryRow>(rows: T[], sort: InventorySort): T[] {
  return [...rows].sort((a, b) => compare(sort, a, b) || a.sortOrder - b.sortOrder);
}
