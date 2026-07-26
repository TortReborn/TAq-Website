import { NextRequest, NextResponse } from 'next/server';
import { requireNarwhalSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_BUCKETS = new Set(['misc_bucket', 'account_bank', 'character_bank']);

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nonNegativeInteger(value: unknown, nullable = false): number | null {
  if ((value === null || value === '') && nullable) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error('Expected a non-negative integer.');
  return number;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireNarwhalSession(request);
  if (!session) return NextResponse.json({ error: 'Narwhal access required.' }, { status: 403 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid inventory item.' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  try {
    const pool = getPool();
    if (body.action === 'archive' || body.action === 'restore') {
      const archived = body.action === 'archive';
      await pool.query(
        `UPDATE inventory_items
         SET archived = $1,
             archived_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
             updated_at = NOW(),
             updated_by = $2
         WHERE id = $3`,
        [archived, session.ign, id]
      );
    } else {
      const storageBucket = typeof body.storageBucket === 'string' ? body.storageBucket : '';
      if (!VALID_BUCKETS.has(storageBucket)) {
        return NextResponse.json({ error: 'Invalid storage bucket.' }, { status: 400 });
      }
      const categoryId = nonNegativeInteger(body.categoryId);
      const name = nullableString(body.name);
      if (!categoryId || !name) {
        return NextResponse.json({ error: 'Category and name are required.' }, { status: 400 });
      }
      await pool.query(
        `UPDATE inventory_items
         SET category_id = $1, name = $2, scan_key = $3, aliases = $4,
             quantity = $5, desired_quantity = $6, used_by = $7, bank_page = $8,
             charges = $9, recipe_url = $10, storage_bucket = $11, notes = $12,
             texture_path = $13, updated_at = NOW(), updated_by = $14
         WHERE id = $15`,
        [
          categoryId, name, nullableString(body.scanKey) ?? name,
          Array.isArray(body.aliases) ? body.aliases.filter(value => typeof value === 'string') : [],
          nonNegativeInteger(body.quantity ?? 0), nonNegativeInteger(body.desiredQuantity, true),
          nullableString(body.usedBy), nullableString(body.bankPage),
          nonNegativeInteger(body.charges, true), nullableString(body.recipeUrl),
          storageBucket, nullableString(body.notes), nullableString(body.texturePath),
          session.ign, id,
        ]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Inventory item update error:', error);
    return NextResponse.json({ error: 'Failed to update inventory item.' }, { status: 500 });
  }
}
