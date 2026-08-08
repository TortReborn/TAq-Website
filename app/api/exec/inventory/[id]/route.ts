import { NextRequest, NextResponse } from 'next/server';
import { requireInventoryEditorSession } from '@/lib/inventory-access';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_BUCKETS = new Set(['misc_bucket', 'account_bank', 'character_bank', 'materials_bucket']);
const VALID_DIFFICULTIES = new Set(['conns', 'hq']);
const VALID_CONSU_TYPES = new Set(['potion', 'scroll', 'food']);
const VALID_ROLES = new Set(['dps', 'healer', 'tank', 'any']);

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nullableEnum(value: unknown, allowed: Set<string>): string | null {
  return typeof value === 'string' && allowed.has(value) ? value : null;
}

function roleArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(role => typeof role === 'string' && VALID_ROLES.has(role)) : [];
}

function enumArray(value: unknown, allowed: Set<string>): string[] {
  return Array.isArray(value) ? value.filter(entry => typeof entry === 'string' && allowed.has(entry)) : [];
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
  const session = await requireInventoryEditorSession(request);
  if (!session) return NextResponse.json({ error: 'Inventory edit access required.' }, { status: 403 });

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
             quantity = CASE WHEN $1 THEN 0 ELSE quantity END,
             reserve_quantity = CASE WHEN $1 THEN 0 ELSE reserve_quantity END,
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
             quantity = $5, reserve_quantity = $6, desired_quantity = $7, used_by = $8, bank_page = $9,
             reserve_bank_page = $10, charges = $11, recipe_url = $12, storage_bucket = $13, notes = $14,
             texture_path = $15, difficulty = $16, is_dry = $17, roles = $18, consu_types = $19, level = $20,
             updated_at = NOW(), updated_by = $21
         WHERE id = $22`,
        [
          categoryId, name, nullableString(body.scanKey) ?? name,
          Array.isArray(body.aliases) ? body.aliases.filter(value => typeof value === 'string') : [],
          nonNegativeInteger(body.quantity ?? 0), nonNegativeInteger(body.reserveQuantity ?? 0),
          nonNegativeInteger(body.desiredQuantity, true),
          nullableString(body.usedBy), nullableString(body.bankPage), nullableString(body.reserveBankPage),
          nonNegativeInteger(body.charges, true), nullableString(body.recipeUrl),
          storageBucket, nullableString(body.notes), nullableString(body.texturePath),
          nullableEnum(body.difficulty, VALID_DIFFICULTIES), body.isDry === true, roleArray(body.roles),
          enumArray(body.consuTypes, VALID_CONSU_TYPES), nonNegativeInteger(body.level, true),
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireInventoryEditorSession(request);
  if (!session) return NextResponse.json({ error: 'Inventory edit access required.' }, { status: 403 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid inventory item.' }, { status: 400 });
  }

  try {
    const pool = getPool();
    const result = await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Inventory item delete error:', error);
    return NextResponse.json({ error: 'Failed to delete inventory item.' }, { status: 500 });
  }
}
