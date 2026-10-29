import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getS3 } from '@/lib/s3';

export const dynamic = 'force-dynamic';

/** Proof screenshots are only ever served through here, behind exec auth. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const attId = parseInt(id, 10);
    if (isNaN(attId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT s3_key, content_type FROM player_warning_attachments WHERE id = $1 AND s3_key <> ''`,
      [attId]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    const { s3_key, content_type } = result.rows[0];
    const { client, bucket } = getS3();

    const resp = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: s3_key,
    }));

    const bytes = await resp.Body?.transformToByteArray();
    if (!bytes) {
      return NextResponse.json({ error: 'Failed to read attachment' }, { status: 500 });
    }

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': content_type,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Warning attachment fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch attachment' }, { status: 500 });
  }
}
