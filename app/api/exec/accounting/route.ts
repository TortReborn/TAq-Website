import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(10, Number.parseInt(searchParams.get('limit') ?? '30', 10) || 30));
  const offset = (page - 1) * limit;
  const search = (searchParams.get('search') ?? '').trim();
  const searchValue = `%${search}%`;

  try {
    const pool = getPool();
    const filter = search
      ? `WHERE COALESCE(author, '') ILIKE $1 OR reason ILIKE $1 OR action ILIKE $1`
      : '';
    const pageParams = search ? [searchValue, limit, offset] : [limit, offset];
    const limitParam = search ? '$2' : '$1';
    const offsetParam = search ? '$3' : '$2';
    const countParams = search ? [searchValue] : [];

    const [entries, count, current, stats] = await Promise.all([
      pool.query(
        `SELECT id, balance, previous_balance, action, reason, author, updated_by, created_at,
                CASE WHEN previous_balance IS NULL THEN NULL ELSE balance - previous_balance END AS delta
         FROM le_balance_log
         ${filter}
         ORDER BY created_at DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        pageParams
      ),
      pool.query(`SELECT COUNT(*) AS total FROM le_balance_log ${filter}`, countParams),
      pool.query(
        `SELECT balance, created_at, author, updated_by
         FROM le_balance_log
         ORDER BY created_at DESC
         LIMIT 1`
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(GREATEST(balance - previous_balance, 0)), 0) AS incoming,
           COALESCE(SUM(GREATEST(previous_balance - balance, 0)), 0) AS outgoing,
           COUNT(*) FILTER (WHERE previous_balance IS NOT NULL) AS changes
         FROM le_balance_log`
      ),
    ]);

    const total = Number(count.rows[0].total);
    return NextResponse.json({
      entries: entries.rows.map(row => ({
        id: row.id,
        balance: row.balance,
        previousBalance: row.previous_balance,
        delta: row.delta,
        action: row.action,
        reason: row.reason,
        author: row.author,
        storageAccount: row.updated_by,
        createdAt: row.created_at,
      })),
      current: current.rows[0] ? {
        balance: current.rows[0].balance,
        updatedAt: current.rows[0].created_at,
        author: current.rows[0].author,
        storageAccount: current.rows[0].updated_by,
      } : null,
      stats: {
        incoming: Number(stats.rows[0].incoming),
        outgoing: Number(stats.rows[0].outgoing),
        changes: Number(stats.rows[0].changes),
      },
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error('Accounting fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch accounting records.' }, { status: 500 });
  }
}
