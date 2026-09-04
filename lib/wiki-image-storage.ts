/**
 * Where wiki images are stored.
 *
 * Vercel Blob is used when BLOB_READ_WRITE_TOKEN is set, and the site's S3
 * bucket otherwise. Both are kept because they fail in opposite ways: Blob
 * needs a token that has to be provisioned in the Vercel dashboard, and S3 is
 * already configured but is not a CDN. Supporting both means uploads keep
 * working through the provisioning, and there is no flag day.
 *
 * Either way the image is addressed as /api/wiki/image/<id> rather than by its
 * storage URL, so the backend can change without rewriting URLs already
 * embedded in article bodies, and so quarantined uploads stay unreachable.
 */

export type WikiImageBackend = 'blob' | 's3';

export function activeImageBackend(): WikiImageBackend {
  return process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 's3';
}

export interface StoredImage {
  backend: WikiImageBackend;
  /** S3 object key, or the Vercel Blob URL. */
  location: string;
}

/** Store bytes and return where they went. */
export async function putWikiImage(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<StoredImage> {
  if (activeImageBackend() === 'blob') {
    const { put } = await import('@vercel/blob');
    const blob = await put(key, body, {
      access: 'public',
      contentType,
      // The key already carries a uuid, so Blob's own random suffix would only
      // make an image harder to trace back to its row.
      addRandomSuffix: false,
      // Content at a given key never changes — a re-upload gets a new uuid —
      // so let the CDN hold it for a year.
      cacheControlMaxAge: 31536000,
    });
    return { backend: 'blob', location: blob.url };
  }

  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getS3 } = await import('@/lib/s3');
  const { client, bucket } = getS3();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return { backend: 's3', location: key };
}

/** Read bytes back for the serving route. */
export async function getWikiImage(stored: StoredImage): Promise<Buffer | null> {
  if (stored.backend === 'blob') {
    const res = await fetch(stored.location);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }

  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getS3 } = await import('@/lib/s3');
  const { client, bucket } = getS3();
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: stored.location }));
  const bytes = await object.Body?.transformToByteArray();
  return bytes ? Buffer.from(bytes) : null;
}
