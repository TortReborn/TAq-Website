import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ALLOWED_UPLOADER = 'woealer';
const VALID_SCAN_TYPES = new Set(['misc_bucket', 'account_bank', 'character_bank']);

function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

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

export async function POST(request: NextRequest) {
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

  const primary = scanType === 'misc_bucket'
    ? asCountMap(body.ingredients)
    : asCountMap(body.consumables);
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

    const byName = new Map<string, number>();
    for (const item of itemResult.rows) {
      for (const candidate of [item.name, item.scan_key, ...(item.aliases ?? [])]) {
        byName.set(normalizeName(candidate), Number(item.id));
      }
    }

    // A scan is an absolute snapshot of one storage bucket.
    await client.query(
      `UPDATE inventory_items
       SET quantity = 0, updated_at = NOW(), updated_by = $2
       WHERE storage_bucket = $1 AND archived = FALSE`,
      [scanType, uploader]
    );

    const unmatched: Record<string, number> = {};
    let matched = 0;
    for (const [name, quantity] of Object.entries(reported)) {
      const id = byName.get(normalizeName(name));
      if (!id) {
        unmatched[name] = quantity;
        continue;
      }
      await client.query(
        `UPDATE inventory_items
         SET quantity = $1, updated_at = NOW(), updated_by = $2
         WHERE id = $3`,
        [quantity, uploader, id]
      );
      matched += 1;
    }

    await client.query(
      `INSERT INTO inventory_scans
         (scan_type, uploaded_by, client_timestamp, reported_items, matched_items, unknown_items)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [scanType, uploader, clientTimestamp, Object.keys(reported).length, matched, JSON.stringify(unmatched)]
    );
    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      scanType,
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
