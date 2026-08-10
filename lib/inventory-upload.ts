import { Pool, PoolClient } from 'pg';
import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import {
  aggregateInventorySnapshots,
  InventoryMatchItem,
  isReserveInventorySource,
  matchInventoryLocationReports,
  matchInventoryLocations,
  matchInventorySnapshot,
} from '@/lib/inventory-snapshots';
import { isAuthorizedInventoryClient } from '@/lib/inventory-auth';

// Non-character-bank sources; everything else looks up location_prefix by source_key.
const FIXED_LOCATION_PREFIXES: Record<string, string> = {
  misc_bucket: 'B',
  account_bank: '',
};

async function resolveLocationPrefix(client: Pool | PoolClient, scanType: string, sourceKey: string): Promise<string> {
  const result = await client.query(`SELECT location_prefix FROM inventory_scan_profiles WHERE source_key = $1`, [sourceKey]);
  if (result.rows.length > 0) return result.rows[0]?.location_prefix ?? '';
  if (scanType in FIXED_LOCATION_PREFIXES) return FIXED_LOCATION_PREFIXES[scanType];
  return '';
}

// One entry per scan_type the mod can upload; add a row here for new kinds.
const SCAN_TYPE_CONFIG: Record<string, { itemKind: string; field: 'ingredients' | 'consumables' | 'materials'; sourceBuckets: string[] }> = {
  misc_bucket: { itemKind: 'ingredient', field: 'ingredients', sourceBuckets: ['misc_bucket'] },
  account_bank: { itemKind: 'consumable', field: 'consumables', sourceBuckets: ['account_bank', 'character_bank'] },
  character_bank: { itemKind: 'consumable', field: 'consumables', sourceBuckets: ['account_bank', 'character_bank'] },
  materials_bucket: { itemKind: 'material', field: 'materials', sourceBuckets: ['materials_bucket'] },
};
const SOURCE_KEY_PATTERN = /^[a-z0-9:_-]{1,120}$/;

function asCountMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([name, count]) => name.trim() && Number.isInteger(count) && Number(count) >= 0)
      .map(([name, count]) => [name.trim(), Number(count)])
  );
}

function parseJsonCountMap(value: unknown): Record<string, number> {
  if (!value) return {};
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return asCountMap(parsed);
}

function asLocationReports(value: unknown): Array<{ name: string; page: number; quantity: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const page = Number(record.page);
    const quantity = Number(record.quantity);
    if (!name || !Number.isInteger(page) || page <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      return [];
    }
    return [{ name, page, quantity }];
  });
}

export async function handleInventoryUpload(request: NextRequest) {
  if (!isAuthorizedInventoryClient(request)) {
    return NextResponse.json({ error: 'Only Woealer can upload inventory snapshots.' }, { status: 403 });
  }
  const uploader = 'Woealer';

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const scanType = typeof body.scanType === 'string' ? body.scanType : '';
  const scanConfig = SCAN_TYPE_CONFIG[scanType];
  if (!scanConfig) {
    return NextResponse.json({ error: 'Invalid scan type.' }, { status: 400 });
  }

  const requestedSourceKey = typeof body.sourceKey === 'string' ? body.sourceKey.trim().toLocaleLowerCase('en-US') : scanType;
  if (!SOURCE_KEY_PATTERN.test(requestedSourceKey)) {
    return NextResponse.json({ error: 'Invalid inventory source key.' }, { status: 400 });
  }
  const sourceName = (typeof body.sourceName === 'string' && body.sourceName.trim() ? body.sourceName.trim() : scanType).slice(0, 120);
  const itemKind = scanConfig.itemKind;
  const reported = asCountMap(body[scanConfig.field]);
  const reportedPages = asCountMap(body.pages);
  const reportedLocations = asLocationReports(body.locations);
  const reserveSource = isReserveInventorySource(requestedSourceKey);
  const clientTimestamp = typeof body.timestamp === 'number' && Number.isFinite(body.timestamp)
    ? new Date(body.timestamp)
    : null;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemResult = await client.query(
      `SELECT id, name, scan_key, aliases, storage_bucket
       FROM inventory_items
       WHERE kind = $1 AND archived = FALSE
       ORDER BY sort_order, id
       FOR UPDATE`,
      [itemKind]
    );
    const items: Array<InventoryMatchItem & { storageBucket: string }> = itemResult.rows.map(row => ({
      id: Number(row.id),
      name: row.name,
      scanKey: row.scan_key,
      aliases: row.aliases ?? [],
      storageBucket: row.storage_bucket,
    }));
    const sourceItems = itemKind !== 'consumable' || reserveSource
      ? items
      : items.filter(item => item.storageBucket === scanType);
    const { matchedCounts, unmatched, matched } = matchInventorySnapshot(reported, sourceItems);
    const locationPrefix = await resolveLocationPrefix(client, scanType, requestedSourceKey);
    const locations = reportedLocations.length > 0
      ? matchInventoryLocationReports(reportedLocations, sourceItems)
      : matchInventoryLocations(reportedPages, sourceItems);

    await client.query(
      `INSERT INTO inventory_scan_sources (
         storage_bucket, source_key, source_name, item_counts, unknown_items,
         uploaded_by, client_timestamp, updated_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, NOW())
       ON CONFLICT (storage_bucket, source_key) DO UPDATE SET
         source_name = EXCLUDED.source_name,
         item_counts = EXCLUDED.item_counts,
         unknown_items = EXCLUDED.unknown_items,
         uploaded_by = EXCLUDED.uploaded_by,
         client_timestamp = EXCLUDED.client_timestamp,
         updated_at = NOW()`,
      [scanType, requestedSourceKey, sourceName, JSON.stringify(matchedCounts), JSON.stringify(unmatched), uploader, clientTimestamp]
    );

    const snapshotResult = await client.query(
      `SELECT source_key, item_counts
       FROM inventory_scan_sources
       WHERE storage_bucket = ANY($1::text[])`,
      [scanConfig.sourceBuckets]
    );
    const stockTotals = aggregateInventorySnapshots(
      snapshotResult.rows
        .filter(row => !isReserveInventorySource(row.source_key))
        .map(row => parseJsonCountMap(row.item_counts)),
      items
    );
    const reserveTotals = itemKind === 'consumable'
      ? aggregateInventorySnapshots(
        snapshotResult.rows
          .filter(row => isReserveInventorySource(row.source_key))
          .map(row => parseJsonCountMap(row.item_counts)),
        items
      )
      : new Map<number, number>();

    await client.query(
      `UPDATE inventory_items
       SET quantity = 0, reserve_quantity = 0, updated_at = NOW(), updated_by = $2
       WHERE kind = $1 AND archived = FALSE`,
      [itemKind, uploader]
    );
    for (const item of items) {
      const page = locations.get(item.id);
      const location = page !== undefined ? `${locationPrefix}${page}` : null;
      await client.query(
        `UPDATE inventory_items
         SET quantity = $1, reserve_quantity = $2, updated_at = NOW(), updated_by = $3,
             bank_page = CASE WHEN $5::text IS NOT NULL AND NOT $6 THEN $5 ELSE bank_page END,
             reserve_bank_page = CASE WHEN $5::text IS NOT NULL AND $6 THEN $5 ELSE reserve_bank_page END
         WHERE id = $4`,
        [stockTotals.get(item.id) ?? 0, reserveTotals.get(item.id) ?? 0, uploader, item.id, location, reserveSource]
      );
    }

    await client.query(
      `INSERT INTO inventory_scans
         (scan_type, source_key, source_name, uploaded_by, client_timestamp, reported_items, matched_items, unknown_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [scanType, requestedSourceKey, sourceName, uploader, clientTimestamp, Object.keys(reported).length, matched, JSON.stringify(unmatched)]
    );
    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      scanType,
      sourceKey: requestedSourceKey,
      sourceName,
      matched,
      unmatched: Object.keys(unmatched),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Inventory upload error:', error);
    return NextResponse.json({ error: 'Failed to store inventory snapshot.' }, { status: 500 });
  } finally {
    client.release();
  }
}
