import { NextResponse } from 'next/server';

// Seasons change only every ~6 weeks, so cache aggressively.
export const revalidate = 3600; // 1 hour

const SEASONS_URL = 'https://api.wynncraft.com/v3/guild/seasons';

/**
 * Proxy + normalize the Wynncraft guild seasons endpoint.
 * Returns { seasons: RawSeason[] } sorted chronologically by start date.
 */
export async function GET() {
  try {
    const res = await fetch(SEASONS_URL, {
      headers: { 'User-Agent': 'tort-reborn-web/1.0' },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Wynncraft API returned ${res.status}`, seasons: [] },
        { status: 502 }
      );
    }

    const data = (await res.json()) as Record<string, {
      startDate?: string;
      endDate?: string;
      territoryHoldingSrPerHour?: number;
      srPerWar?: number;
    }>;

    const seasons = Object.entries(data)
      .map(([num, v]) => ({
        season: parseInt(num, 10),
        startDate: v.startDate,
        endDate: v.endDate,
        territoryHoldingSrPerHour: v.territoryHoldingSrPerHour,
        srPerWar: v.srPerWar,
      }))
      .filter((s) => Number.isFinite(s.season) && s.startDate && s.endDate)
      .sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime());

    return NextResponse.json(
      { seasons },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch seasons', seasons: [] },
      { status: 500 }
    );
  }
}
