import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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

interface CacheEntry {
  bytes: Uint8Array;
  etag: string;
  cachedAt: number;
}

const bgCache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 24 * 3600_000; // 30 days
const MAX_CACHE_ENTRIES = 100;

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

/** Get a cached background, or fetch from S3 if not cached. Returns null if not found. */
export async function getBackground(id: string): Promise<CacheEntry | null> {
  const cached = bgCache.get(id);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached;
  }

  try {
    const { client, bucket } = getS3();
    const response = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: `profile_backgrounds/${id}.png`,
    }));

    const body = response.Body;
    if (!body) return null;

    const bytes = await body.transformToByteArray();
    const etag = response.ETag || `"bg-${id}"`;
    const entry: CacheEntry = { bytes, etag, cachedAt: Date.now() };

    bgCache.set(id, entry);
    evictOldest();

    return entry;
  } catch (error: any) {
    if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

/** Warm the cache for a list of background IDs (skips already-cached entries). */
export async function warmCache(ids: number[]) {
  const toFetch = ids.filter(id => {
    const cached = bgCache.get(String(id));
    return !cached || Date.now() - cached.cachedAt >= CACHE_TTL;
  });

  await Promise.allSettled(toFetch.map(id => getBackground(String(id))));
}

/** Check if a background is already cached (without fetching). */
export function isCached(id: string): boolean {
  const cached = bgCache.get(id);
  return !!cached && Date.now() - cached.cachedAt < CACHE_TTL;
}
