import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

function isTestMode(): boolean {
  const v = process.env.TEST_MODE;
  if (!v) return false;
  const s = v.toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function getBotToken(): string | undefined {
  return isTestMode() ? process.env.TEST_DISCORD_BOT_TOKEN : process.env.DISCORD_BOT_TOKEN;
}

async function fetchDiscordAvatar(discordId: string): Promise<string> {
  const defaultAvatar = `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordId) >> 22n) % 6}.png`;
  const botToken = getBotToken();
  if (!botToken) return defaultAvatar;

  try {
    const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!res.ok) return defaultAvatar;
    const user = await res.json();
    if (user.avatar) {
      return `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.png?size=128`;
    }
    return defaultAvatar;
  } catch {
    return defaultAvatar;
  }
}

export async function GET(request: NextRequest) {
  const session = requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status') || 'all';

  try {
    const pool = getPool();
    const client = await pool.connect();

    try {
      // Build query with optional status filter
      let whereClause = '';
      const params: string[] = [];

      if (statusFilter !== 'all') {
        whereClause = 'WHERE a.status = $1';
        params.push(statusFilter);
      }

      const result = await client.query(
        `SELECT
          a.id,
          a.application_type,
          a.discord_id,
          a.discord_username,
          a.discord_avatar,
          a.status,
          a.answers,
          a.submitted_at,
          a.reviewed_at,
          a.reviewed_by,
          a.guild_leave_pending,
          a.poll_status,
          COALESCE(
            (SELECT json_agg(json_build_object(
              'voter_discord_id', v.voter_discord_id,
              'voter_username', COALESCE(dl.ign, v.voter_username),
              'vote', v.vote,
              'source', v.source,
              'voted_at', v.voted_at
            ) ORDER BY v.voted_at ASC)
            FROM application_votes v
            LEFT JOIN discord_links dl ON dl.discord_id = v.voter_discord_id::bigint
            WHERE v.application_id = a.id),
            '[]'::json
          ) as votes
        FROM applications a
        ${whereClause}
        ORDER BY
          CASE a.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 WHEN 'denied' THEN 2 END,
          a.submitted_at DESC
        LIMIT 50`,
        params
      );

      const applications = await Promise.all(result.rows.map(async row => {
        const votes = row.votes || [];
        const voteSummary = {
          accept: votes.filter((v: any) => v.vote === 'accept').length,
          deny: votes.filter((v: any) => v.vote === 'deny').length,
          abstain: votes.filter((v: any) => v.vote === 'abstain').length,
        };

        // Check if current user has voted
        const userVote = votes.find((v: any) => v.voter_discord_id === session.discord_id);

        // Build Discord avatar URL
        let discordAvatar: string;
        const rawAvatar = row.discord_avatar;
        if (rawAvatar && rawAvatar.startsWith('http')) {
          discordAvatar = rawAvatar;
        } else if (rawAvatar) {
          discordAvatar = `https://cdn.discordapp.com/avatars/${row.discord_id}/${rawAvatar}.png?size=128`;
        } else {
          // No avatar stored — fetch from Discord API
          discordAvatar = await fetchDiscordAvatar(row.discord_id);
        }

        return {
          id: row.id,
          type: row.application_type,
          discordId: row.discord_id,
          discordUsername: row.discord_username,
          discordAvatar,
          status: row.status,
          answers: row.answers,
          submittedAt: row.submitted_at,
          reviewedAt: row.reviewed_at,
          reviewedBy: row.reviewed_by,
          guildLeavePending: row.guild_leave_pending,
          pollStatus: row.poll_status,
          votes,
          voteSummary,
          userVote: userVote?.vote || null,
        };
      }));

      return NextResponse.json({ applications });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Exec applications error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch applications' },
      { status: 500 }
    );
  }
}
