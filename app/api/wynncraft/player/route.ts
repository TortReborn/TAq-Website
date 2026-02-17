import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const IGN_REGEX = /^[a-zA-Z0-9_]{1,16}$/;

export async function GET(request: NextRequest) {
  const ign = request.nextUrl.searchParams.get('ign')?.trim();

  if (!ign || !IGN_REGEX.test(ign)) {
    return NextResponse.json(
      { valid: false, error: 'Invalid username format.' },
      { status: 400 }
    );
  }

  try {
    // Look up via Mojang API (public, no auth needed)
    const mojangRes = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(ign)}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (mojangRes.status === 404 || mojangRes.status === 204) {
      return NextResponse.json({ valid: false, error: 'Player not found.' });
    }

    if (!mojangRes.ok) {
      return NextResponse.json(
        { valid: false, error: 'Could not verify player. Try again later.' },
        { status: 502 }
      );
    }

    const mojangData = await mojangRes.json();
    const username: string = mojangData.name;
    const rawUuid: string = mojangData.id;

    // Format UUID with dashes
    const uuid = [
      rawUuid.slice(0, 8),
      rawUuid.slice(8, 12),
      rawUuid.slice(12, 16),
      rawUuid.slice(16, 20),
      rawUuid.slice(20),
    ].join('-');

    const statsUrl = `https://wynncraft.com/stats/player/${encodeURIComponent(username)}`;

    return NextResponse.json({
      valid: true,
      username,
      uuid,
      statsUrl,
    });
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return NextResponse.json(
        { valid: false, error: 'Lookup timed out. Try again.' },
        { status: 504 }
      );
    }
    console.error('Wynncraft player lookup error:', error);
    return NextResponse.json(
      { valid: false, error: 'Lookup failed. Try again later.' },
      { status: 500 }
    );
  }
}
