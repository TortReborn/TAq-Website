import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

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

  const { vote } = body;
  if (!vote || !['accept', 'deny', 'abstain'].includes(vote)) {
    return NextResponse.json(
      { error: 'Invalid vote. Must be: accept, deny, or abstain' },
      { status: 400 }
    );
  }

  try {
    const pool = getPool();
    const client = await pool.connect();

    try {
      // Verify the application exists and is pending
      const appResult = await client.query(
        'SELECT id, status FROM applications WHERE id = $1',
        [applicationId]
      );

      if (appResult.rows.length === 0) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
      }

      if (appResult.rows[0].status !== 'pending') {
        return NextResponse.json(
          { error: 'Can only vote on pending applications' },
          { status: 400 }
        );
      }

      // Upsert vote (voter_username stores the Minecraft IGN)
      await client.query(
        `INSERT INTO application_votes (application_id, voter_discord_id, voter_username, vote, source, voted_at)
         VALUES ($1, $2, $3, $4, 'website', NOW())
         ON CONFLICT (application_id, voter_discord_id)
         DO UPDATE SET vote = $4, voted_at = NOW(), source = 'website'`,
        [applicationId, session.discord_id, session.ign, vote]
      );

      // Return updated vote counts
      const votesResult = await client.query(
        `SELECT
          COUNT(*) FILTER (WHERE vote = 'accept') as accept,
          COUNT(*) FILTER (WHERE vote = 'deny') as deny,
          COUNT(*) FILTER (WHERE vote = 'abstain') as abstain
        FROM application_votes
        WHERE application_id = $1`,
        [applicationId]
      );

      const summary = {
        accept: parseInt(votesResult.rows[0].accept, 10),
        deny: parseInt(votesResult.rows[0].deny, 10),
        abstain: parseInt(votesResult.rows[0].abstain, 10),
      };

      return NextResponse.json({
        success: true,
        vote,
        voteSummary: summary,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Vote submission error:', error);
    return NextResponse.json(
      { error: 'Failed to submit vote' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

  try {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query(
        'DELETE FROM application_votes WHERE application_id = $1 AND voter_discord_id = $2',
        [applicationId, session.discord_id]
      );

      // Return updated vote counts
      const votesResult = await client.query(
        `SELECT
          COUNT(*) FILTER (WHERE vote = 'accept') as accept,
          COUNT(*) FILTER (WHERE vote = 'deny') as deny,
          COUNT(*) FILTER (WHERE vote = 'abstain') as abstain
        FROM application_votes
        WHERE application_id = $1`,
        [applicationId]
      );

      const summary = {
        accept: parseInt(votesResult.rows[0].accept, 10),
        deny: parseInt(votesResult.rows[0].deny, 10),
        abstain: parseInt(votesResult.rows[0].abstain, 10),
      };

      return NextResponse.json({
        success: true,
        voteSummary: summary,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Vote deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to remove vote' },
      { status: 500 }
    );
  }
}
