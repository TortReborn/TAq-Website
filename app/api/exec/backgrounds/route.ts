import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';

function truthy(v?: string | null) {
  if (!v) return false;
  const s = v.toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

let _s3: S3Client | null = null;
function getS3(): { client: S3Client; bucket: string } {
  const isTest = truthy(process.env.TEST_MODE);
  const bucket = isTest
    ? (process.env.TEST_S3_BUCKET_NAME || 'Tort-Reborn-Dev')
    : (process.env.S3_BUCKET_NAME || 'Tort-Reborn-Prod');

  if (!_s3) {
    _s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT_URL,
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true,
    });
  }
  return { client: _s3, bucket };
}

// GET — Fetch all backgrounds, guild members, discord links, and audit log
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();

    const [backgroundsResult, guildResult, linksResult, auditResult] = await Promise.all([
      pool.query(`SELECT id, name, description, price, public FROM profile_backgrounds ORDER BY id ASC`),
      pool.query(`SELECT data->'members' as members FROM cache_entries WHERE cache_key = 'guildData'`),
      pool.query(`SELECT discord_id, uuid, ign, rank FROM discord_links`),
      pool.query(`
        SELECT a.id, a.actor_name, a.actor_id, a.action, a.created_at,
               dl.ign as actor_ign
        FROM audit_log a
        LEFT JOIN discord_links dl ON dl.discord_id = a.actor_id
        WHERE a.log_type = 'background'
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
      backgrounds: backgroundsResult.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        price: row.price,
        public: row.public,
      })),
      members: guildResult.rows[0]?.members ?? [],
      discordLinks,
      auditLog: auditResult.rows.map((row: any) => ({
        id: row.id,
        actorName: row.actor_ign || row.actor_name,
        action: row.action,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Backgrounds fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch background data' }, { status: 500 });
  }
}

// POST — Upload new background (multipart/form-data)
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const image = formData.get('image') as File | null;
    const name = formData.get('name') as string | null;
    const description = (formData.get('description') as string) || '';
    const price = parseInt(formData.get('price') as string, 10);
    const isPublic = formData.get('public') === 'true';

    if (!image || !name) {
      return NextResponse.json({ error: 'Missing image or name' }, { status: 400 });
    }
    if (isNaN(price) || price < 0 || price > 9999) {
      return NextResponse.json({ error: 'Price must be 0-9999' }, { status: 400 });
    }
    if (image.type !== 'image/png') {
      return NextResponse.json({ error: 'Image must be PNG format' }, { status: 400 });
    }

    const buffer = Buffer.from(await image.arrayBuffer());

    // Validate PNG dimensions from IHDR chunk (bytes 16-19 = width, 20-23 = height)
    if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504E47) {
      return NextResponse.json({ error: 'Invalid PNG file' }, { status: 400 });
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width !== 800 || height !== 526) {
      return NextResponse.json({ error: `Image must be 800x526 pixels (got ${width}x${height})` }, { status: 400 });
    }

    const pool = getPool();

    // Insert into database
    const insertResult = await pool.query(
      `INSERT INTO profile_backgrounds (public, price, name, description) VALUES ($1, $2, $3, $4) RETURNING id`,
      [isPublic, price, name, description]
    );
    const bgId = insertResult.rows[0].id;

    // Upload to S3
    const { client, bucket } = getS3();
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `profile_backgrounds/${bgId}.png`,
      Body: buffer,
      ContentType: 'image/png',
    }));

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (log_type, actor_name, actor_id, action) VALUES ('background', $1, $2, $3)`,
      [session.ign, session.discord_id, `uploaded ${name} (ID: ${bgId}, Description: ${description}, Public: ${isPublic}, Price: ${price})`]
    );

    return NextResponse.json({ success: true, id: bgId });
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'A background with that name already exists' }, { status: 409 });
    }
    console.error('Background upload error:', error);
    return NextResponse.json({ error: 'Failed to upload background' }, { status: 500 });
  }
}

// PATCH — Edit background properties
export async function PATCH(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== 'number') {
      return NextResponse.json({ error: 'Missing background id' }, { status: 400 });
    }

    const pool = getPool();

    // Build dynamic update
    const sets: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (body.name !== undefined) {
      sets.push(`name = $${paramIdx++}`);
      values.push(body.name);
    }
    if (body.description !== undefined) {
      sets.push(`description = $${paramIdx++}`);
      values.push(body.description);
    }
    if (body.price !== undefined) {
      sets.push(`price = $${paramIdx++}`);
      values.push(body.price);
    }
    if (body.public !== undefined) {
      sets.push(`public = $${paramIdx++}`);
      values.push(body.public);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);
    await pool.query(
      `UPDATE profile_backgrounds SET ${sets.join(', ')} WHERE id = $${paramIdx}`,
      values
    );

    // Audit log
    const changedFields = Object.keys(body).filter(k => k !== 'id').join(', ');
    await pool.query(
      `INSERT INTO audit_log (log_type, actor_name, actor_id, action) VALUES ('background', $1, $2, $3)`,
      [session.ign, session.discord_id, `edited background ${id}: changed ${changedFields}`]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'A background with that name already exists' }, { status: 409 });
    }
    console.error('Background edit error:', error);
    return NextResponse.json({ error: 'Failed to edit background' }, { status: 500 });
  }
}

// PUT — User management actions (unlock, set, gradient)
export async function PUT(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    const pool = getPool();

    if (action === 'unlock') {
      const { discordId, backgroundId } = body;
      if (!discordId || backgroundId == null) {
        return NextResponse.json({ error: 'Missing discordId or backgroundId' }, { status: 400 });
      }

      // Get background name for audit log
      const bgResult = await pool.query(`SELECT name FROM profile_backgrounds WHERE id = $1`, [backgroundId]);
      if (bgResult.rows.length === 0) {
        return NextResponse.json({ error: 'Background not found' }, { status: 404 });
      }
      const bgName = bgResult.rows[0].name;

      // Get current customization
      const custResult = await pool.query(
        `SELECT owned FROM profile_customization WHERE "user" = $1`, [discordId]
      );

      if (custResult.rows.length === 0) {
        // No row yet — insert
        await pool.query(
          `INSERT INTO profile_customization ("user", background, owned) VALUES ($1, 1, $2)`,
          [discordId, JSON.stringify([backgroundId])]
        );
      } else {
        const owned: number[] = custResult.rows[0].owned ?? [];
        if (owned.includes(backgroundId)) {
          return NextResponse.json({ error: 'User already owns this background' }, { status: 409 });
        }
        owned.push(backgroundId);
        await pool.query(
          `UPDATE profile_customization SET owned = $1 WHERE "user" = $2`,
          [JSON.stringify(owned), discordId]
        );
      }

      // Resolve target IGN
      const targetResult = await pool.query(`SELECT ign FROM discord_links WHERE discord_id = $1`, [discordId]);
      const targetIgn = targetResult.rows[0]?.ign || discordId;

      await pool.query(
        `INSERT INTO audit_log (log_type, actor_name, actor_id, action) VALUES ('background', $1, $2, $3)`,
        [session.ign, session.discord_id, `unlocked ${bgName} (${backgroundId}) for ${targetIgn} (${discordId})`]
      );

      return NextResponse.json({ success: true });

    } else if (action === 'set') {
      const { discordId, backgroundId } = body;
      if (!discordId || backgroundId == null) {
        return NextResponse.json({ error: 'Missing discordId or backgroundId' }, { status: 400 });
      }

      // Get background name for audit log
      const bgResult = await pool.query(`SELECT name FROM profile_backgrounds WHERE id = $1`, [backgroundId]);
      if (bgResult.rows.length === 0) {
        return NextResponse.json({ error: 'Background not found' }, { status: 404 });
      }
      const bgName = bgResult.rows[0].name;

      // Get current customization
      const custResult = await pool.query(
        `SELECT owned FROM profile_customization WHERE "user" = $1`, [discordId]
      );

      if (custResult.rows.length === 0) {
        await pool.query(
          `INSERT INTO profile_customization ("user", background, owned) VALUES ($1, $2, $3)`,
          [discordId, backgroundId, JSON.stringify([backgroundId])]
        );
      } else {
        const owned: number[] = custResult.rows[0].owned ?? [];
        if (!owned.includes(backgroundId)) {
          owned.push(backgroundId);
          await pool.query(
            `UPDATE profile_customization SET background = $1, owned = $2 WHERE "user" = $3`,
            [backgroundId, JSON.stringify(owned), discordId]
          );
        } else {
          await pool.query(
            `UPDATE profile_customization SET background = $1 WHERE "user" = $2`,
            [backgroundId, discordId]
          );
        }
      }

      // Resolve target IGN
      const targetResult = await pool.query(`SELECT ign FROM discord_links WHERE discord_id = $1`, [discordId]);
      const targetIgn = targetResult.rows[0]?.ign || discordId;

      await pool.query(
        `INSERT INTO audit_log (log_type, actor_name, actor_id, action) VALUES ('background', $1, $2, $3)`,
        [session.ign, session.discord_id, `set ${bgName} (${backgroundId}) for ${targetIgn} (${discordId})`]
      );

      return NextResponse.json({ success: true });

    } else if (action === 'gradient') {
      const { discordId, topColor, bottomColor } = body;
      if (!discordId || !topColor || !bottomColor) {
        return NextResponse.json({ error: 'Missing discordId, topColor, or bottomColor' }, { status: 400 });
      }

      // Validate hex colors
      const hexRegex = /^#[0-9a-fA-F]{6}$/;
      if (!hexRegex.test(topColor) || !hexRegex.test(bottomColor)) {
        return NextResponse.json({ error: 'Invalid hex color format (expected #RRGGBB)' }, { status: 400 });
      }

      const gradient = JSON.stringify([topColor.toLowerCase(), bottomColor.toLowerCase()]);

      const custResult = await pool.query(
        `SELECT "user" FROM profile_customization WHERE "user" = $1`, [discordId]
      );

      if (custResult.rows.length === 0) {
        await pool.query(
          `INSERT INTO profile_customization ("user", background, owned, gradient) VALUES ($1, 1, '[]'::jsonb, $2)`,
          [discordId, gradient]
        );
      } else {
        await pool.query(
          `UPDATE profile_customization SET gradient = $1 WHERE "user" = $2`,
          [gradient, discordId]
        );
      }

      // Resolve target IGN
      const targetResult = await pool.query(`SELECT ign FROM discord_links WHERE discord_id = $1`, [discordId]);
      const targetIgn = targetResult.rows[0]?.ign || discordId;

      await pool.query(
        `INSERT INTO audit_log (log_type, actor_name, actor_id, action) VALUES ('background', $1, $2, $3)`,
        [session.ign, session.discord_id, `set gradient [${topColor.toLowerCase()}, ${bottomColor.toLowerCase()}] for ${targetIgn} (${discordId})`]
      );

      return NextResponse.json({ success: true });

    } else if (action === 'remove') {
      const { discordId, backgroundId } = body;
      if (!discordId || backgroundId == null) {
        return NextResponse.json({ error: 'Missing discordId or backgroundId' }, { status: 400 });
      }

      // Get background name for audit log
      const bgResult = await pool.query(`SELECT name FROM profile_backgrounds WHERE id = $1`, [backgroundId]);
      const bgName = bgResult.rows[0]?.name || `ID ${backgroundId}`;

      // Get current customization
      const custResult = await pool.query(
        `SELECT owned, background FROM profile_customization WHERE "user" = $1`, [discordId]
      );

      if (custResult.rows.length === 0) {
        return NextResponse.json({ error: 'User has no customization data' }, { status: 404 });
      }

      const row = custResult.rows[0];
      const owned: number[] = row.owned ?? [];
      const activeBackground: number = row.background ?? 0;

      if (!owned.includes(backgroundId)) {
        return NextResponse.json({ error: 'User does not own this background' }, { status: 400 });
      }

      const newOwned = owned.filter((id: number) => id !== backgroundId);
      const newActive = activeBackground === backgroundId ? 1 : activeBackground;

      await pool.query(
        `UPDATE profile_customization SET owned = $1, background = $2 WHERE "user" = $3`,
        [JSON.stringify(newOwned), newActive, discordId]
      );

      // Resolve target IGN
      const targetResult = await pool.query(`SELECT ign FROM discord_links WHERE discord_id = $1`, [discordId]);
      const targetIgn = targetResult.rows[0]?.ign || discordId;

      await pool.query(
        `INSERT INTO audit_log (log_type, actor_name, actor_id, action) VALUES ('background', $1, $2, $3)`,
        [session.ign, session.discord_id, `removed ${bgName} (${backgroundId}) from ${targetIgn} (${discordId})${activeBackground === backgroundId ? ' and reset to default' : ''}`]
      );

      return NextResponse.json({ success: true });

    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Background user action error:', error);
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}
