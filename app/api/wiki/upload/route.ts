import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { getPool } from '@/lib/db';
import { getS3 } from '@/lib/s3';
import { requireGuildSession } from '@/lib/exec-auth';
import { resolveWikiPrincipal } from '@/lib/wiki-auth';
import { recordWikiImage } from '@/lib/wiki-db';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/**
 * Wiki image upload.
 *
 * Stored in the site's S3 bucket, the same one backing inventory textures and
 * request attachments. An earlier version wrote to Vercel Blob, which meant
 * every upload 503'd in production because BLOB_READ_WRITE_TOKEN was never
 * provisioned; S3 is already configured, so this works without new secrets.
 *
 * Anyone who can publish (exec or chronicler) gets an image live immediately.
 * A linked guild member without those rights may still upload, but the image is
 * quarantined as 'pending' — it only reaches a published page when a suggestion
 * using it is approved.
 *
 * Pipeline: EXIF stripped and the long edge capped at 1920px via sharp. GIFs
 * pass through untouched so animation survives.
 */
export async function POST(request: NextRequest) {
  const principal = await resolveWikiPrincipal(request);
  const guildSession = principal ? null : await requireGuildSession(request);
  if (!principal && !guildSession) {
    return NextResponse.json(
      { error: 'Sign in as a chronicler or a linked guild account to upload images' },
      { status: 401 },
    );
  }
  const uploaderId = principal?.discordId ?? guildSession!.discord_id;
  const canPublish = principal?.canPublish ?? false;

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
    const s3Key = `wiki_images/${randomUUID()}${mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : ''}`;
    const { client, bucket } = getS3();
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: output,
      ContentType: mime,
    }));

    const pool = getPool();
    // The row id is known only after the insert, so store the serving path in a
    // second step rather than guessing the id.
    const id = await recordWikiImage(pool, {
      url: '',
      s3Key,
      filename: safeName,
      mime,
      bytes: output.length,
      width,
      height,
      caption: '',
      status: canPublish ? 'active' : 'pending',
      uploadedBy: uploaderId,
    });
    const url = `/api/wiki/image/${id}`;
    await pool.query(`UPDATE wiki_images SET url = $1 WHERE id = $2`, [url, id]);

    return NextResponse.json({ ok: true, id, url, width, height });
  } catch (error) {
    console.error('[api:wiki/upload] failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
