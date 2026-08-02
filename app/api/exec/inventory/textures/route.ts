import { randomUUID } from 'crypto';
import { readdir } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { getS3 } from '@/lib/s3';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 2 * 1024 * 1024;

interface TextureAsset {
  id: string;
  name: string;
  url: string;
  source: 'inventory' | 'shell-exchange' | 'uploaded';
  kind: 'ingredient' | 'consumable' | 'material' | 'custom' | 'unassigned';
}

async function walkPngs(root: string, relative = ''): Promise<string[]> {
  const directory = path.join(root, relative);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const next = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walkPngs(root, next));
    else if (entry.isFile() && entry.name.toLocaleLowerCase('en-US').endsWith('.png')) files.push(next);
  }
  return files;
}

function titleFromFile(file: string): string {
  return path.basename(file, path.extname(file))
    .split(/[-_]/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function parseCache(value: unknown): Record<string, any> {
  if (!value) return {};
  return typeof value === 'string' ? JSON.parse(value) : value as Record<string, any>;
}

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const pool = getPool();
    const [staticFiles, uploadedResult, cacheResult] = await Promise.all([
      walkPngs(path.join(process.cwd(), 'public', 'inventory')),
      pool.query(
        `SELECT id, name, created_by, created_at
         FROM inventory_texture_assets
         ORDER BY created_at DESC`
      ),
      pool.query(
        `SELECT cache_key, data
         FROM cache_entries
         WHERE cache_key IN ('shellExchangeIngs', 'shellExchangeMats')`
      ),
    ]);

    const assets: TextureAsset[] = staticFiles.map(file => ({
      id: `static:${file}`,
      name: titleFromFile(file),
      url: `/inventory/${file.split(path.sep).join('/')}`,
      source: 'inventory',
      kind: file.startsWith('unassigned/')
        ? 'unassigned'
        : file.startsWith('consumables/')
          ? 'consumable'
          : 'ingredient',
    }));

    for (const row of cacheResult.rows) {
      const category = row.cache_key === 'shellExchangeIngs' ? 'ings' : 'mats';
      const kind = category === 'ings' ? 'ingredient' : 'material';
      for (const [key, value] of Object.entries(parseCache(row.data))) {
        const data = value as Record<string, any>;
        assets.push({
          id: `shell:${category}:${key}`,
          name: key.trim().split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
          url: `/api/exec/shell-exchange/image?category=${category}&key=${encodeURIComponent(key)}&v=${data.iv ?? 0}`,
          source: 'shell-exchange',
          kind,
        });
      }
    }

    for (const row of uploadedResult.rows) {
      assets.push({
        id: `upload:${row.id}`,
        name: row.name,
        url: `/api/exec/inventory/textures/${row.id}`,
        source: 'uploaded',
        kind: 'custom',
      });
    }

    return NextResponse.json({ assets });
  } catch (error) {
    console.error('Inventory texture list error:', error);
    return NextResponse.json({ error: 'Failed to load texture library.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose a PNG file to upload.' }, { status: 400 });
    }
    if (file.type !== 'image/png' || file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Texture must be a PNG no larger than 2 MB.' }, { status: 400 });
    }

    const raw = Buffer.from(await file.arrayBuffer());
    if (!raw.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return NextResponse.json({ error: 'The selected file is not a valid PNG.' }, { status: 400 });
    }
    const metadata = await sharp(raw).metadata();
    if (!metadata.width || !metadata.height || metadata.width > 512 || metadata.height > 512) {
      return NextResponse.json({ error: 'Texture dimensions must be at most 512×512.' }, { status: 400 });
    }

    const png = await sharp(raw)
      .resize(64, 64, { fit: 'contain', kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    const requestedName = String(form.get('name') ?? '').trim();
    const name = (requestedName || titleFromFile(file.name)).slice(0, 120);
    const s3Key = `inventory_uploads/${randomUUID()}.png`;
    const { client, bucket } = getS3();
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: png,
      ContentType: 'image/png',
    }));

    const result = await getPool().query(
      `INSERT INTO inventory_texture_assets (name, s3_key, created_by)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [name, s3Key, session.ign]
    );
    const id = Number(result.rows[0].id);
    return NextResponse.json({
      success: true,
      asset: {
        id: `upload:${id}`,
        name,
        url: `/api/exec/inventory/textures/${id}`,
        source: 'uploaded',
        kind: 'custom',
      },
    });
  } catch (error) {
    console.error('Inventory texture upload error:', error);
    return NextResponse.json({ error: 'Failed to upload texture.' }, { status: 500 });
  }
}
