import { NextRequest, NextResponse } from 'next/server';
import { requireGuildSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await requireGuildSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { backgroundId } = await request.json();

    if (backgroundId == null || typeof backgroundId !== 'number') {
      return NextResponse.json({ error: 'Missing backgroundId' }, { status: 400 });
    }

    const pool = getPool();

    // Fetch background info
    const bgResult = await pool.query(
      `SELECT id, name, price, public FROM profile_backgrounds WHERE id = $1`,
      [backgroundId]
    );
    if (bgResult.rows.length === 0) {
      return NextResponse.json({ error: 'Background not found' }, { status: 400 });
    }
    const bg = bgResult.rows[0];
    if (!bg.public) {
      return NextResponse.json({ error: 'Background not available' }, { status: 400 });
    }
    if (bg.price <= 0) {
      return NextResponse.json({ error: 'This background cannot be purchased' }, { status: 400 });
    }

    // Check ownership
    const custResult = await pool.query(
      `SELECT owned FROM profile_customization WHERE "user" = $1`,
      [session.discord_id]
    );
    const ownedArr: number[] = custResult.rows[0]?.owned ?? [];
    if (ownedArr.includes(backgroundId)) {
      return NextResponse.json({ error: 'Already owned' }, { status: 400 });
    }

    // Check balance
    const balResult = await pool.query(
      `SELECT balance FROM shells WHERE "user" = $1`,
      [session.discord_id]
    );
    const currentBalance = balResult.rows[0]?.balance ?? 0;
    if (currentBalance < bg.price) {
      return NextResponse.json(
        { error: `Insufficient balance (current: ${currentBalance}, cost: ${bg.price})` },
        { status: 400 }
      );
    }

    // Deduct shells
    await pool.query(
      `UPDATE shells SET balance = balance - $1 WHERE "user" = $2`,
      [bg.price, session.discord_id]
    );

    // Add to owned (UPSERT)
    const newOwned = [...ownedArr, backgroundId];
    if (custResult.rows.length > 0) {
      await pool.query(
        `UPDATE profile_customization SET owned = $1::jsonb WHERE "user" = $2`,
        [JSON.stringify(newOwned), session.discord_id]
      );
    } else {
      await pool.query(
        `INSERT INTO profile_customization ("user", background, owned) VALUES ($1, 0, $2::jsonb)`,
        [session.discord_id, JSON.stringify(newOwned)]
      );
    }

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (log_type, actor_name, actor_id, action) VALUES ('shell', $1, $2, $3)`,
      [
        session.ign,
        session.discord_id,
        `Purchased background '${bg.name}' for ${bg.price} shells`,
      ]
    );

    // Fetch updated balance
    const updatedBal = await pool.query(
      `SELECT balance FROM shells WHERE "user" = $1`,
      [session.discord_id]
    );

    return NextResponse.json({
      success: true,
      newBalance: updatedBal.rows[0]?.balance ?? 0,
      owned: newOwned.includes(0) ? newOwned : [0, ...newOwned],
    });
  } catch (error) {
    console.error('Background purchase error:', error);
    return NextResponse.json({ error: 'Failed to purchase background' }, { status: 500 });
  }
}
