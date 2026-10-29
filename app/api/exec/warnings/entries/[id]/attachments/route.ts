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

// The client compresses before sending (lib/compress-image-client.ts) and
// uploads one file per request, so the platform's 4.5 MB body cap holds.
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

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
    const warningId = parseInt(id, 10);
    if (isNaN(warningId)) {
      return NextResponse.json({ error: 'Invalid warning ID' }, { status: 400 });
    }

    const pool = getPool();

    const warning = await pool.query('SELECT uuid FROM player_warnings WHERE id = $1', [warningId]);
    if (warning.rows.length === 0) {
      return NextResponse.json({ error: 'Warning not found' }, { status: 404 });
    }

    const countResult = await pool.query(
      'SELECT COUNT(*) AS cnt FROM player_warning_attachments WHERE warning_id = $1',
      [warningId]
    );
    const existingCount = parseInt(countResult.rows[0].cnt, 10);

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }
    if (existingCount + files.length > MAX_ATTACHMENTS) {
      return NextResponse.json(
        { error: `A warning can have at most ${MAX_ATTACHMENTS} screenshots (it has ${existingCount})` },
        { status: 400 }
      );
    }

    // Validate all files before uploading any
    for (const file of files) {
      if (!ALLOWED_TYPES[file.type]) {
        return NextResponse.json(
          { error: `"${file.name}" isn't an image. Use PNG, JPEG, GIF or WebP.` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `"${file.name}" is over 4 MB` }, { status: 400 });
      }
    }

    const { client, bucket } = getS3();
    const uploaded: { id: number; filename: string; contentType: string }[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = ALLOWED_TYPES[file.type];

      // Insert DB row to get ID
      const insertResult = await pool.query(
        `INSERT INTO player_warning_attachments (warning_id, s3_key, filename, content_type, size_bytes, uploaded_by)
         VALUES ($1, '', $2, $3, $4, $5)
         RETURNING id`,
        [warningId, file.name, file.type, file.size, session.discord_id]
      );
      const attachmentId = insertResult.rows[0].id;
      const s3Key = `warning_attachments/${warningId}/${attachmentId}.${ext}`;

      try {
        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: file.type,
        }));
        await pool.query('UPDATE player_warning_attachments SET s3_key = $1 WHERE id = $2', [s3Key, attachmentId]);
        uploaded.push({ id: attachmentId, filename: file.name, contentType: file.type });
      } catch (s3Error) {
        // Clean up DB row if S3 upload fails
        await pool.query('DELETE FROM player_warning_attachments WHERE id = $1', [attachmentId]);
        throw s3Error;
      }
    }

    // The bot re-renders the entry's Discord message when updated_at moves
    await pool.query('UPDATE player_warnings SET updated_at = NOW() WHERE id = $1', [warningId]);

    return NextResponse.json({ success: true, attachments: uploaded });
  } catch (error) {
    console.error('Warning attachment upload error:', error);
    return NextResponse.json({ error: 'Failed to upload screenshots' }, { status: 500 });
  }
}
