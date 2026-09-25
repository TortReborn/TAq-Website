import { NextRequest, NextResponse } from 'next/server';
import { requireGuildSession } from '@/lib/exec-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireGuildSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceUrl = process.env.TORT_API_URL?.replace(/\/$/, '');
  const serviceToken = process.env.TORT_API_TOKEN;
  if (!serviceUrl || !serviceToken) {
    console.error('Tort-API is not configured');
    return NextResponse.json({ error: 'Profile card unavailable' }, { status: 503 });
  }

  const rawDays = Number.parseInt(request.nextUrl.searchParams.get('days') ?? '7', 10);
  const days = Number.isFinite(rawDays) ? Math.max(1, Math.min(3650, rawDays)) : 7;

  try {
    const response = await fetch(`${serviceUrl}/v1/cards/profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        'Content-Type': 'application/json',
        'X-Request-ID': request.headers.get('x-vercel-id') ?? crypto.randomUUID(),
      },
      body: JSON.stringify({ player: session.uuid, days }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      console.error('Tort-API profile render failed:', response.status);
      return NextResponse.json(
        { error: response.status === 404 ? 'Player not found' : 'Profile card unavailable' },
        { status: response.status === 404 ? 404 : 503 },
      );
    }

    return new NextResponse(await response.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `inline; filename="profile_${session.ign}.png"`,
      },
    });
  } catch (error) {
    console.error('Tort-API profile request failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Profile card unavailable' }, { status: 503 });
  }
}
