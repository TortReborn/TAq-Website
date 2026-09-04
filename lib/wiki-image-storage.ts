/**
 * Where wiki images are stored.
 *
 * Vercel Blob is used when BLOB_READ_WRITE_TOKEN is set, and the site's S3
 * bucket (Supabase Storage) otherwise. Both are kept because they fail in
 * opposite ways: Blob needs a token provisioned in the Vercel dashboard, and S3
 * is already configured but is not a CDN. Supporting both means uploads keep
 * working through provisioning, with no flag day.
 *
 * Blob stores come in two flavours and the difference is not cosmetic:
 *
 *   PUBLIC  — objects are served from Blob's CDN at a stable URL. The serving
 *             route can redirect to it, so images never touch a function.
 *   PRIVATE — objects require the store token to read. Nothing can be
 *             redirected to, so bytes are proxied through the serving route.
 *             Correct, but every image costs a function invocation.
 *
 * Which one a store is cannot be detected from the token, so it is declared by
 * WIKI_BLOB_ACCESS. Writing with the wrong mode fails with a BlobAccessError
 * ("forbidden") rather than silently doing the wrong thing, and the upload
 * route surfaces that as a setup error.
 *
 * Either way an image is addressed as /api/wiki/image/<id> rather than by its
 * storage URL, so the backend can change without rewriting URLs already
 * embedded in article bodies, and quarantined uploads stay unreachable.
 */

export type WikiImageBackend = 'blob' | 'blob-private' | 's3';

export function activeImageBackend(): WikiImageBackend {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return 's3';
  return process.env.WIKI_BLOB_ACCESS === 'private' ? 'blob-private' : 'blob';
}

/** True when the viewer's browser can be sent straight at the stored object. */
export function isPubliclyAddressable(backend: WikiImageBackend): boolean {
  return backend === 'blob';
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
  const backend = activeImageBackend();

  if (backend === 'blob' || backend === 'blob-private') {
    const { put } = await import('@vercel/blob');
    const blob = await put(key, body, {
      access: backend === 'blob' ? 'public' : 'private',
      contentType,
      // The key already carries a uuid, so Blob's own random suffix would only
      // make an image harder to trace back to its row.
      addRandomSuffix: false,
      // Content at a key never changes — a re-upload gets a new uuid — so let
      // the CDN hold it for a year. Ignored for private blobs.
      cacheControlMaxAge: 31536000,
    });
    return { backend, location: blob.url };
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

/** Read bytes back, for the backends that cannot simply be redirected to. */
export async function getWikiImage(stored: StoredImage): Promise<Buffer | null> {
  if (stored.backend === 'blob-private') {
    const { get } = await import('@vercel/blob');
    const result = await get(stored.location, { access: 'private' });
    if (!result?.stream) return null;
    const chunks: Uint8Array[] = [];
    // @ts-expect-error — a web ReadableStream is async-iterable at runtime in Node
    for await (const chunk of result.stream) chunks.push(chunk as Uint8Array);
    return Buffer.concat(chunks);
  }

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
