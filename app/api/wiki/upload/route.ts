import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { getPool } from '@/lib/db';
import { requireGuildSession } from '@/lib/exec-auth';
import { resolveWikiPrincipal } from '@/lib/wiki-auth';
import { recordWikiImage } from '@/lib/wiki-db';
import { putWikiImage, activeImageBackend } from '@/lib/wiki-image-storage';
import {
  MAX_UPLOAD_BYTES,
  compressWikiImage,
  formatBytes,
} from '@/lib/wiki-image-compress';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/**
 * Wiki image upload.
 *
 * The inbound size cap is not ours to choose: a Vercel Function accepts at most
 * 4.5 MB of request body, and that limit is enforced by the platform before
 * this handler runs. We cap a little below it so an oversized file gets a clear
 * message from us instead of an opaque 413. The editor shrinks images in the
 * browser before sending, so this ceiling is rarely reached in practice.
 *
 * Everything is re-encoded to WebP here regardless, stepping quality down until
 * it fits the stored-size target — the browser pass is a convenience, not a
 * thing to trust, since anyone can post to this endpoint directly.
 *
 * Anyone who can publish gets an image live immediately. A linked guild member
 * without publish rights may still upload, but the image stays 'pending' and is
 * unreachable until a suggestion using it is approved.
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
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Only png, jpg, webp and gif are allowed' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error:
          `That file is ${formatBytes(file.size)}. The upload limit is ${formatBytes(MAX_UPLOAD_BYTES)} — ` +
          `resize or screenshot it smaller and try again.`,
      },
      { status: 413 },
    );
  }

  try {
    const input: Buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
    const image = await compressWikiImage(sharp, input, file.type);

    const key = `wiki_images/${randomUUID()}.webp`;
    const stored = await putWikiImage(key, image.data, image.mime);

    const pool = getPool();
    // The row id is only known after the insert, so the serving path is written
    // in a second step rather than guessed.
    const id = await recordWikiImage(pool, {
      url: '',
      s3Key: stored.location,
      backend: stored.backend,
      filename: file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120),
      mime: image.mime,
      bytes: image.data.length,
      width: image.width,
      height: image.height,
      caption: '',
      status: canPublish ? 'active' : 'pending',
      uploadedBy: uploaderId,
    });
    const url = `/api/wiki/image/${id}`;
    await pool.query(`UPDATE wiki_images SET url = $1 WHERE id = $2`, [url, id]);

    return NextResponse.json({
      ok: true,
      id,
      url,
      width: image.width,
      height: image.height,
      bytes: image.data.length,
      originalBytes: file.size,
      backend: activeImageBackend(),
    });
  } catch (error) {
    console.error('[api:wiki/upload] failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
