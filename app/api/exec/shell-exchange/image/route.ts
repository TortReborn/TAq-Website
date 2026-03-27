import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';

// 32x32 placeholder with "?" drawn as raw pixels — generated once and cached
let _placeholder: Buffer | null = null;
async function getPlaceholder(): Promise<Buffer> {
  if (_placeholder) return _placeholder;

  const size = 32;
  // RGBA raw pixel buffer
  const pixels = Buffer.alloc(size * size * 4);

  // Fill background #23272f
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4] = 0x23;
    pixels[i * 4 + 1] = 0x27;
    pixels[i * 4 + 2] = 0x2f;
    pixels[i * 4 + 3] = 0xff;
  }

  // Draw "?" in #6b7280 using a bitmap pattern (centered in 32x32)
  const q: [number, number][] = [
    // Top curve of ?
    [13,8],[14,8],[15,8],[16,8],[17,8],[18,8],
    [12,9],[13,9],[18,9],[19,9],
    [11,10],[12,10],[19,10],[20,10],
    [19,11],[20,11],
    [18,12],[19,12],
    [17,13],[18,13],
    [16,14],[17,14],
    [15,15],[16,15],
    [15,16],[16,16],
    [15,17],[16,17],
    // Dot
    [15,19],[16,19],
    [15,20],[16,20],
  ];
  for (const [x, y] of q) {
    const i = (y * size + x) * 4;
    pixels[i] = 0x9c;
    pixels[i + 1] = 0xa3;
    pixels[i + 2] = 0xaf;
    pixels[i + 3] = 0xff;
  }

  _placeholder = await sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer();
  return _placeholder;
}

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

// GET — Proxy an icon image from S3
// Query params: category (ings|mats), key (item name key)
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const key = searchParams.get('key');

  if (!category || !key || !['ings', 'mats'].includes(category)) {
    return NextResponse.json({ error: 'Missing or invalid category/key' }, { status: 400 });
  }

  const safe = key.replace(/ /g, '_');
  const s3Key = `shell_exchange/${category}/${safe}.png`;

  try {
    const { client, bucket } = getS3();
    const resp = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    }));

    const bytes = await resp.Body?.transformToByteArray();
    if (!bytes) {
      const placeholder = await getPlaceholder();
      return new NextResponse(placeholder, {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' },
      });
    }

    const etag = resp.ETag ?? null;

    const headers: Record<string, string> = {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    };
    if (etag) headers['ETag'] = etag;

    return new NextResponse(bytes, { headers });
  } catch {
    const placeholder = await getPlaceholder();
    return new NextResponse(placeholder, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' },
    });
  }
}
