import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { getS3 } from '@/lib/s3';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid texture.' }, { status: 400 });
  }

  try {
    const result = await getPool().query(
      `SELECT s3_key
       FROM inventory_texture_assets
       WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Texture not found.' }, { status: 404 });
    }
    const { client, bucket } = getS3();
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: result.rows[0].s3_key }));
    const bytes = await object.Body?.transformToByteArray();
    if (!bytes) return NextResponse.json({ error: 'Texture data is unavailable.' }, { status: 404 });

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Inventory texture fetch error:', error);
    return NextResponse.json({ error: 'Failed to load texture.' }, { status: 500 });
  }
}
