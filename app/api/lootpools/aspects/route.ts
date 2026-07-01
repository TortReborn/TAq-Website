import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export const dynamic = 'force-dynamic';

const RARITY_KEYS = ['Mythic', 'Fabled', 'Legendary', 'Rare', 'Unique'] as const;
const WARD_PATTERN = /Ward$/i;

type AspectGroup = {
  group?: string;
  loot_items?: Array<{
    name?: string;
    type?: string;
    itemType?: string;
  }>;
};

type AspectRow = {
  group_items?: AspectGroup[];
};

type LegacyAspectRegion = Partial<Record<(typeof RARITY_KEYS)[number], string[]>>;

type AspectPayload = {
  data?: AspectRow[];
  Aspects?: Record<string, LegacyAspectRegion>;
  Loot?: Record<string, LegacyAspectRegion>;
};

function isWardName(name: string | undefined): boolean {
  return !!name && WARD_PATTERN.test(name.trim());
}

function isWardItem(item: { name?: string; type?: string; itemType?: string }): boolean {
  return item.type === 'WARD' || item.itemType === 'WardItem' || isWardName(item.name);
}

function removeWardsFromRegion(region: LegacyAspectRegion): LegacyAspectRegion {
  const filtered: LegacyAspectRegion = { ...region };

  for (const rarity of RARITY_KEYS) {
    if (filtered[rarity]) {
      filtered[rarity] = filtered[rarity]!.filter((item) => !isWardName(item));
    }
  }

  return filtered;
}

function sanitizeAspectPayload(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const payload = data as AspectPayload;

  if (Array.isArray(payload.data)) {
    return {
      ...payload,
      data: payload.data.map((row) => ({
        ...row,
        group_items: row.group_items?.map((group) => (
          group.group === 'Aspects'
            ? {
                ...group,
                loot_items: group.loot_items?.filter((item) => !isWardItem(item)),
              }
            : group
        )),
      })),
    };
  }

  return {
    ...payload,
    ...(payload.Aspects ? {
      Aspects: Object.fromEntries(
        Object.entries(payload.Aspects).map(([raid, region]) => [raid, removeWardsFromRegion(region)])
      ),
    } : {}),
    ...(payload.Loot ? {
      Loot: Object.fromEntries(
        Object.entries(payload.Loot).map(([raid, region]) => [raid, removeWardsFromRegion(region)])
      ),
    } : {}),
  };
}

export async function GET(request: NextRequest) {
  // Check rate limit
  const rateLimitCheck = checkRateLimit(request, 'aspects');
  
  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }

  // Increment rate limit counter
  incrementRateLimit(request, 'aspects');

  try {
    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';

    // Get aspect data from database cache only (managed by external bot)
    const cachedData = await simpleDatabaseCache.getAspectData(clientIP);
    
    if (cachedData) {
      const jsonResponse = NextResponse.json(sanitizeAspectPayload(cachedData));
      return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
    }

    // If no cached data, return error (data managed by external bot)
    const errorResponse = NextResponse.json(
      { error: 'Aspect data not available. External bot may be updating data.' },
      { 
        status: 503,
        headers: {
          'X-Cache': 'MISS',
          'X-Cache-Source': 'PostgreSQL-Bot-Managed',
          'Retry-After': '30'
        }
      }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  } catch (error) {
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch aspect data from cache', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}
