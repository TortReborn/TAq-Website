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
  | 'reserve_desc'
  | 'name_asc'
  | 'name_desc'
  | 'updated_desc';

export interface SortableInventoryRow {
  name: string;
  quantity: number;
  reserveQuantity: number;
  desiredQuantity: number | null;
  sortOrder: number;
  updatedAt: string;
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

export function isSortAvailable(sort: InventorySort, consumableView: boolean): boolean {
  const option = INVENTORY_SORT_OPTIONS.find(candidate => candidate.value === sort);
  if (!option) return false;
  return !option.consumableOnly || consumableView;
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
    case 'reserve_desc':
      return b.reserveQuantity - a.reserveQuantity;
    case 'name_asc':
      return a.name.localeCompare(b.name, 'en-US');
    case 'name_desc':
      return b.name.localeCompare(a.name, 'en-US');
    case 'updated_desc':
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    default:
      return 0;
  }
}

export function sortInventoryRows<T extends SortableInventoryRow>(rows: T[], sort: InventorySort): T[] {
  return [...rows].sort((a, b) => compare(sort, a, b) || a.sortOrder - b.sortOrder);
}
