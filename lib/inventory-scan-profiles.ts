import { Pool } from 'pg';

export interface ScanProfile {
  id: number;
  nickname: string;
  contentType: 'consumables' | 'ingredients' | 'materials';
  sourceKey: string;
  displayName: string;
  startPage: number;
  totalPages: number;
  locationPrefix: string;
  sortOrder: number;
  archived: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

function mapRow(row: Record<string, any>): ScanProfile {
  return {
    id: Number(row.id),
    nickname: row.nickname,
    contentType: row.content_type,
    sourceKey: row.source_key,
    displayName: row.display_name,
    startPage: row.start_page,
    totalPages: row.total_pages,
    locationPrefix: row.location_prefix,
    sortOrder: row.sort_order,
    archived: row.archived,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export async function listScanProfiles(pool: Pool, includeArchived = true): Promise<ScanProfile[]> {
  const result = await pool.query(
    `SELECT id, nickname, content_type, source_key, display_name, start_page, total_pages,
            location_prefix, sort_order, archived, updated_by, updated_at
     FROM inventory_scan_profiles
     ${includeArchived ? '' : 'WHERE archived = FALSE'}
     ORDER BY archived, sort_order, nickname`
  );
  return result.rows.map(mapRow);
}

export function normalizeNickname(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}
