import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getPool } from '@/lib/db';
import { getS3 } from '@/lib/s3';

export const dynamic = 'force-dynamic';

/**
 * Serve a wiki image out of S3. The bucket is not public, so uploads are
 * referenced as /api/wiki/image/<id> and streamed through here.
 *
 * Only 'active' images are served. An image uploaded by someone without publish
 * rights stays 'pending' until the suggestion using it is approved, so a
 * quarantined image cannot be surfaced simply by linking straight to its id.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Bad image id' }, { status: 400 });
  }

  try {
    const result = await getPool().query(
      `SELECT s3_key, mime, status FROM wiki_images WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }
    const row = result.rows[0];
    if (row.status !== 'active' || !row.s3_key) {
      return NextResponse.json({ error: 'Image not available' }, { status: 404 });
    }

    const { client, bucket } = getS3();
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: row.s3_key }));
    const bytes = await object.Body?.transformToByteArray();
    if (!bytes) return NextResponse.json({ error: 'Image data is unavailable' }, { status: 404 });

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': row.mime || 'image/webp',
        // Content at a given id never changes — a new upload gets a new id.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[api:wiki/image] failed:', error);
    return NextResponse.json({ error: 'Failed to load image' }, { status: 500 });
  }
}
