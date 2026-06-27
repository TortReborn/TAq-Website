import useSWR from 'swr';
import { fetcher } from './fetcher';

type Rarity = 'Mythic' | 'Fabled' | 'Legendary' | 'Rare' | 'Unique';

interface LootRegion {
  Mythic?: string[];
  Fabled?: string[];
  Legendary?: string[];
  Rare?: string[];
  Unique?: string[];
  Shiny?: {
    Item: string;
    Tracker: string;
  };
}

interface LootData {
  Timestamp: number;
  Icon?: { [itemName: string]: string };
  Loot?: { [region: string]: LootRegion };
  Aspects?: { [raid: string]: LootRegion };
  Items?: { [region: string]: LootRegion };
}

interface RawLootItem {
  name?: string;
  rarity?: string;
  shiny?: boolean;
  shinyStat?: {
    statType?: {
      displayName?: string;
      key?: string;
    };
  } | null;
}

interface RawLootGroup {
  group?: string;
  loot_items?: RawLootItem[];
}

interface RawLootRow {
  region?: string;
  timestamp?: string;
  region_items?: RawLootGroup[];
  group_items?: RawLootGroup[];
}

interface RawLootPayload {
  data?: RawLootRow[];
}

const RARITIES = new Set<Rarity>(['Mythic', 'Fabled', 'Legendary', 'Rare', 'Unique']);

const LOOTRUN_REGION_KEYS: Record<string, string> = {
  'Silent Expanse': 'SE',
  'Sky Islands': 'Sky',
  'Canyon of the Lost': 'Canyon',
  Corkus: 'Corkus',
  'Molten Heights': 'Molten',
  'Fruma Foray (East)': 'FrumaEast',
  'Fruma Foray (West)': 'FrumaWest',
};

const RAID_KEYS: Record<string, string> = {
  'Nest of the Grootslangs': 'NOG',
  'The Canyon Colossus': 'TCC',
  'The Nameless Anomaly': 'TNA',
  "Orphion's Nexus of Light": 'NOL',
  'The Wartorn Palace': 'TWP',
  NOTG: 'NOG',
  NOG: 'NOG',
  TCC: 'TCC',
  TNA: 'TNA',
  NOL: 'NOL',
  TWP: 'TWP',
};

function isRawLootPayload(data: unknown): data is RawLootPayload {
  return !!data && typeof data === 'object' && Array.isArray((data as RawLootPayload).data);
}

function latestTimestamp(rows: RawLootRow[]): number {
  const timestamps = rows
    .map((row) => row.timestamp ? Date.parse(row.timestamp) : NaN)
    .filter(Number.isFinite);

  if (timestamps.length === 0) {
    return Math.floor(Date.now() / 1000);
  }

  return Math.floor(Math.max(...timestamps) / 1000);
}

function addItem(region: LootRegion, rarity: string | undefined, itemName: string | undefined) {
  if (!itemName || !RARITIES.has(rarity as Rarity)) {
    return;
  }

  const key = rarity as Rarity;
  region[key] = region[key] || [];
  if (!region[key]!.includes(itemName)) {
    region[key]!.push(itemName);
  }
}

function normalizeLegacyRaidKeys(data: LootData): LootData {
  const source = data.Aspects || data.Loot;
  if (!source) {
    return data;
  }

  const normalized: Record<string, LootRegion> = {};
  for (const [key, value] of Object.entries(source)) {
    normalized[RAID_KEYS[key] || key] = value;
  }

  return {
    ...data,
    ...(data.Aspects ? { Aspects: normalized } : { Loot: normalized }),
  };
}

function normalizeLootruns(data: unknown): LootData | null {
  if (!isRawLootPayload(data)) {
    return data ? data as LootData : null;
  }

  const Loot: Record<string, LootRegion> = {};

  for (const row of data.data || []) {
    const regionKey = row.region ? LOOTRUN_REGION_KEYS[row.region] || row.region : 'Unknown';
    const region: LootRegion = {};

    for (const group of row.region_items || []) {
      if (group.group === 'Shiny') {
        const shiny = group.loot_items?.find((item) => item.shiny) || group.loot_items?.[0];
        if (shiny?.name) {
          region.Shiny = {
            Item: shiny.name,
            Tracker: shiny.shinyStat?.statType?.displayName || '',
          };
        }
        continue;
      }

      for (const item of group.loot_items || []) {
        addItem(region, group.group || item.rarity, item.name);
      }
    }

    Loot[regionKey] = region;
  }

  return {
    Timestamp: latestTimestamp(data.data || []),
    Loot,
  };
}

function normalizeAspects(data: unknown): LootData | null {
  if (!isRawLootPayload(data)) {
    return data ? normalizeLegacyRaidKeys(data as LootData) : null;
  }

  const Aspects: Record<string, LootRegion> = {};

  for (const row of data.data || []) {
    const raidKey = row.region ? RAID_KEYS[row.region] || row.region : 'Unknown';
    const raid: LootRegion = {};

    for (const group of row.group_items || []) {
      if (group.group !== 'Aspects') {
        continue;
      }

      for (const item of group.loot_items || []) {
        addItem(raid, item.rarity, item.name);
      }
    }

    Aspects[raidKey] = raid;
  }

  return {
    Timestamp: latestTimestamp(data.data || []),
    Aspects,
  };
}

export function useLootruns() {
  const { data, error, isLoading } = useSWR('/api/lootpools/lootruns', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120000,
  });

  return {
    data: normalizeLootruns(data),
    loading: isLoading,
    error: error?.message ?? null,
  };
}

export function useAspects() {
  const { data, error, isLoading } = useSWR('/api/lootpools/aspects', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120000,
  });

  return {
    data: normalizeAspects(data),
    loading: isLoading,
    error: error?.message ?? null,
  };
}
