import { NextRequest, NextResponse } from 'next/server';
import { verifyBotToken, setSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.json(
      { valid: false, error: 'missing_token' },
      { status: 400 }
    );
  }

  const payload = verifyBotToken(token);

  if (!payload) {
    return NextResponse.json(
      { valid: false, error: 'invalid_or_expired' },
      { status: 401 }
    );
  }

  const response = NextResponse.json({
    valid: true,
    user: {
      discord_id: payload.discord_id,
      discord_username: payload.discord_username,
      discord_avatar: payload.discord_avatar,
      application_type: payload.type,
    },
  });

  setSessionCookie(
    response,
    {
      discord_id: payload.discord_id,
      discord_username: payload.discord_username,
      discord_avatar: payload.discord_avatar,
    },
    payload.type
  );

  return response;
}
