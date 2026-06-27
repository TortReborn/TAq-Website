import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export const dynamic = 'force-dynamic';

type RawLootItem = {
  name?: string;
  rarity?: string;
  icon?: { value?: string; format?: string };
  type?: string;
  shiny?: boolean;
  amount?: number;
  itemType?: string;
  shinyStat?: unknown;
};

type RawLootGroup = {
  group?: string;
  loot_items?: RawLootItem[];
};

type RawLootRow = {
  region?: string;
  region_items?: RawLootGroup[];
};

type RawLootPayload = {
  data?: RawLootRow[];
};

type LegacyLootRegion = {
  Mythic?: string[];
};

type LegacyLootPayload = {
  Loot?: Record<string, LegacyLootRegion>;
  Items?: Record<string, LegacyLootRegion>;
};

type WynnLootReward = {
  name?: string;
  type?: string;
};

type WynnLootPool = {
  name?: string;
  type?: string;
  rewards?: WynnLootReward[];
};

const WYNNCRAFT_LOOT_POOLS_URL = 'https://api.wynncraft.com/v3/map/loot-pools?level=106';

const WYNNCRAFT_CAMP_TO_NORI_REGION: Record<string, string> = {
  'Canyon of the Lost Excursion (South)': 'Canyon of the Lost',
  'The Corkus Traversal': 'Corkus',
  'Molten Heights Hike': 'Molten Heights',
  'Sky Islands Exploration': 'Sky Islands',
  'Silent Expanse Expedition': 'Silent Expanse',
  'The Fruma Foray (East)': 'Fruma Foray (East)',
  'The Fruma Foray (West)': 'Fruma Foray (West)',
};

const LEGACY_REGION_KEYS: Record<string, string> = {
  'Canyon of the Lost': 'Canyon',
  Corkus: 'Corkus',
  'Molten Heights': 'Molten',
  'Sky Islands': 'Sky',
  'Silent Expanse': 'SE',
  'Fruma Foray (East)': 'FrumaEast',
  'Fruma Foray (West)': 'FrumaWest',
};

const CORKIAN_AUGMENT_NAMES: Record<string, string> = {
  'CORKIAN INSULATOR': 'Corkian Insulator',
  'CORKIAN SIMULATOR': 'Corkian Simulator',
};

function isRawLootPayload(data: unknown): data is RawLootPayload {
  return !!data && typeof data === 'object' && Array.isArray((data as RawLootPayload).data);
}

function isLegacyLootPayload(data: unknown): data is LegacyLootPayload {
  return !!data && typeof data === 'object' && (!!(data as LegacyLootPayload).Loot || !!(data as LegacyLootPayload).Items);
}

function appendUnique(target: string[], items: string[]) {
  for (const item of items) {
    if (!target.includes(item)) {
      target.push(item);
    }
  }
}

async function fetchWynncraftAugmentsByRegion(): Promise<Record<string, string[]>> {
  const response = await fetch(WYNNCRAFT_LOOT_POOLS_URL, {
    next: { revalidate: 120 },
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Wynncraft loot pools returned HTTP ${response.status}`);
  }

  const pools = await response.json() as WynnLootPool[];
  const augmentsByRegion: Record<string, string[]> = {};

  for (const pool of pools) {
    if (pool.type !== 'CAMP' || !pool.name || !pool.rewards) {
      continue;
    }

    const region = WYNNCRAFT_CAMP_TO_NORI_REGION[pool.name];
    if (!region) {
      continue;
    }

    const augments = pool.rewards
      .map((reward) => reward.name ? CORKIAN_AUGMENT_NAMES[reward.name.toUpperCase()] : undefined)
      .filter((name): name is string => !!name);

    if (augments.length > 0) {
      augmentsByRegion[region] = augments;
    }
  }

  return augmentsByRegion;
}

function mergeAugmentsIntoRawPayload(data: RawLootPayload, augmentsByRegion: Record<string, string[]>) {
  for (const row of data.data || []) {
    if (!row.region) {
      continue;
    }

    const augments = augmentsByRegion[row.region];
    if (!augments?.length) {
      continue;
    }

    row.region_items = row.region_items || [];
    let mythicGroup = row.region_items.find((group) => group.group === 'Mythic');
    if (!mythicGroup) {
      mythicGroup = { group: 'Mythic', loot_items: [] };
      row.region_items.push(mythicGroup);
    }

    mythicGroup.loot_items = mythicGroup.loot_items || [];
    const existingNames = new Set(mythicGroup.loot_items.map((item) => item.name));

    for (const augment of augments) {
      if (existingNames.has(augment)) {
        continue;
      }

      mythicGroup.loot_items.push({
        name: augment,
        type: augment.replace(/\s+/g, ''),
        shiny: false,
        amount: 1,
        rarity: 'Mythic',
        itemType: `${augment.replace(/\s+/g, '')}Item`,
        shinyStat: null,
      });
      existingNames.add(augment);
    }
  }
}

function mergeAugmentsIntoLegacyPayload(data: LegacyLootPayload, augmentsByRegion: Record<string, string[]>) {
  const loot = data.Loot || data.Items;
  if (!loot) {
    return;
  }

  for (const [region, augments] of Object.entries(augmentsByRegion)) {
    const key = LEGACY_REGION_KEYS[region] || region;
    loot[key] = loot[key] || {};
    loot[key].Mythic = loot[key].Mythic || [];
    appendUnique(loot[key].Mythic, augments);
  }
}

async function withWynncraftCorkianAugments<T>(cachedData: T): Promise<T> {
  try {
    const augmentsByRegion = await fetchWynncraftAugmentsByRegion();
    const merged = structuredClone(cachedData);

    if (isRawLootPayload(merged)) {
      mergeAugmentsIntoRawPayload(merged, augmentsByRegion);
    } else if (isLegacyLootPayload(merged)) {
      mergeAugmentsIntoLegacyPayload(merged, augmentsByRegion);
    }

    return merged;
  } catch (error) {
    console.warn('Failed to merge Wynncraft Corkian augments:', error);
    return cachedData;
  }
}

export async function GET(request: NextRequest) {
  // Check rate limit
  const rateLimitCheck = checkRateLimit(request, 'lootruns');
  
  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }

  // Increment rate limit counter
  incrementRateLimit(request, 'lootruns');

  try {
    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';

    // Get lootpool data from database cache only (managed by external bot)
    const cachedData = await simpleDatabaseCache.getLootpoolData(clientIP);
    
    if (cachedData) {
      const dataWithAugments = await withWynncraftCorkianAugments(cachedData);
      const jsonResponse = NextResponse.json(dataWithAugments);
      return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
    }

    // If no cached data, return error (data managed by external bot)
    const errorResponse = NextResponse.json(
      { error: 'Lootpool data not available. External bot may be updating data.' },
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
      { error: 'Failed to fetch lootpool data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}
