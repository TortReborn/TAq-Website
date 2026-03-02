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

    const [guildResult, linksResult, balancesResult, ingsResult, matsResult, auditResult] = await Promise.all([
      pool.query(`SELECT data->'members' as members FROM cache_entries WHERE cache_key = 'guildData'`),
      pool.query(`SELECT discord_id, uuid, ign, rank FROM discord_links`),
      pool.query(`
        SELECT s."user", s.shells, s.balance, s.ign,
               dl.ign as dl_ign, dl.uuid, dl.rank
        FROM shells s
        LEFT JOIN discord_links dl ON dl.discord_id = s."user"
        ORDER BY s.balance DESC
      `),
      pool.query(`SELECT data FROM cache_entries WHERE cache_key = 'shellExchangeIngs'`),
      pool.query(`SELECT data FROM cache_entries WHERE cache_key = 'shellExchangeMats'`),
      pool.query(`
        SELECT a.id, a.actor_name, a.actor_id, a.action, a.created_at,
               dl.ign as actor_ign
        FROM audit_log a
        LEFT JOIN discord_links dl ON dl.discord_id = a.actor_id
        WHERE a.log_type = 'shell'
        ORDER BY a.created_at DESC
        LIMIT 50
      `),
    ]);

    const discordLinks: Record<string, { discordId: string; ign: string; rank: string }> = {};
    for (const row of linksResult.rows) {
      if (row.uuid) {
        discordLinks[row.uuid] = {
          discordId: row.discord_id.toString(),
          ign: row.ign,
          rank: row.rank,
        };
      }
    }

    return NextResponse.json({
      members: guildResult.rows[0]?.members ?? [],
      discordLinks,
      balances: balancesResult.rows.map(row => ({
        discordId: row.user.toString(),
        ign: row.dl_ign || row.ign || 'Unknown',
        uuid: row.uuid || null,
        rank: row.rank || null,
        shells: row.shells,
        balance: row.balance,
      })),
      ingredients: ingsResult.rows[0]?.data ?? {},
      materials: matsResult.rows[0]?.data ?? {},
      auditLog: auditResult.rows.map(row => ({
        id: row.id,
        actorName: row.actor_ign || row.actor_name,
        action: row.action,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Shells fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch shell data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { discordId, amount, action } = await request.json();

    if (!discordId || amount == null || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!['add', 'remove'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    if (typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
      return NextResponse.json({ error: 'Amount must be a positive integer' }, { status: 400 });
    }

    const pool = getPool();

    if (action === 'remove') {
      const current = await pool.query(
        `SELECT balance FROM shells WHERE "user" = $1`,
        [discordId]
      );
      const currentBalance = current.rows[0]?.balance ?? 0;
      if (currentBalance < amount) {
        return NextResponse.json({ error: `Insufficient balance (current: ${currentBalance})` }, { status: 400 });
      }
    }

    if (action === 'add') {
      await pool.query(`
        INSERT INTO shells ("user", shells, balance)
        VALUES ($1, $2, $2)
        ON CONFLICT ("user") DO UPDATE SET
          shells = shells.shells + $2,
          balance = shells.balance + $2
      `, [discordId, amount]);
    } else {
      await pool.query(`
        UPDATE shells SET balance = balance - $2 WHERE "user" = $1
      `, [discordId, amount]);
    }

    // Resolve target IGN for audit log
    const targetResult = await pool.query(
      `SELECT ign FROM discord_links WHERE discord_id = $1`, [discordId]
    );
    const targetIgn = targetResult.rows[0]?.ign || discordId;

    await pool.query(`
      INSERT INTO audit_log (log_type, actor_name, actor_id, action)
      VALUES ('shell', $1, $2, $3)
    `, [
      session.ign,
      session.discord_id,
      `${action === 'add' ? 'Added' : 'Removed'} ${amount} shells ${action === 'add' ? 'to' : 'from'} ${targetIgn}`,
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shell manage error:', error);
    return NextResponse.json({ error: 'Failed to manage shells' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { type, name, data: updates } = await request.json();

    if (!type || !name || !updates) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!['ingredient', 'material'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const pool = getPool();
    const cacheKey = type === 'ingredient' ? 'shellExchangeIngs' : 'shellExchangeMats';

    const result = await pool.query(
      `SELECT data FROM cache_entries WHERE cache_key = $1`, [cacheKey]
    );
    const currentData = result.rows[0]?.data ?? {};

    if (!currentData[name]) {
      return NextResponse.json({ error: `${name} not found` }, { status: 404 });
    }

    if (type === 'ingredient') {
      currentData[name] = { ...currentData[name], ...updates };
    } else {
      const existing = currentData[name];
      const { t1, t2, t3, toggled } = updates;
      if (t1) existing.t1 = { ...(existing.t1 || {}), ...t1 };
      if (t2) existing.t2 = { ...(existing.t2 || {}), ...t2 };
      if (t3) existing.t3 = { ...(existing.t3 || {}), ...t3 };
      if (toggled !== undefined) existing.toggled = toggled;
      currentData[name] = existing;
    }

    await pool.query(
      `UPDATE cache_entries SET data = $1 WHERE cache_key = $2`,
      [JSON.stringify(currentData), cacheKey]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shell exchange edit error:', error);
    return NextResponse.json({ error: 'Failed to update exchange rates' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { type, name, data: newItemData } = await request.json();

    if (!type || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!['ingredient', 'material'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const pool = getPool();
    const cacheKey = type === 'ingredient' ? 'shellExchangeIngs' : 'shellExchangeMats';

    const result = await pool.query(
      `SELECT data FROM cache_entries WHERE cache_key = $1`, [cacheKey]
    );
    const currentData = result.rows[0]?.data ?? {};

    if (currentData[name]) {
      return NextResponse.json({ error: `${name} already exists` }, { status: 409 });
    }

    currentData[name] = newItemData;

    await pool.query(
      `UPDATE cache_entries SET data = $1 WHERE cache_key = $2`,
      [JSON.stringify(currentData), cacheKey]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shell exchange add error:', error);
    return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { type, name } = await request.json();

    if (!type || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!['ingredient', 'material'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const pool = getPool();
    const cacheKey = type === 'ingredient' ? 'shellExchangeIngs' : 'shellExchangeMats';

    const result = await pool.query(
      `SELECT data FROM cache_entries WHERE cache_key = $1`, [cacheKey]
    );
    const currentData = result.rows[0]?.data ?? {};

    if (!currentData[name]) {
      return NextResponse.json({ error: `${name} not found` }, { status: 404 });
    }

    delete currentData[name];

    await pool.query(
      `UPDATE cache_entries SET data = $1 WHERE cache_key = $2`,
      [JSON.stringify(currentData), cacheKey]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shell exchange delete error:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
