import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';

// 32x32 placeholder with "?" — generated once and cached in memory
let _placeholder: Buffer | null = null;
async function getPlaceholder(): Promise<Buffer> {
  if (_placeholder) return _placeholder;

  const size = 32;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="4" fill="#23272f"/>
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
      font-family="Arial,sans-serif" font-size="20" font-weight="bold" fill="#6b7280">?</text>
  </svg>`;

  _placeholder = await sharp(Buffer.from(svg)).png().toBuffer();
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
