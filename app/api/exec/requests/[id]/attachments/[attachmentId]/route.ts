import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getS3 } from '@/lib/s3';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, attachmentId } = await params;
    const ticketId = parseInt(id, 10);
    const attId = parseInt(attachmentId, 10);
    if (isNaN(ticketId) || isNaN(attId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const pool = getPool();
    const result = await pool.query(
      'SELECT s3_key, content_type FROM tracker_attachments WHERE id = $1 AND ticket_id = $2',
      [attId, ticketId]
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

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': content_type,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Attachment fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch attachment' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, attachmentId } = await params;
    const ticketId = parseInt(id, 10);
    const attId = parseInt(attachmentId, 10);
    if (isNaN(ticketId) || isNaN(attId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const pool = getPool();
    const result = await pool.query(
      'SELECT s3_key FROM tracker_attachments WHERE id = $1 AND ticket_id = $2',
      [attId, ticketId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    const { s3_key } = result.rows[0];
    const { client, bucket } = getS3();

    // Delete from S3
    await client.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: s3_key,
    }));

    // Delete DB row
    await pool.query('DELETE FROM tracker_attachments WHERE id = $1', [attId]);

    // Touch updated_at on the ticket
    await pool.query('UPDATE tracker_tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Attachment delete error:', error);
    return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 });
  }
}
