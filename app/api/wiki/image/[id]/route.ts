import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getWikiImage, type WikiImageBackend } from '@/lib/wiki-image-storage';

export const dynamic = 'force-dynamic';

/**
 * Serve a wiki image.
 *
 * Images are addressed by row id rather than by their storage URL so the
 * backend can move between S3 and Vercel Blob without rewriting URLs already
 * embedded in article bodies, and so quarantined uploads stay unreachable.
 *
 * Only 'active' images are served. An image uploaded by someone without publish
 * rights stays 'pending' until the suggestion using it is approved, so it
 * cannot be surfaced by linking straight to its id.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Bad image id' }, { status: 400 });
  }

  try {
    const result = await getPool().query(
      `SELECT s3_key, backend, mime, status FROM wiki_images WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }
    const row = result.rows[0];
    if (row.status !== 'active' || !row.s3_key) {
      return NextResponse.json({ error: 'Image not available' }, { status: 404 });
    }

    const bytes = await getWikiImage({
      backend: (row.backend as WikiImageBackend) ?? 's3',
      location: row.s3_key,
    });
    if (!bytes) return NextResponse.json({ error: 'Image data is unavailable' }, { status: 404 });

    return new NextResponse(new Uint8Array(bytes), {
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
