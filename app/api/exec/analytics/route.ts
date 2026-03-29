import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { isAnalyticsUser } from '@/lib/analytics-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAnalyticsUser(session.discord_id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const metric = searchParams.get('metric') || 'overview';
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const pool = getPool();

  // Build date filter clause
  const dateParams: string[] = [];
  let dateClause = '';
  if (from) {
    dateParams.push(from);
    dateClause += ` AND created_at >= $${dateParams.length}::timestamptz`;
  }
  if (to) {
    dateParams.push(to);
    dateClause += ` AND created_at <= $${dateParams.length}::timestamptz`;
  }

  try {
    if (metric === 'overview') {
      const [usersRes, viewsRes, loginsRes, durationRes, topPagesRes, topUsersRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(DISTINCT discord_id) as count FROM analytics_page_views WHERE discord_id IS NOT NULL${dateClause}`,
          dateParams
        ),
        pool.query(
          `SELECT COUNT(*) as count FROM analytics_page_views WHERE 1=1${dateClause}`,
          dateParams
        ),
        pool.query(
          `SELECT COUNT(*) as count FROM analytics_logins WHERE 1=1${dateClause}`,
          dateParams
        ),
        pool.query(
          `SELECT COALESCE(AVG(duration_ms), 0) as avg_ms FROM analytics_page_views WHERE duration_ms IS NOT NULL${dateClause}`,
          dateParams
        ),
        pool.query(
          `SELECT page_path, COUNT(*) as views, COUNT(DISTINCT discord_id) as unique_users, COALESCE(AVG(duration_ms), 0) as avg_duration
           FROM analytics_page_views WHERE 1=1${dateClause}
           GROUP BY page_path ORDER BY views DESC LIMIT 10`,
          dateParams
        ),
        pool.query(
          `SELECT discord_id, ign, COUNT(*) as views, MAX(created_at) as last_seen
           FROM analytics_page_views WHERE discord_id IS NOT NULL${dateClause}
           GROUP BY discord_id, ign ORDER BY views DESC LIMIT 10`,
          dateParams
        ),
      ]);

      return NextResponse.json({
        uniqueUsers: parseInt(usersRes.rows[0].count),
        totalPageViews: parseInt(viewsRes.rows[0].count),
        totalLogins: parseInt(loginsRes.rows[0].count),
        avgSessionDuration: Math.round(parseFloat(durationRes.rows[0].avg_ms)),
        topPages: topPagesRes.rows.map(r => ({
          page: r.page_path,
          views: parseInt(r.views),
          uniqueUsers: parseInt(r.unique_users),
          avgDuration: Math.round(parseFloat(r.avg_duration)),
        })),
        topUsers: topUsersRes.rows.map(r => ({
          discordId: r.discord_id,
          ign: r.ign,
          views: parseInt(r.views),
          lastSeen: r.last_seen,
        })),
      });
    }

    if (metric === 'logins') {
      const [dailyRes, recentRes] = await Promise.all([
        pool.query(
          `SELECT DATE(created_at) as day, COUNT(*) as count
           FROM analytics_logins WHERE 1=1${dateClause}
           GROUP BY DATE(created_at) ORDER BY day ASC`,
          dateParams
        ),
        pool.query(
          `SELECT discord_id, ign, rank, role, created_at
           FROM analytics_logins WHERE 1=1${dateClause}
           ORDER BY created_at DESC LIMIT 50`,
          dateParams
        ),
      ]);

      return NextResponse.json({
        daily: dailyRes.rows.map(r => ({ day: r.day, count: parseInt(r.count) })),
        recent: recentRes.rows,
      });
    }

    if (metric === 'pageviews') {
      const page = searchParams.get('page');
      const pageFilter = page ? ` AND page_path = $${dateParams.length + 1}` : '';
      const pageParams = page ? [...dateParams, page] : dateParams;

      const [summaryRes, recentRes] = await Promise.all([
        pool.query(
          `SELECT page_path, COUNT(*) as views, COUNT(DISTINCT discord_id) as unique_users,
                  COUNT(DISTINCT session_id) as sessions, COALESCE(AVG(duration_ms), 0) as avg_duration
           FROM analytics_page_views WHERE 1=1${dateClause}${pageFilter}
           GROUP BY page_path ORDER BY views DESC LIMIT 50`,
          pageParams
        ),
        pool.query(
          `SELECT discord_id, ign, page_path, duration_ms, session_id, created_at
           FROM analytics_page_views WHERE 1=1${dateClause}${pageFilter}
           ORDER BY created_at DESC LIMIT 100`,
          pageParams
        ),
      ]);

      return NextResponse.json({
        summary: summaryRes.rows.map(r => ({
          page: r.page_path,
          views: parseInt(r.views),
          uniqueUsers: parseInt(r.unique_users),
          sessions: parseInt(r.sessions),
          avgDuration: Math.round(parseFloat(r.avg_duration)),
        })),
        recent: recentRes.rows,
      });
    }

    if (metric === 'actions') {
      const page = searchParams.get('page');
      const pageFilter = page ? ` AND page_path = $${dateParams.length + 1}` : '';
      const pageParams = page ? [...dateParams, page] : dateParams;

      const result = await pool.query(
        `SELECT action_label, action_type, page_path, COUNT(*) as count,
                MAX(created_at) as last_used, COUNT(DISTINCT discord_id) as unique_users
         FROM analytics_actions WHERE 1=1${dateClause}${pageFilter}
         GROUP BY action_label, action_type, page_path ORDER BY count DESC LIMIT 100`,
        pageParams
      );

      return NextResponse.json({
        actions: result.rows.map(r => ({
          label: r.action_label,
          type: r.action_type,
          page: r.page_path,
          count: parseInt(r.count),
          lastUsed: r.last_used,
          uniqueUsers: parseInt(r.unique_users),
        })),
      });
    }

    if (metric === 'users') {
      // Get user view counts
      const viewsResult = await pool.query(
        `SELECT
           pv.discord_id,
           pv.ign,
           COUNT(*) as total_views,
           MAX(pv.created_at) as last_seen
         FROM analytics_page_views pv
         WHERE pv.discord_id IS NOT NULL${dateClause}
         GROUP BY pv.discord_id, pv.ign
         ORDER BY total_views DESC LIMIT 50`,
        dateParams
      );

      // Enrich with action counts and top page for each user
      const users = await Promise.all(
        viewsResult.rows.map(async (r) => {
          const [actionsRes, topPageRes] = await Promise.all([
            pool.query(
              `SELECT COUNT(*) as count FROM analytics_actions WHERE discord_id = $1${dateClause.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) + 1}`)}`,
              [r.discord_id, ...dateParams]
            ),
            pool.query(
              `SELECT page_path FROM analytics_page_views WHERE discord_id = $1${dateClause.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) + 1}`)} GROUP BY page_path ORDER BY COUNT(*) DESC LIMIT 1`,
              [r.discord_id, ...dateParams]
            ),
          ]);
          return {
            discordId: r.discord_id,
            ign: r.ign,
            totalViews: parseInt(r.total_views),
            totalActions: parseInt(actionsRes.rows[0]?.count ?? 0),
            lastSeen: r.last_seen,
            topPage: topPageRes.rows[0]?.page_path ?? null,
          };
        })
      );

      return NextResponse.json({ users });
    }

    return NextResponse.json({ error: 'Unknown metric' }, { status: 400 });
  } catch (error) {
    console.error('[analytics] Query error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
