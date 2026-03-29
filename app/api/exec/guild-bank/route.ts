import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10)));
    const offset = (page - 1) * limit;

    // Paginated transaction history + total count
    const [txResult, countResult, inventoryResult, statsResult] = await Promise.all([
      pool.query(
        `SELECT id, player_name, action, item_count, item_name, bank_type, first_reported, report_count
         FROM guild_bank_transactions
         ORDER BY first_reported DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query(`SELECT COUNT(*) AS total FROM guild_bank_transactions`),
      // Compute inventory server-side: net quantity per item
      pool.query(
        `SELECT item_name, bank_type,
                SUM(CASE WHEN action = 'deposited' THEN item_count ELSE -item_count END) AS quantity
         FROM guild_bank_transactions
         GROUP BY item_name, bank_type
         HAVING SUM(CASE WHEN action = 'deposited' THEN item_count ELSE -item_count END) > 0
         ORDER BY item_name`
      ),
      // Compute stats server-side
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE action = 'deposited') AS deposits,
           COUNT(*) FILTER (WHERE action = 'withdrew') AS withdrawals
         FROM guild_bank_transactions`
      ),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const inventory = inventoryResult.rows.map(row => ({
      itemName: row.item_name,
      bankType: row.bank_type,
      quantity: parseInt(row.quantity, 10),
    }));
    const stats = {
      deposits: parseInt(statsResult.rows[0].deposits, 10),
      withdrawals: parseInt(statsResult.rows[0].withdrawals, 10),
      totalItems: inventory.reduce((s, i) => s + i.quantity, 0),
      uniqueItems: inventory.length,
    };

    return NextResponse.json({
      transactions: txResult.rows.map(row => ({
        id: row.id,
        playerName: row.player_name,
        action: row.action,
        itemCount: row.item_count,
        itemName: row.item_name,
        bankType: row.bank_type,
        firstReported: row.first_reported,
        reportCount: row.report_count,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      inventory,
      stats,
    });
  } catch (error) {
    console.error('Guild bank fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch guild bank data' }, { status: 500 });
  }
}
