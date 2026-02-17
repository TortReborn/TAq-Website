import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = getSession(request);

  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      discord_id: session.discord_id,
      discord_username: session.discord_username,
      discord_avatar: session.discord_avatar,
      application_type: session.application_type,
    },
  });
}
