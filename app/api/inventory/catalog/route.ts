import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { isAuthorizedInventoryClient } from '@/lib/inventory-auth';
import { listScanProfiles } from '@/lib/inventory-scan-profiles';

export const dynamic = 'force-dynamic';

// Read-only catalog for the mod and scripts/check-inventory-catalog-sync.js.
// `items` is what the sync-check script diffs against; `scanProfiles` is what the mod
// fetches on login to know which character banks it can scan.
export async function GET(request: NextRequest) {
  if (!isAuthorizedInventoryClient(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  const pool = getPool();
  try {
    const [itemResult, scanProfiles] = await Promise.all([
      pool.query(
        `SELECT kind, name, scan_key, aliases, storage_bucket
         FROM inventory_items
         WHERE archived = FALSE
         ORDER BY kind, sort_order, name`
      ),
      listScanProfiles(pool, false),
    ]);

    return NextResponse.json({
      items: itemResult.rows.map(row => ({
        kind: row.kind,
        name: row.name,
        scanKey: row.scan_key,
        aliases: row.aliases ?? [],
        storageBucket: row.storage_bucket,
      })),
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
