import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
    const pool = getPool();
    const client = await pool.connect();

    try {
      // Fetch pending apps count, recent apps, and guild data in parallel
      const [pendingResult, recentResult, guildDataRaw] = await Promise.all([
        client.query(
          "SELECT COUNT(*) as count FROM applications WHERE status = 'pending'"
        ),
        client.query(
          `SELECT id, application_type, discord_username, status, submitted_at,
                  (SELECT json_build_object(
                    'accept', COUNT(*) FILTER (WHERE vote = 'accept'),
                    'deny', COUNT(*) FILTER (WHERE vote = 'deny'),
                    'abstain', COUNT(*) FILTER (WHERE vote = 'abstain')
                  ) FROM application_votes WHERE application_id = applications.id) as votes
           FROM applications
           ORDER BY submitted_at DESC
           LIMIT 5`
        ),
        simpleDatabaseCache.getGuildData(clientIP),
      ]);

      const pendingCount = parseInt(pendingResult.rows[0].count, 10);
      const recentApps = recentResult.rows.map(row => ({
        id: row.id,
        type: row.application_type,
        username: row.discord_username,
        status: row.status,
        submittedAt: row.submitted_at,
        votes: row.votes,
      }));

      // Extract guild stats
      let guildStats = {
        totalMembers: 0,
        onlineMembers: 0,
        name: 'The Aquarium',
      };

      if (guildDataRaw) {
        const gd = guildDataRaw as any;
        guildStats = {
          totalMembers: Array.isArray(gd.members) ? gd.members.length : (gd.members?.total || 0),
          onlineMembers: gd.online || 0,
          name: gd.name || 'The Aquarium',
        };
      }

      return NextResponse.json({
        pendingApplications: pendingCount,
        recentApplications: recentApps,
        guild: guildStats,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Dashboard data error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
