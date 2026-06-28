import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export const dynamic = 'force-dynamic';

type LootRarity = 'Mythic' | 'Fabled' | 'Legendary' | 'Rare' | 'Unique' | 'Common';
type LootGroupName = 'Shiny' | LootRarity;

type RawLootItem = {
  name?: string;
  rarity?: string;
  type?: string;
  shiny?: boolean;
  amount?: number;
  itemType?: string;
  shinyStat?: {
    statType?: {
      displayName?: string;
    };
  } | null;
};

type RawLootGroup = {
  group?: string;
  loot_items?: RawLootItem[];
};

type RawLootRow = {
  region?: string;
  timestamp?: string;
  region_items?: RawLootGroup[];
};

type RawLootPayload = {
  data?: RawLootRow[];
};

type LegacyLootRegion = {
  Shiny?: {
    Item?: string;
    Tracker?: string;
  };
};

type LegacyLootPayload = {
  Timestamp?: number;
  Loot?: Record<string, LegacyLootRegion>;
  Items?: Record<string, LegacyLootRegion>;
};

type ShinyInfo = {
  item: string;
  tracker: string;
  timestamp?: string;
};

type WynnLootReward = {
  name?: string;
  type?: string;
  tier?: string;
  amount?: number;
  shiny?: boolean;
};

type WynnLootPool = {
  name?: string;
  type?: string;
  rewards?: WynnLootReward[];
};

const WYNNCRAFT_LOOT_POOLS_URL = 'https://api.wynncraft.com/v3/map/loot-pools?level=106';

const WYNNCRAFT_CAMP_TO_REGION: Record<string, string> = {
  'Canyon of the Lost Excursion (South)': 'Canyon of the Lost',
  'The Corkus Traversal': 'Corkus',
  'Molten Heights Hike': 'Molten Heights',
  'Sky Islands Exploration': 'Sky Islands',
  'Silent Expanse Expedition': 'Silent Expanse',
  'The Fruma Foray (East)': 'Fruma Foray (East)',
  'The Fruma Foray (West)': 'Fruma Foray (West)',
};

const LEGACY_KEY_TO_REGION: Record<string, string> = {
  Canyon: 'Canyon of the Lost',
  Corkus: 'Corkus',
  Molten: 'Molten Heights',
  Sky: 'Sky Islands',
  SE: 'Silent Expanse',
  FrumaEast: 'Fruma Foray (East)',
  FrumaWest: 'Fruma Foray (West)',
};

const CORKIAN_AUGMENT_NAMES: Record<string, string> = {
  'CORKIAN INSULATOR': 'Corkian Insulator',
  'CORKIAN SIMULATOR': 'Corkian Simulator',
};

const GROUP_ORDER: LootGroupName[] = ['Shiny', 'Mythic', 'Fabled', 'Legendary', 'Rare', 'Unique', 'Common'];

function isRawLootPayload(data: unknown): data is RawLootPayload {
  return !!data && typeof data === 'object' && Array.isArray((data as RawLootPayload).data);
}

function isLegacyLootPayload(data: unknown): data is LegacyLootPayload {
  return !!data && typeof data === 'object' && (!!(data as LegacyLootPayload).Loot || !!(data as LegacyLootPayload).Items);
}

function normalizeTier(tier?: string): LootRarity {
  switch (tier) {
    case 'MYTHIC':
      return 'Mythic';
    case 'FABLED':
      return 'Fabled';
    case 'LEGENDARY':
      return 'Legendary';
    case 'RARE':
      return 'Rare';
    case 'UNIQUE':
      return 'Unique';
    default:
      return 'Common';
  }
}

function normalizeRewardName(reward: WynnLootReward): string | null {
  if (!reward.name) {
    return null;
  }

  return CORKIAN_AUGMENT_NAMES[reward.name.toUpperCase()] || reward.name;
}

function rewardGroup(reward: WynnLootReward): LootRarity {
  if (reward.type === 'WARD' || (reward.name && CORKIAN_AUGMENT_NAMES[reward.name.toUpperCase()])) {
    return 'Mythic';
  }

  return normalizeTier(reward.tier);
}

function rewardType(name: string, reward: WynnLootReward): string {
  if (reward.type === 'WARD') {
    return 'WARD';
  }

  if (name === 'Corkian Insulator') {
    return 'Insulator';
  }

  if (name === 'Corkian Simulator') {
    return 'Simulator';
  }

  return reward.type || 'ITEM';
}

function rewardItemType(name: string, reward: WynnLootReward): string {
  if (reward.type === 'WARD') {
    return 'WardItem';
  }

  if (name === 'Corkian Insulator') {
    return 'InsulatorItem';
  }

  if (name === 'Corkian Simulator') {
    return 'SimulatorItem';
  }

  if (reward.type === 'TOME') {
    return 'TomeItem';
  }

  if (reward.type === 'CURRENCY') {
    return 'CurrencyItem';
  }

  return 'GearItem';
}

function addToGroup(groups: Map<LootGroupName, RawLootItem[]>, group: LootGroupName, item: RawLootItem) {
  const items = groups.get(group) || [];
  if (!items.some((existing) => existing.name === item.name)) {
    items.push(item);
  }
  groups.set(group, items);
}

function isWardItem(item: RawLootItem): boolean {
  return item.type === 'WARD' || item.itemType === 'WardItem' || /Ward$/i.test(item.name || '');
}

function moveWardsToEnd(groups: Map<LootGroupName, RawLootItem[]>) {
  const mythics = groups.get('Mythic');
  if (!mythics) {
    return;
  }

  const nonWards = mythics.filter((item) => !isWardItem(item));
  const wards = mythics.filter(isWardItem);
  groups.set('Mythic', [...nonWards, ...wards]);
}

function extractShinyByRegion(cachedData: unknown): Record<string, ShinyInfo> {
  const shinyByRegion: Record<string, ShinyInfo> = {};

  if (isRawLootPayload(cachedData)) {
    for (const row of cachedData.data || []) {
      if (!row.region) {
        continue;
      }

      const shiny = row.region_items
        ?.find((group) => group.group === 'Shiny')
        ?.loot_items
        ?.find((item) => item.shiny) || row.region_items?.find((group) => group.group === 'Shiny')?.loot_items?.[0];

      if (shiny?.name) {
        shinyByRegion[row.region] = {
          item: shiny.name,
          tracker: shiny.shinyStat?.statType?.displayName || '',
          timestamp: row.timestamp,
        };
      }
    }
  } else if (isLegacyLootPayload(cachedData)) {
    const loot = cachedData.Loot || cachedData.Items || {};
    const timestamp = cachedData.Timestamp ? new Date(cachedData.Timestamp * 1000).toUTCString() : undefined;

    for (const [key, region] of Object.entries(loot)) {
      if (region.Shiny?.Item) {
        shinyByRegion[LEGACY_KEY_TO_REGION[key] || key] = {
          item: region.Shiny.Item,
          tracker: region.Shiny.Tracker || '',
          timestamp,
        };
      }
    }
  }

  return shinyByRegion;
}

async function fetchWynncraftLootPools(): Promise<WynnLootPool[]> {
  const response = await fetch(WYNNCRAFT_LOOT_POOLS_URL, {
    next: { revalidate: 120 },
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Wynncraft loot pools returned HTTP ${response.status}`);
  }

  return response.json() as Promise<WynnLootPool[]>;
}

function buildLootrunPayload(pools: WynnLootPool[], shinyByRegion: Record<string, ShinyInfo>): RawLootPayload {
  const fallbackTimestamp = new Date().toUTCString();

  const data = pools
    .filter((pool) => pool.type === 'CAMP' && pool.name && pool.rewards)
    .map((pool) => {
      const region = WYNNCRAFT_CAMP_TO_REGION[pool.name!] || pool.name!;
      const shiny = shinyByRegion[region];
      const groups = new Map<LootGroupName, RawLootItem[]>();

      if (shiny) {
        addToGroup(groups, 'Shiny', {
          name: shiny.item,
          rarity: 'Mythic',
          type: 'ITEM',
          shiny: true,
          amount: 1,
          itemType: 'GearItem',
          shinyStat: shiny.tracker ? { statType: { displayName: shiny.tracker } } : null,
        });
      }

      for (const reward of pool.rewards || []) {
        const name = normalizeRewardName(reward);
        if (!name) {
          continue;
        }

        const group = rewardGroup(reward);
        addToGroup(groups, group, {
          name,
          type: rewardType(name, reward),
          shiny: !!reward.shiny,
          amount: reward.amount || 1,
          rarity: group,
          itemType: rewardItemType(name, reward),
          shinyStat: null,
        });
      }

      moveWardsToEnd(groups);

      const regionItems = GROUP_ORDER
        .map((group) => ({ group, loot_items: groups.get(group) || [] }))
        .filter((group) => group.loot_items.length > 0);

      return {
        region,
        timestamp: shiny?.timestamp || fallbackTimestamp,
        region_items: regionItems,
      };
    });

  return { data };
}

function createJsonResponse(data: unknown, rateLimitCheck: { remainingRequests: number; resetTime: number }) {
  const jsonResponse = NextResponse.json(data);
  return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
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

    // Get nori lootpool cache for shiny data only; Wynncraft is the reward source.
    const cachedNoriData = await simpleDatabaseCache.getLootpoolData(clientIP);
    const shinyByRegion = extractShinyByRegion(cachedNoriData);

    try {
      // Build current lootrun rewards from Wynncraft, preserving nori's shiny item/tracker.
      const wynncraftPools = await fetchWynncraftLootPools();
      return createJsonResponse(buildLootrunPayload(wynncraftPools, shinyByRegion), rateLimitCheck);
    } catch (wynncraftError) {
      console.warn('Failed to fetch Wynncraft loot pools, falling back to cached nori lootpool data:', wynncraftError);

      if (cachedNoriData) {
        return createJsonResponse(cachedNoriData, rateLimitCheck);
      }

      // If both sources fail, return an explicit temporary unavailable response.
      const errorResponse = NextResponse.json(
        { error: 'Lootpool data not available. Wynncraft API and nori cache are unavailable.' },
        {
          status: 503,
          headers: {
            'X-Cache': 'MISS',
            'X-Cache-Source': 'Wynncraft-API',
            'Retry-After': '30',
          },
        }
      );
      return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
    }
  } catch (error) {
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch lootpool data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}
