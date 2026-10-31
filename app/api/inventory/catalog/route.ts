import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { isAuthorizedInventoryClient } from '@/lib/inventory-auth';
import { listScanProfiles } from '@/lib/inventory-scan-profiles';

export const dynamic = 'force-dynamic';

type CatalogRow = { kind: string; name: string; scan_key: string; aliases: string[] | null; storage_bucket: string };

const toCatalogItem = (row: CatalogRow) => ({
  kind: row.kind,
  name: row.name,
  scanKey: row.scan_key,
  aliases: row.aliases ?? [],
  storageBucket: row.storage_bucket,
});

// Read-only: `items` for the mod's matcher and the sync-check script, `scanProfiles` for the
// mod's login fetch. `?include=archived` adds `archivedItems` so the sync check can tell an
// item execs retired from one the website never had; the mod doesn't send it.
export async function GET(request: NextRequest) {
  if (!isAuthorizedInventoryClient(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  const includeArchived = request.nextUrl.searchParams.get('include') === 'archived';
  const pool = getPool();
  try {
    const [itemResult, scanProfiles] = await Promise.all([
      pool.query<CatalogRow & { archived: boolean }>(
        `SELECT kind, name, scan_key, aliases, storage_bucket, archived
         FROM inventory_items
         ${includeArchived ? '' : 'WHERE archived = FALSE'}
         ORDER BY kind, sort_order, name`
      ),
      listScanProfiles(pool, false),
    ]);

    return NextResponse.json({
      items: itemResult.rows.filter(row => !row.archived).map(toCatalogItem),
      ...(includeArchived && { archivedItems: itemResult.rows.filter(row => row.archived).map(toCatalogItem) }),
      scanProfiles: scanProfiles.map(profile => ({
        nickname: profile.nickname,
        contentType: profile.contentType,
        sourceKey: profile.sourceKey,
        displayName: profile.displayName,
        startPage: profile.startPage,
        totalPages: profile.totalPages,
      })),
    });
  } catch (error) {
    console.error('Inventory catalog fetch error:', error);
    return NextResponse.json({ error: 'Failed to load inventory catalog.' }, { status: 500 });
  }
}
