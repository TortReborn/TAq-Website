import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession, requireNarwhalSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_KINDS = new Set(['ingredient', 'consumable']);
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

function slugify(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function exchangeKey(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/[’']/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s$/, '');
}

async function loadInventory() {
  const pool = getPool();
  const [categoryResult, itemResult, scanResult, exchangeResult] = await Promise.all([
    pool.query(
      `SELECT id, kind, name, slug, sort_order, archived
       FROM inventory_categories
       ORDER BY kind, sort_order, name`
    ),
    pool.query(
      `SELECT id, kind, category_id, name, scan_key, aliases, quantity, desired_quantity,
              used_by, bank_page, charges, recipe_url, storage_bucket, notes, texture_path,
              sort_order, archived, archived_at, updated_by, updated_at
       FROM inventory_items
       ORDER BY kind, archived, sort_order, name`
    ),
    pool.query(
      `SELECT id, scan_type, source_key, source_name, uploaded_by, client_timestamp, received_at,
              reported_items, matched_items, unknown_items
       FROM inventory_scans
       ORDER BY received_at DESC
       LIMIT 12`
    ),
    pool.query(
      `SELECT cache_key, data
       FROM cache_entries
       WHERE cache_key IN ('shellExchangeIngs', 'shellExchangeMats')`
    ),
  ]);

  const exchangeData = new Map<string, Record<string, any>>();
  for (const row of exchangeResult.rows) {
    const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    exchangeData.set(row.cache_key, parsed ?? {});
  }
  const exchangeIngredients = exchangeData.get('shellExchangeIngs') ?? {};
  const exchangeByName = new Map<string, { key: string } & Record<string, any>>(
    Object.entries(exchangeIngredients).map(([key, value]) => [exchangeKey(key), { key, ...(value as Record<string, any>) }])
  );
  const exchangeMaterials = Object.entries(exchangeData.get('shellExchangeMats') ?? {}).map(([key, value]) => {
    const material = value as Record<string, any>;
    return {
      key,
      name: key.trim().split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
      tiers: material,
      imageUrl: `/api/exec/shell-exchange/image?category=mats&key=${encodeURIComponent(key)}&v=${material.iv ?? 0}`,
    };
  });

  return {
    categories: categoryResult.rows.map(row => ({
      id: Number(row.id),
      kind: row.kind,
      name: row.name,
      slug: row.slug,
      sortOrder: row.sort_order,
      archived: row.archived,
    })),
    items: itemResult.rows.map(row => {
      const exchange = row.kind === 'ingredient'
        ? exchangeByName.get(exchangeKey(row.name)) ?? exchangeByName.get(exchangeKey(row.scan_key))
        : undefined;
      return {
        id: Number(row.id),
        kind: row.kind,
        categoryId: Number(row.category_id),
        name: row.name,
        scanKey: row.scan_key,
        aliases: row.aliases ?? [],
        quantity: row.quantity,
        desiredQuantity: row.desired_quantity,
        enough: row.desired_quantity === null ? null : row.quantity >= row.desired_quantity,
        usedBy: row.used_by,
        bankPage: row.bank_page,
        charges: row.charges,
        recipeUrl: row.recipe_url,
        storageBucket: row.storage_bucket,
        notes: row.notes,
        texturePath: row.texture_path,
        exchange: exchange ? {
          key: exchange.key,
          shells: Number(exchange.shells ?? 1),
          per: Number(exchange.per ?? 1),
          highlight: exchange.highlight === true,
          toggled: exchange.toggled !== false,
          imageUrl: `/api/exec/shell-exchange/image?category=ings&key=${encodeURIComponent(exchange.key)}&v=${exchange.iv ?? 0}`,
        } : null,
        sortOrder: row.sort_order,
        archived: row.archived,
        archivedAt: row.archived_at,
        updatedBy: row.updated_by,
        updatedAt: row.updated_at,
      };
    }),
    exchangeMaterials,
    scans: scanResult.rows.map(row => ({
      id: Number(row.id),
      scanType: row.scan_type,
      sourceKey: row.source_key,
      sourceName: row.source_name,
      uploadedBy: row.uploaded_by,
      clientTimestamp: row.client_timestamp,
      receivedAt: row.received_at,
      reportedItems: row.reported_items,
      matchedItems: row.matched_items,
      unknownItems: row.unknown_items ?? {},
    })),
  };
}

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return NextResponse.json(await loadInventory());
  } catch (error) {
    console.error('Inventory fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch inventory.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireNarwhalSession(request);
  if (!session) return NextResponse.json({ error: 'Narwhal access required.' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const action = body.action;
  const pool = getPool();
  try {
    if (action === 'createCategory') {
      const kind = typeof body.kind === 'string' ? body.kind : '';
      const name = nullableString(body.name);
      if (!VALID_KINDS.has(kind) || !name) {
        return NextResponse.json({ error: 'Kind and category name are required.' }, { status: 400 });
      }
      const slug = slugify(nullableString(body.slug) ?? name);
      const sortResult = await pool.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order
         FROM inventory_categories WHERE kind = $1`,
        [kind]
      );
      await pool.query(
        `INSERT INTO inventory_categories (kind, name, slug, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [kind, name, slug, sortResult.rows[0].next_order]
      );
    } else if (action === 'updateCategory') {
      const id = nonNegativeInteger(body.id);
      const name = nullableString(body.name);
      if (!id || !name) {
        return NextResponse.json({ error: 'Category and name are required.' }, { status: 400 });
      }
      await pool.query(
        `UPDATE inventory_categories
         SET name = $1, archived = $2, updated_at = NOW()
         WHERE id = $3`,
        [name, body.archived === true, id]
      );
    } else if (action === 'deleteCategory') {
      const id = nonNegativeInteger(body.id);
      const replacementId = nonNegativeInteger(body.replacementId, true);
      if (!id || replacementId === id) {
        return NextResponse.json({ error: 'Choose a valid category to delete.' }, { status: 400 });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const categoryResult = await client.query(
          `SELECT id, kind, name
           FROM inventory_categories
           WHERE id = $1
           FOR UPDATE`,
          [id]
        );
        if (categoryResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
        }

        const itemCountResult = await client.query(
          `SELECT COUNT(*)::int AS count
           FROM inventory_items
           WHERE category_id = $1`,
          [id]
        );
        const itemCount = Number(itemCountResult.rows[0].count);
        if (itemCount > 0) {
          if (!replacementId) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Move this category’s items to another category before deleting it.' }, { status: 400 });
          }
          const replacementResult = await client.query(
            `SELECT id
             FROM inventory_categories
             WHERE id = $1 AND kind = $2 AND archived = FALSE`,
            [replacementId, categoryResult.rows[0].kind]
          );
          if (replacementResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'The replacement must be an active category of the same type.' }, { status: 400 });
          }
          await client.query(
            `UPDATE inventory_items
             SET category_id = $1, updated_at = NOW(), updated_by = $2
             WHERE category_id = $3`,
            [replacementId, session.ign, id]
          );
        }
        await client.query(`DELETE FROM inventory_categories WHERE id = $1`, [id]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } else if (action === 'createItem') {
      const kind = typeof body.kind === 'string' ? body.kind : '';
      const name = nullableString(body.name);
      const categoryId = nonNegativeInteger(body.categoryId);
      const storageBucket = typeof body.storageBucket === 'string' ? body.storageBucket : '';
      if (!VALID_KINDS.has(kind) || !name || !categoryId || !VALID_BUCKETS.has(storageBucket)) {
        return NextResponse.json({ error: 'Kind, category, name, and storage bucket are required.' }, { status: 400 });
      }
      const sortResult = await pool.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order
         FROM inventory_items WHERE category_id = $1`,
        [categoryId]
      );
      await pool.query(
        `INSERT INTO inventory_items (
           kind, category_id, name, scan_key, aliases, quantity, desired_quantity,
           used_by, bank_page, charges, recipe_url, storage_bucket, notes, texture_path,
           sort_order, updated_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
         )`,
        [
          kind, categoryId, name, nullableString(body.scanKey) ?? name,
          Array.isArray(body.aliases) ? body.aliases.filter(value => typeof value === 'string') : [],
          nonNegativeInteger(body.quantity ?? 0), nonNegativeInteger(body.desiredQuantity, true),
          nullableString(body.usedBy), nullableString(body.bankPage),
          nonNegativeInteger(body.charges, true), nullableString(body.recipeUrl),
          storageBucket, nullableString(body.notes), nullableString(body.texturePath),
          sortResult.rows[0].next_order, session.ign,
        ]
      );
    } else if (action === 'reorder') {
      const entity = body.entity;
      const ids = Array.isArray(body.ids)
        ? body.ids.map(Number).filter(id => Number.isInteger(id) && id > 0)
        : [];
      if (!['item', 'category'].includes(String(entity)) || ids.length === 0) {
        return NextResponse.json({ error: 'A reorder entity and ordered IDs are required.' }, { status: 400 });
      }
      const table = entity === 'item' ? 'inventory_items' : 'inventory_categories';
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const [index, id] of ids.entries()) {
          await client.query(
            `UPDATE ${table} SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
            [(index + 1) * 10, id]
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } else {
      return NextResponse.json({ error: 'Unknown inventory action.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...(await loadInventory()) });
  } catch (error) {
    console.error('Inventory create error:', error);
    const code = (error as { code?: string }).code;
    return NextResponse.json(
      { error: code === '23505' ? 'That category already exists.' : 'Failed to update inventory.' },
      { status: code === '23505' ? 409 : 500 }
    );
  }
}
