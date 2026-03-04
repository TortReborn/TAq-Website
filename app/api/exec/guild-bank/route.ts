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
    const result = await pool.query(
      `SELECT id, player_name, action, item_count, item_name, bank_type, first_reported, report_count
       FROM guild_bank_transactions
       ORDER BY first_reported DESC`
    );

    return NextResponse.json({
      transactions: result.rows.map(row => ({
        id: row.id,
        playerName: row.player_name,
        action: row.action,
        itemCount: row.item_count,
        itemName: row.item_name,
        bankType: row.bank_type,
        firstReported: row.first_reported,
        reportCount: row.report_count,
      })),
    });
  } catch (error) {
    console.error('Guild bank fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch guild bank data' }, { status: 500 });
  }
}
