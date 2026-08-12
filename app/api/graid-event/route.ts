import { NextRequest, NextResponse } from 'next/server';
import { fetchActiveEvent, fetchMostRecentEvent } from '@/lib/graid';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';
import { requireGuildSession } from '@/lib/exec-auth';
import type { Row } from '@/lib/graid';

function highestPayout(rows: Row[], isLegacy: boolean): number {
  if (rows.length === 0) return 0;
  return Math.max(...rows.map(r => (isLegacy ? r.payout : r.payoutLe)));
}

function totalPayout(rows: Row[], isLegacy: boolean): number {
  return rows
    .filter(r => r.meetsMin)
    .reduce((sum, r) => sum + (isLegacy ? r.payout : r.payoutLe), 0);
}

export async function GET(request: NextRequest) {
  // Check rate limit
  const rateLimitCheck = checkRateLimit(request, 'graid-event');

  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }

  // Increment rate limit counter
  incrementRateLimit(request, 'graid-event');

  try {
    const session = await requireGuildSession(request);
    const authorized = !!session;

    const { event, rows } = await fetchActiveEvent();
    let fallback = null;
    if (!event) {
      fallback = await fetchMostRecentEvent();
    }

    const showEvent = event || fallback?.event;
    const showRows = event ? rows : fallback?.rows || [];
    const isFallback = !event && !!fallback?.event;
    const isLegacy = showEvent?.rewardMode === 'legacy';

    const jsonResponse = NextResponse.json({
      event: showEvent,
      rows: authorized ? showRows : [],
      isFallback,
      authorized,
      highestPayout: authorized ? undefined : highestPayout(showRows, isLegacy),
      totalPayout: authorized ? undefined : totalPayout(showRows, isLegacy),
    });

    return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  } catch (error) {
    console.error('Error fetching graid event data:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch event data' },
      { status: 500 }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}
