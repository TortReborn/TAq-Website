import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { requireExecSession } from '@/lib/exec-auth';
import { getS3 } from '@/lib/s3';
import { ASSET_NAME_RE, ASSET_SCHEME } from '@/lib/bot-panels';

export const dynamic = 'force-dynamic';

// Same prefix the bot reads from (Tort-Reborn Helpers/bot_panels.py ASSET_PREFIX)
const PREFIX = 'bot_panels/';
const MAX_BYTES = 8 * 1024 * 1024; // Discord's attachment limit for an unboosted server
const FORMATS: Record<string, { ext: string; type: string }> = {
  png: { ext: 'png', type: 'image/png' },
  jpeg: { ext: 'jpg', type: 'image/jpeg' },
  gif: { ext: 'gif', type: 'image/gif' },
  webp: { ext: 'webp', type: 'image/webp' },
};

// POST — upload an image; returns the asset:// url panels reference.
// Stored as uploaded (GIFs keep their animation), named by content hash so
// the same banner uploaded twice is one object.
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let file: File | null;
  try {
    file = (await request.formData()).get('image') as File | null;
  } catch {
    return NextResponse.json({ error: 'Expected a multipart upload' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'Missing image' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Images must be 8 MB or smaller' }, { status: 400 });

  const data = Buffer.from(await file.arrayBuffer());
  let meta;
  try {
    meta = await sharp(data, { animated: true }).metadata();
  } catch {
    return NextResponse.json({ error: 'Not a readable image' }, { status: 400 });
  }
  const format = meta.format ? FORMATS[meta.format] : undefined;
  if (!format) return NextResponse.json({ error: 'Use PNG, JPEG, GIF or WebP' }, { status: 400 });

  const name = `${createHash('sha256').update(data).digest('hex').slice(0, 16)}.${format.ext}`;
  try {
    const { client, bucket } = getS3();
    const exists = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: PREFIX + name }))
      .then(() => true, () => false);
    if (!exists) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: PREFIX + name, Body: data, ContentType: format.type }));
    }
  } catch (error) {
    console.error('Bot panel asset upload error:', error);
    return NextResponse.json({ error: 'Failed to store image' }, { status: 500 });
  }

  return NextResponse.json({ url: ASSET_SCHEME + name, width: meta.width, height: meta.pageHeight ?? meta.height });
}

// GET ?name= — stream an uploaded image for the editor preview
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const name = request.nextUrl.searchParams.get('name') ?? '';
  if (!ASSET_NAME_RE.test(name)) return NextResponse.json({ error: 'Invalid asset name' }, { status: 400 });

  try {
    const { client, bucket } = getS3();
    const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: PREFIX + name }));
    const body = Buffer.from(await obj.Body!.transformToByteArray());
    return new NextResponse(body, {
      headers: {
        'Content-Type': obj.ContentType || 'application/octet-stream',
        // Content-addressed: a name never changes what it points at
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
