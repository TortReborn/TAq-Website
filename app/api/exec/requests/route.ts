import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { EXEC_RANKS } from '@/lib/exec-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);

    // Auto-archive: deployed/declined tickets untouched for >= 7 days
    // are rolled into 'archived' so the deployed/declined columns stay
    // focused on recent activity. Runs on every list fetch — cheap
    // (single UPDATE, indexed on status).
    await pool.query(
      `UPDATE tracker_tickets
         SET status = 'archived'
       WHERE status IN ('deployed', 'declined')
         AND updated_at < NOW() - INTERVAL '7 days'`
    );

    // Build dynamic WHERE clause
    const conditions: string[] = [];
    const params: (string | string[])[] = [];
    let paramIdx = 1;

    const status = searchParams.get('status');
    if (status) {
      const statuses = status.split(',');
      conditions.push(`t.status = ANY($${paramIdx}::text[])`);
      params.push(statuses);
      paramIdx++;
    }

    const type = searchParams.get('type');
    if (type) {
      conditions.push(`t.type = $${paramIdx}`);
      params.push(type);
      paramIdx++;
    }

    const system = searchParams.get('system');
    if (system) {
      const systems = system.split(',');
      conditions.push(`t.system && $${paramIdx}::text[]`);
      params.push(systems);
      paramIdx++;
    }

    const priority = searchParams.get('priority');
    if (priority) {
      conditions.push(`t.priority = $${paramIdx}`);
      params.push(priority);
      paramIdx++;
    }

    const q = searchParams.get('q');
    if (q && q.trim()) {
      const needle = `%${q.trim()}%`;
      conditions.push(`(t.title ILIKE $${paramIdx} OR t.description ILIKE $${paramIdx})`);
      params.push(needle);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sort
    const allowedSorts: Record<string, string> = {
      created_at: 't.created_at',
      updated_at: 't.updated_at',
      priority: `CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
      status: `CASE t.status WHEN 'untriaged' THEN 0 WHEN 'todo' THEN 1 WHEN 'blocked' THEN 2 WHEN 'in_progress' THEN 3 WHEN 'deployed' THEN 4 WHEN 'declined' THEN 5 WHEN 'archived' THEN 6 END`,
    };
    const sortParam = searchParams.get('sort') || 'created_at';
    const sortColumn = allowedSorts[sortParam] || 't.created_at';
    const order = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';

    const result = await pool.query(
      `SELECT t.*,
              dl1.ign AS submitted_by_ign,
              dl2.ign AS assigned_to_ign,
              (SELECT COUNT(*) FROM tracker_comments c WHERE c.ticket_id = t.id) AS comment_count
       FROM tracker_tickets t
       LEFT JOIN discord_links dl1 ON dl1.discord_id = t.submitted_by
       LEFT JOIN discord_links dl2 ON dl2.discord_id = t.assigned_to
       ${whereClause}
       ORDER BY t.position ASC, ${sortColumn} ${order}`,
      params
    );

    // Fetch exec members for assignee dropdown
    const rankPlaceholders = EXEC_RANKS.map((_, i) => `$${i + 1}`).join(', ');
    const execResult = await pool.query(
      `SELECT discord_id, ign FROM discord_links WHERE rank IN (${rankPlaceholders}) ORDER BY ign ASC`,
      EXEC_RANKS
    );

    return NextResponse.json({
      tickets: result.rows.map(row => ({
        id: row.id,
        type: row.type,
        system: row.system,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        submittedBy: row.submitted_by?.toString(),
        submittedByIgn: row.submitted_by_ign,
        assignedTo: row.assigned_to?.toString() || null,
        assignedToIgn: row.assigned_to_ign || null,
        commentCount: parseInt(row.comment_count, 10),
        position: row.position,
        dueDate: row.due_date || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      execMembers: execResult.rows.map(row => ({
        discordId: row.discord_id?.toString(),
        ign: row.ign,
      })),
    });
  } catch (error) {
    console.error('Tracker list error:', error);
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { type, system, title, description, priority } = await request.json();

    if (!type || !['bug', 'feature'].includes(type)) {
      return NextResponse.json({ error: 'Type must be "bug" or "feature"' }, { status: 400 });
    }
    const validSystems = ['discord_bot', 'minecraft_mod', 'website'];
    const systemArr: string[] = Array.isArray(system) ? system : (system ? [system] : []);
    if (systemArr.length === 0 || !systemArr.every((s: string) => validSystems.includes(s))) {
      return NextResponse.json({ error: 'At least one valid system is required' }, { status: 400 });
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    const validPriority = priority && ['low', 'medium', 'high', 'critical'].includes(priority) ? priority : 'medium';

    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO tracker_tickets (type, system, title, description, priority, submitted_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [type, systemArr, title.trim(), description.trim(), validPriority, session.discord_id]
    );

    return NextResponse.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Tracker create error:', error);
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}
