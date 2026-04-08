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

    const [ignsResult, raidTypesResult, guildDataResult] = await Promise.all([
      pool.query(`SELECT DISTINCT ign FROM graid_log_participants WHERE ign IS NOT NULL ORDER BY ign`),
      pool.query(`SELECT DISTINCT raid_type FROM graid_logs WHERE raid_type IS NOT NULL ORDER BY raid_type`),
      pool.query(`SELECT data FROM cache_entries WHERE cache_key = 'guildData'`),
    ]);

    const igns = ignsResult.rows.map((r: any) => r.ign);
    const raidTypes = raidTypesResult.rows.map((r: any) => r.raid_type);

    let guildMembers: string[] = [];
    if (guildDataResult.rows.length > 0) {
      const members = guildDataResult.rows[0].data?.members;
      if (Array.isArray(members)) {
        guildMembers = members.map((m: any) => (m.name || m.username) as string).filter(Boolean).sort();
      }
    }

    return NextResponse.json({ igns, raidTypes, guildMembers });
  } catch (error) {
    console.error('Graid log meta error:', error);
    return NextResponse.json({ error: 'Failed to fetch graid log metadata' }, { status: 500 });
  }
}
