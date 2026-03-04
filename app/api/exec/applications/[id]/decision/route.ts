import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Allow up to 4MB for invite image uploads
export const maxDuration = 30;

const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB in base64 chars (roughly 3MB binary)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const applicationId = parseInt(id, 10);
  if (isNaN(applicationId)) {
    return NextResponse.json({ error: 'Invalid application ID' }, { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { decision, inviteImage } = body;
  if (!decision || !['accepted', 'denied'].includes(decision)) {
    return NextResponse.json(
      { error: 'Invalid decision. Must be: accepted or denied' },
      { status: 400 }
    );
  }

  // Validate invite image if provided
  if (inviteImage) {
    if (typeof inviteImage !== 'string') {
      return NextResponse.json({ error: 'Invalid invite image format' }, { status: 400 });
    }
    if (inviteImage.length > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: 'Invite image too large (max ~3MB)' }, { status: 400 });
    }
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE applications
       SET status = $1, reviewed_at = NOW(), reviewed_by = $2,
           invite_image = $3, bot_processed = FALSE
       WHERE id = $4 AND status = 'pending'
       RETURNING id, status, reviewed_at, reviewed_by`,
      [decision, session.ign, inviteImage || null, applicationId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'Application not found or already decided' },
        { status: 409 }
      );
    }

    const row = result.rows[0];
    return NextResponse.json({
      success: true,
      status: row.status,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by,
    });
  } catch (error) {
    console.error('Decision error:', error);
    return NextResponse.json(
      { error: 'Failed to submit decision' },
      { status: 500 }
    );
  }
}
