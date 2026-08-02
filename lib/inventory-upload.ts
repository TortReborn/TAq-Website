import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import {
  aggregateInventorySnapshots,
  InventoryMatchItem,
  matchInventorySnapshot,
} from '@/lib/inventory-snapshots';

const ALLOWED_UPLOADER = 'woealer';
const VALID_SCAN_TYPES = new Set(['misc_bucket', 'account_bank', 'character_bank']);
const SOURCE_KEY_PATTERN = /^[a-z0-9:_-]{1,120}$/;

function readBearer(request: NextRequest): string {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

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

export async function handleInventoryUpload(request: NextRequest) {
  const uploader = readBearer(request);
  if (uploader.toLocaleLowerCase('en-US') !== ALLOWED_UPLOADER) {
    return NextResponse.json({ error: 'Only Woealer can upload inventory snapshots.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const scanType = typeof body.scanType === 'string' ? body.scanType : '';
  if (!VALID_SCAN_TYPES.has(scanType)) {
    return NextResponse.json({ error: 'Invalid scan type.' }, { status: 400 });
  }

  const requestedSourceKey = typeof body.sourceKey === 'string' ? body.sourceKey.trim().toLocaleLowerCase('en-US') : scanType;
  if (!SOURCE_KEY_PATTERN.test(requestedSourceKey)) {
    return NextResponse.json({ error: 'Invalid inventory source key.' }, { status: 400 });
  }
  const sourceName = (typeof body.sourceName === 'string' && body.sourceName.trim() ? body.sourceName.trim() : scanType).slice(0, 120);
  const primary = scanType === 'misc_bucket' ? asCountMap(body.ingredients) : asCountMap(body.consumables);
  const unknown = asCountMap(body.unknownItems);
  const reported = { ...unknown, ...primary };
  const clientTimestamp = typeof body.timestamp === 'number' && Number.isFinite(body.timestamp)
    ? new Date(body.timestamp)
    : null;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemResult = await client.query(
      `SELECT id, name, scan_key, aliases
       FROM inventory_items
       WHERE storage_bucket = $1 AND archived = FALSE
       FOR UPDATE`,
      [scanType]
    );
    const items: InventoryMatchItem[] = itemResult.rows.map(row => ({
      id: Number(row.id),
      name: row.name,
      scanKey: row.scan_key,
      aliases: row.aliases ?? [],
    }));
    const { matchedCounts, unmatched, matched } = matchInventorySnapshot(reported, items);

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
      `SELECT item_counts
       FROM inventory_scan_sources
       WHERE storage_bucket = $1`,
      [scanType]
    );
    const totals = aggregateInventorySnapshots(
      snapshotResult.rows.map(row => parseJsonCountMap(row.item_counts)),
      items
    );

    await client.query(
      `UPDATE inventory_items
       SET quantity = 0, updated_at = NOW(), updated_by = $2
       WHERE storage_bucket = $1 AND archived = FALSE`,
      [scanType, uploader]
    );
    for (const [id, quantity] of totals) {
      await client.query(
        `UPDATE inventory_items
         SET quantity = $1, updated_at = NOW(), updated_by = $2
         WHERE id = $3`,
        [quantity, uploader, id]
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
      unknownItems: unmatched,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Inventory upload error:', error);
    return NextResponse.json({ error: 'Failed to store inventory snapshot.' }, { status: 500 });
  } finally {
    client.release();
  }
}
