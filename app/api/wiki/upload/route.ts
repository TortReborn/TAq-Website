import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { getPool } from '@/lib/db';
import { requireGuildSession } from '@/lib/exec-auth';
import { recordWikiImage } from '@/lib/wiki-db';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/**
 * Wiki image upload → Vercel Blob. Execs' images are active immediately;
 * other linked accounts' images are recorded as pending (quarantine — they
 * only appear in published pages once a suggestion using them is approved).
 * Pipeline: EXIF stripped and long edge capped at 1920px via sharp
 * (gifs pass through untouched to preserve animation).
 */
export async function POST(request: NextRequest) {
  const session = await requireGuildSession(request);
  if (!session) {
    return NextResponse.json({ error: 'A linked guild account is required' }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Image storage is not configured (BLOB_READ_WRITE_TOKEN missing)' }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file field required' }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Only png, jpg, webp and gif are allowed' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Max file size is 5 MB' }, { status: 400 });

  try {
    const input: Buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
    let output: Buffer = input;
    let mime = file.type;
    let width: number | null = null;
    let height: number | null = null;

    if (file.type !== 'image/gif') {
      const processed = await sharp(input)
        .rotate() // apply EXIF orientation, then metadata (incl. EXIF) is dropped
        .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer({ resolveWithObject: true });
      output = processed.data;
      mime = 'image/webp';
      width = processed.info.width;
      height = processed.info.height;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const key = `wiki/${Date.now()}-${safeName}${mime === 'image/webp' && !safeName.endsWith('.webp') ? '.webp' : ''}`;
    const blob = await put(key, output, { access: 'public', contentType: mime });

    const pool = getPool();
    const id = await recordWikiImage(pool, {
      url: blob.url,
      filename: safeName,
      mime,
      bytes: output.length,
      width,
      height,
      caption: '',
      status: session.role === 'exec' ? 'active' : 'pending',
      uploadedBy: session.discord_id,
    });

    return NextResponse.json({ ok: true, id, url: blob.url, width, height });
  } catch (error) {
    console.error('[api:wiki/upload] failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
