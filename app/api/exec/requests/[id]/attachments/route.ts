import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3 } from '@/lib/s3';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ATTACHMENTS = 5;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    const pool = getPool();

    // Verify ticket exists
    const ticketResult = await pool.query('SELECT id FROM tracker_tickets WHERE id = $1', [ticketId]);
    if (ticketResult.rows.length === 0) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Count existing attachments
    const countResult = await pool.query(
      'SELECT COUNT(*) AS cnt FROM tracker_attachments WHERE ticket_id = $1',
      [ticketId]
    );
    const existingCount = parseInt(countResult.rows[0].cnt, 10);

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (existingCount + files.length > MAX_ATTACHMENTS) {
      return NextResponse.json(
        { error: `Cannot exceed ${MAX_ATTACHMENTS} attachments per ticket (currently ${existingCount})` },
        { status: 400 }
      );
    }

    // Validate all files before uploading any
    for (const file of files) {
      if (!ALLOWED_TYPES[file.type]) {
        return NextResponse.json(
          { error: `Invalid file type: ${file.type}. Allowed: PNG, JPEG, GIF, WebP` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds 5MB limit` },
          { status: 400 }
        );
      }
    }

    const { client, bucket } = getS3();
    const uploaded: { id: number; filename: string; contentType: string; sizeBytes: number; createdAt: string }[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = ALLOWED_TYPES[file.type];

      // Insert DB row to get ID
      const insertResult = await pool.query(
        `INSERT INTO tracker_attachments (ticket_id, s3_key, filename, content_type, size_bytes, uploaded_by)
         VALUES ($1, '', $2, $3, $4, $5)
         RETURNING id, created_at`,
        [ticketId, file.name, file.type, file.size, session.discord_id]
      );
      const attachmentId = insertResult.rows[0].id;
      const createdAt = insertResult.rows[0].created_at;
      const s3Key = `tracker_attachments/${ticketId}/${attachmentId}.${ext}`;

      try {
        // Upload to S3
        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: file.type,
        }));

        // Update s3_key
        await pool.query('UPDATE tracker_attachments SET s3_key = $1 WHERE id = $2', [s3Key, attachmentId]);

        uploaded.push({
          id: attachmentId,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          createdAt,
        });
      } catch (s3Error) {
        // Clean up DB row if S3 upload fails
        await pool.query('DELETE FROM tracker_attachments WHERE id = $1', [attachmentId]);
        throw s3Error;
      }
    }

    // Touch updated_at on the ticket
    await pool.query('UPDATE tracker_tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);

    return NextResponse.json({ success: true, attachments: uploaded });
  } catch (error) {
    console.error('Attachment upload error:', error);
    return NextResponse.json({ error: 'Failed to upload attachments' }, { status: 500 });
  }
}
