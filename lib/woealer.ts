import type { Pool } from 'pg';

export interface WoealerPage {
  id: number;
  name: string;
  slug: string;
  shared: boolean;
  notes: string;
  sortOrder: number;
  archived: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

export interface WoealerSlot {
  id: number;
  pageId: number;
  label: string;
  contents: string;
  sortOrder: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface WoealerData {
  pages: WoealerPage[];
  slots: WoealerSlot[];
}

/**
 * Move the item with `id` to `index`, where `index` counts gaps in the original
 * list (0 = before the first row, list.length = after the last). Returns null
 * when the move is a no-op.
 */
export function moveToIndex<T extends { id: number }>(items: T[], id: number, index: number): T[] | null {
  const from = items.findIndex(item => item.id === id);
  if (from === -1) return null;
  const target = index > from ? index - 1 : index;
  if (target === from || target < 0 || target >= items.length) return null;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

export function slugifyPageName(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function loadWoealer(pool: Pool): Promise<WoealerData> {
  const [pageResult, slotResult] = await Promise.all([
    pool.query(
      `SELECT id, name, slug, shared, notes, sort_order, archived, updated_by, updated_at
       FROM woealer_pages
       ORDER BY shared DESC, sort_order, name`
    ),
    pool.query(
      `SELECT id, page_id, label, contents, sort_order, updated_by, updated_at
       FROM woealer_slots
       ORDER BY sort_order, id`
    ),
  ]);

  return {
    pages: pageResult.rows.map(row => ({
      id: Number(row.id),
      name: row.name,
      slug: row.slug,
      shared: row.shared,
      notes: row.notes ?? '',
      sortOrder: row.sort_order,
      archived: row.archived,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    })),
    slots: slotResult.rows.map(row => ({
      id: Number(row.id),
      pageId: Number(row.page_id),
      label: row.label,
      contents: row.contents ?? '',
      sortOrder: row.sort_order,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    })),
  };
}
