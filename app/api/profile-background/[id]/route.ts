import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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

// In-memory cache for background images (avoids repeated S3 fetches)
const bgCache = new Map<string, { bytes: Uint8Array; etag: string; cachedAt: number }>();
const CACHE_TTL = 3600_000; // 1 hour
const MAX_CACHE_ENTRIES = 60;

function evictOldest() {
  if (bgCache.size <= MAX_CACHE_ENTRIES) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of bgCache) {
    if (entry.cachedAt < oldestTime) {
      oldestTime = entry.cachedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) bgCache.delete(oldestKey);
}

const RESPONSE_HEADERS = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=86400, s-maxage=86400',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;

  // Validate: must be a positive integer
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid background ID' }, { status: 400 });
  }

  // Check in-memory cache
  const cached = bgCache.get(id);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    const ifNoneMatch = _request.headers.get('if-none-match');
    if (ifNoneMatch === cached.etag) {
      return new NextResponse(null, { status: 304, headers: { 'ETag': cached.etag } });
    }
    return new NextResponse(cached.bytes, {
      status: 200,
      headers: { ...RESPONSE_HEADERS, 'ETag': cached.etag },
    });
  }

  try {
    const { client, bucket } = getS3();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: `profile_backgrounds/${id}.png`,
    });

    const response = await client.send(command);
    const body = response.Body;
    if (!body) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Stream the response as bytes
    const bytes = await body.transformToByteArray();
    const etag = response.ETag || `"bg-${id}"`;

    // Store in cache
    bgCache.set(id, { bytes, etag, cachedAt: Date.now() });
    evictOldest();

    return new NextResponse(bytes, {
      status: 200,
      headers: { ...RESPONSE_HEADERS, 'ETag': etag },
    });
  } catch (error: any) {
    if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
      return NextResponse.json({ error: 'Background not found' }, { status: 404 });
    }
    console.error('Background fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch background' }, { status: 500 });
  }
}
