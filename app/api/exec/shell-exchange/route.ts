import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

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

function nameToKey(name: string): string {
  return name.trim().toLowerCase().replace(/_/g, ' ');
}

function s3IconKey(category: string, nameKey: string): string {
  const safe = nameKey.replace(/ /g, '_');
  return `shell_exchange/${category}/${safe}.png`;
}

type CacheKey = 'shellExchangeIngs' | 'shellExchangeMats';

async function getCacheData(cacheKey: CacheKey): Promise<Record<string, any>> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT data FROM cache_entries WHERE cache_key = $1`,
    [cacheKey]
  );
  if (result.rows.length === 0 || !result.rows[0].data) return {};
  const data = result.rows[0].data;
  return typeof data === 'string' ? JSON.parse(data) : data;
}

async function saveCacheData(cacheKey: CacheKey, data: Record<string, any>): Promise<void> {
  const pool = getPool();
  const epoch = new Date(0).toISOString();
  await pool.query(
    `INSERT INTO cache_entries (cache_key, data, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, created_at = NOW()`,
    [cacheKey, JSON.stringify(data), epoch]
  );
}

// GET — List all ingredients and materials
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [ings, mats] = await Promise.all([
      getCacheData('shellExchangeIngs'),
      getCacheData('shellExchangeMats'),
    ]);

    const ingredients = Object.entries(ings).map(([key, data]) => ({
      key,
      name: key.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      shells: data?.shells ?? 1,
      per: data?.per ?? 1,
      highlight: data?.highlight ?? false,
      toggled: data?.toggled ?? true,
    }));

    const materials = Object.entries(mats).map(([key, data]) => ({
      key,
      name: key.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      tiers: {
        t1: { shells: data?.t1?.shells ?? 1, per: data?.t1?.per ?? 1, highlight: data?.t1?.highlight ?? false, toggled: data?.t1?.toggled ?? true },
        t2: { shells: data?.t2?.shells ?? 1, per: data?.t2?.per ?? 1, highlight: data?.t2?.highlight ?? false, toggled: data?.t2?.toggled ?? true },
        t3: { shells: data?.t3?.shells ?? 1, per: data?.t3?.per ?? 1, highlight: data?.t3?.highlight ?? false, toggled: data?.t3?.toggled ?? true },
      },
    }));

    return NextResponse.json({ ingredients, materials });
  } catch (error) {
    console.error('Shell exchange fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch shell exchange data' }, { status: 500 });
  }
}

// POST — Add new ingredient or material with image
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const image = formData.get('image') as File | null;
    const name = formData.get('name') as string | null;
    const type = formData.get('type') as string | null;

    if (!image || !name || !type) {
      return NextResponse.json({ error: 'Missing image, name, or type' }, { status: 400 });
    }
    if (type !== 'ingredient' && type !== 'material') {
      return NextResponse.json({ error: 'Type must be "ingredient" or "material"' }, { status: 400 });
    }
    if (image.type !== 'image/png') {
      return NextResponse.json({ error: 'Image must be PNG format' }, { status: 400 });
    }

    const buffer = Buffer.from(await image.arrayBuffer());

    // Validate PNG header and dimensions (16x16 or 32x32)
    if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504E47) {
      return NextResponse.json({ error: 'Invalid PNG file' }, { status: 400 });
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    const validSize = (width === 16 && height === 16) || (width === 32 && height === 32);
    if (!validSize) {
      return NextResponse.json({ error: `Image must be 16x16 or 32x32 pixels (got ${width}x${height})` }, { status: 400 });
    }

    const key = nameToKey(name);
    const cacheKey: CacheKey = type === 'ingredient' ? 'shellExchangeIngs' : 'shellExchangeMats';
    const category = type === 'ingredient' ? 'ings' : 'mats';

    const data = await getCacheData(cacheKey);

    // Check if already exists
    for (const k of Object.keys(data)) {
      if (k.toLowerCase() === key) {
        return NextResponse.json({ error: `${type === 'ingredient' ? 'Ingredient' : 'Material'} "${name}" already exists` }, { status: 409 });
      }
    }

    // Add default entry
    if (type === 'ingredient') {
      data[key] = { shells: 1, per: 1, highlight: false, toggled: true };
    } else {
      data[key] = {
        t1: { shells: 1, per: 1, highlight: false, toggled: true },
        t2: { shells: 1, per: 1, highlight: false, toggled: true },
        t3: { shells: 1, per: 1, highlight: false, toggled: true },
      };
    }

    // Upload image to S3
    const { client, bucket } = getS3();
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: s3IconKey(category, key),
      Body: buffer,
      ContentType: 'image/png',
    }));

    // Save to DB
    await saveCacheData(cacheKey, data);

    // Audit log
    const pool = getPool();
    await pool.query(
      `INSERT INTO audit_log (log_type, actor_name, actor_id, action) VALUES ('shell_exchange', $1, $2, $3)`,
      [session.ign, session.discord_id, `added ${type} "${name.trim()}"`]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shell exchange add error:', error);
    return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
  }
}

// PUT — Update image or values for existing item
export async function PUT(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const name = formData.get('name') as string | null;
    const type = formData.get('type') as string | null;
    const image = formData.get('image') as File | null;

    if (!name || !type) {
      return NextResponse.json({ error: 'Missing name or type' }, { status: 400 });
    }
    if (type !== 'ingredient' && type !== 'material') {
      return NextResponse.json({ error: 'Type must be "ingredient" or "material"' }, { status: 400 });
    }

    const key = nameToKey(name);
    const cacheKey: CacheKey = type === 'ingredient' ? 'shellExchangeIngs' : 'shellExchangeMats';
    const category = type === 'ingredient' ? 'ings' : 'mats';

    const data = await getCacheData(cacheKey);

    // Find existing key (case-insensitive)
    let existingKey: string | null = null;
    for (const k of Object.keys(data)) {
      if (k.toLowerCase() === key) {
        existingKey = k;
        break;
      }
    }
    if (!existingKey) {
      return NextResponse.json({ error: `${type === 'ingredient' ? 'Ingredient' : 'Material'} "${name}" not found` }, { status: 404 });
    }

    const changes: string[] = [];

    // Update image if provided
    if (image) {
      if (image.type !== 'image/png') {
        return NextResponse.json({ error: 'Image must be PNG format' }, { status: 400 });
      }
      const buffer = Buffer.from(await image.arrayBuffer());
      if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504E47) {
        return NextResponse.json({ error: 'Invalid PNG file' }, { status: 400 });
      }
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      const validSize = (width === 16 && height === 16) || (width === 32 && height === 32);
      if (!validSize) {
        return NextResponse.json({ error: `Image must be 16x16 or 32x32 pixels (got ${width}x${height})` }, { status: 400 });
      }

      const { client, bucket } = getS3();
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: s3IconKey(category, existingKey),
        Body: buffer,
        ContentType: 'image/png',
      }));
      changes.push('image');
    }

    // Update values if provided
    if (type === 'ingredient') {
      const shells = formData.get('shells');
      const per = formData.get('per');
      const highlight = formData.get('highlight');
      const toggled = formData.get('toggled');

      if (shells !== null) { data[existingKey].shells = parseInt(shells as string, 10); changes.push(`shells=${shells}`); }
      if (per !== null) { data[existingKey].per = parseInt(per as string, 10); changes.push(`per=${per}`); }
      if (highlight !== null) { data[existingKey].highlight = highlight === 'true'; changes.push(`highlight=${highlight}`); }
      if (toggled !== null) { data[existingKey].toggled = toggled === 'true'; changes.push(`toggled=${toggled}`); }
    } else {
      for (const tier of ['t1', 't2', 't3']) {
        const shells = formData.get(`${tier}_shells`);
        const per = formData.get(`${tier}_per`);
        const highlight = formData.get(`${tier}_highlight`);
        const toggled = formData.get(`${tier}_toggled`);

        if (!data[existingKey][tier]) data[existingKey][tier] = {};
        if (shells !== null) { data[existingKey][tier].shells = parseInt(shells as string, 10); changes.push(`${tier}.shells=${shells}`); }
        if (per !== null) { data[existingKey][tier].per = parseInt(per as string, 10); changes.push(`${tier}.per=${per}`); }
        if (highlight !== null) { data[existingKey][tier].highlight = highlight === 'true'; changes.push(`${tier}.highlight=${highlight}`); }
        if (toggled !== null) { data[existingKey][tier].toggled = toggled === 'true'; changes.push(`${tier}.toggled=${toggled}`); }
      }
    }

    if (changes.length > 0) {
      await saveCacheData(cacheKey, data);

      const pool = getPool();
      await pool.query(
        `INSERT INTO audit_log (log_type, actor_name, actor_id, action) VALUES ('shell_exchange', $1, $2, $3)`,
        [session.ign, session.discord_id, `updated ${type} "${name.trim()}" (${changes.join(', ')})`]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shell exchange update error:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

// DELETE — Remove ingredient or material
export async function DELETE(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, type } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Missing name or type' }, { status: 400 });
    }
    if (type !== 'ingredient' && type !== 'material') {
      return NextResponse.json({ error: 'Type must be "ingredient" or "material"' }, { status: 400 });
    }

    const key = nameToKey(name);
    const cacheKey: CacheKey = type === 'ingredient' ? 'shellExchangeIngs' : 'shellExchangeMats';
    const category = type === 'ingredient' ? 'ings' : 'mats';

    const data = await getCacheData(cacheKey);

    // Find existing key (case-insensitive)
    let existingKey: string | null = null;
    for (const k of Object.keys(data)) {
      if (k.toLowerCase() === key) {
        existingKey = k;
        break;
      }
    }
    if (!existingKey) {
      return NextResponse.json({ error: `${type === 'ingredient' ? 'Ingredient' : 'Material'} "${name}" not found` }, { status: 404 });
    }

    // Remove from DB
    delete data[existingKey];
    await saveCacheData(cacheKey, data);

    // Delete image from S3
    const { client, bucket } = getS3();
    try {
      await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: s3IconKey(category, existingKey),
      }));
    } catch {
      // Image may not exist, that's fine
    }

    // Audit log
    const pool = getPool();
    await pool.query(
      `INSERT INTO audit_log (log_type, actor_name, actor_id, action) VALUES ('shell_exchange', $1, $2, $3)`,
      [session.ign, session.discord_id, `removed ${type} "${name.trim()}"`]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shell exchange delete error:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
