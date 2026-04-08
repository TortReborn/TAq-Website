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

    const [ignsResult, raidTypesResult] = await Promise.all([
      pool.query(`SELECT DISTINCT ign FROM graid_log_participants WHERE ign IS NOT NULL ORDER BY ign`),
      pool.query(`SELECT DISTINCT raid_type FROM graid_logs WHERE raid_type IS NOT NULL ORDER BY raid_type`),
    ]);

    const igns = ignsResult.rows.map((r: any) => r.ign);
    const raidTypes = raidTypesResult.rows.map((r: any) => r.raid_type);

    return NextResponse.json({ igns, raidTypes });
  } catch (error) {
    console.error('Graid log meta error:', error);
    return NextResponse.json({ error: 'Failed to fetch graid log metadata' }, { status: 500 });
  }
}
