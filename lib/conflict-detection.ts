/**
 * Conflict detection engine for the Wynncraft guild map.
 * Analyzes territory exchange history to find periods of intense conflict.
 */

import { ExchangeStore } from "./history-data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConflictEvent {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  totalExchanges: number;
  peakHourly: number;
  primaryRegion: string;
  regionBreakdown: Record<string, number>;
  /** Primary 2-side view (first two factions) for backward compatibility. */
  sides: [ConflictSide, ConflictSide];
  /** All detected factions (2-4). More accurate than `sides` for multi-way conflicts. */
  factions: ConflictSide[];
  territoriesInvolved: number;
  /** Confidence score 0-1 indicating how likely this is a real conflict vs noise. */
  confidence: number;
  /** True if conflict spans 3+ regions with significant activity in each. */
  isMultiFront: boolean;
  /** Sum of resource-weighted exchange values. Higher = more strategically important. */
  weightedExchanges: number;
}

export interface ConflictSide {
  guilds: { name: string; prefix: string; taken: number; lost: number }[];
  /** Total territories taken by ALL guilds in this faction (not just top 10 displayed). */
  totalTaken: number;
  /** Total territories lost by ALL guilds in this faction (not just top 10 displayed). */
  totalLost: number;
}

export interface War {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  conflicts: ConflictEvent[];
  totalExchanges: number;
}

// ---------------------------------------------------------------------------
// Region mapping
// ---------------------------------------------------------------------------

const REGIONS = [
  "Wynn", "Gavel", "Ocean", "Corkus", "Canyon", "Molten Heights", "Sky Islands", "Fruma",
] as const;

export type Region = (typeof REGIONS)[number] | "Other";

export const ALL_REGIONS: readonly string[] = [...REGIONS, "Other"];

// Cached lookup: territory name → region
let regionCache: Map<string, string> | null = null;

/** Classify a territory into a map region by name patterns, with coordinate fallback. */
export function getRegion(name: string): string {
  if (regionCache?.has(name)) return regionCache.get(name)!;

  let region = classifyTerritory(name);
  if (region === "Other") {
    region = classifyByCoordinates(name);
  }
  if (!regionCache) regionCache = new Map();
  regionCache.set(name, region);
  return region;
}

function classifyTerritory(rawName: string): string {
  // Normalize Unicode apostrophes to ASCII for consistent matching
  const name = rawName.replace(/[\u2018\u2019\u2032]/g, "'");

  // --- Fruma ---
  if (
    name === "Agricultural Sector" || name === "Industrial Sector" ||
    name === "Residence Sector" || name === "Water Processing Sector" ||
    name === "Citadel's Shadow" || name === "Contested District" ||
    name === "Gates to Aelumia" || name === "Royal Barracks" ||
    name === "Royal Dam" || name === "University Campus" ||
    name === "The Lumbermill" || name === "Espren" ||
    name === "Festival Grounds" || name === "Highlands Gate" ||
    name === "Lake Gitephe" || name === "Lake Rieke" ||
    name === "Hyloch" || name === "Xima Valley" ||
    name === "Wellspring of Eternity" || name === "The Frog Bog" ||
    name === "Forts in Fall" || name === "Alder Understory" ||
    name === "Deforested Ecotone" || name === "Verdant Grove" ||
    name === "Aldwell" || name === "Timasca" ||
    name === "Fort Hegea" || name === "Fort Tericen" ||
    name === "Fort Torann" || name === "Feuding Houses" ||
    name === "Frosty Outpost"
  ) return "Fruma";

  // --- Corkus ---
  if (
    name.startsWith("Corkus") ||
    name === "Fallen Factory" || name === "Fallen Village" ||
    name === "Avos Temple" || name === "Avos Territory" ||
    name === "Relos" || name === "Retrofitted Manufactory" ||
    name === "Picnic Pond" || name === "Lighthouse Lookout" ||
    name === "Corkus Sea Cove"
  ) return "Corkus";

  // --- Ocean ---
  if (
    name === "Selchar" || name === "Pirate Town" || name === "Maro Peaks" ||
    name === "Zhight Island" || name === "Mage Island" || name === "Tree Island" ||
    name === "Half Moon Island" || name === "Skien's Island" || name === "Regular Island" ||
    name === "Rooster Island" || name === "Icy Island" || name === "Legendary Island" ||
    name === "Snail Island" || name === "Temple Island" || name === "Wybel Island" ||
    name === "Swamp Island" || name === "Central Islands" || name === "Lost Atoll" ||
    name === "Volcanic Isles" || name === "Dreary Docks" || name === "Jofash Docks" ||
    name === "Jofash Tunnel" ||
    name.startsWith("Durum") ||
    name === "Cathedral Harbour" || name === "Bloody Beach" || name === "Rocky Shore"
  ) return "Ocean";

  // --- Sky Islands ---
  if (
    name.startsWith("Ahmsord") ||
    name.startsWith("Sky ") ||
    name === "Sky Island Ascent" ||
    name === "Bantisu Air Temple" || name === "Bantisu Approach" ||
    name === "Heavenly Ingress" || name === "Nexus of Light" ||
    name === "Path to Ahmsord" || name === "Angel Refuge" ||
    name === "Sunrise Plateau" || name === "Sunset Plateau" ||
    name === "Cosmic Fissures" || name === "Celestial Impact"
  ) return "Sky Islands";

  // --- Molten Heights ---
  if (
    name === "Thanos" || name === "Thanos Exit" || name === "Thanos Underpass" ||
    name === "Upper Thanos" || name === "Path to Thanos" ||
    name === "Rodoroc" || name === "Rymek" ||
    name.startsWith("Lava ") || name.startsWith("Molten ") ||
    name.startsWith("Volcanic ") ||
    name === "Dogun Ritual Site" || name === "Dragonling Nests" ||
    name === "Dragonbone Graveyard" || name === "Crater Descent" ||
    name === "Pyroclastic Flow" || name === "Sulphuric Hollow" ||
    name === "Entrance to Molten Heights" || name === "Maex" ||
    name === "Freezing Heights" || name === "Perilous Passage"
  ) return "Molten Heights";

  // --- Canyon ---
  if (
    name.startsWith("Canyon ") ||
    name.startsWith("Chasm ") ||
    name === "Bizarre Passage" || name === "Collapsed Bridge" ||
    name === "Fading Forest" || name === "Forgotten Path" ||
    name === "Forgotten Town" || name === "Jagged Foothills"
  ) return "Canyon";

  // --- Gavel (main body — Llevigar, Aldorei, Cinfras, etc.) ---
  if (
    name.startsWith("Llevigar") || name.startsWith("Aldorei") ||
    name.startsWith("Cinfras") || name.startsWith("Thesead") ||
    name.startsWith("Efilim") || name.startsWith("Gylia") ||
    name.startsWith("Gelibord") || name.startsWith("Lexdale") ||
    name.startsWith("Olux") || name.startsWith("Kander") ||
    name.startsWith("Kandon") ||
    name === "Bremminglar" || name === "Bucie Waterfall" ||
    name === "Dark Forest Village" || name === "Entrance to Kander" ||
    name === "Entrance to Olux" || name === "Entrance to Cinfras" ||
    name === "Entrance to Gavel" || name === "Entrance to Thesead" ||
    name === "Entrance to Bucie" ||
    name === "Field of Life" || name === "Guardian of the Forest" ||
    name === "Light Peninsula" || name === "Road to Light Forest" ||
    name === "Path to Light" || name === "Path to Light's Secret" ||
    name === "Path to Cinfras" || name === "Path to Talor" ||
    name === "Path to the Penitentiary" || name === "Talor Cemetery" ||
    name === "Outer Aldorei Town" || name === "Cherry Blossom Grove" ||
    name === "Fleris Cranny" || name === "Fleris Trail" ||
    name === "Floral Peaks" || name === "Florist's Hut" ||
    name === "Delnar Manor" || name === "Derelict Mansion" ||
    name === "Faltach Manor" || name === "Twain Lake" ||
    name === "Twain Mansion" || name === "Heart of Decay" ||
    name === "Caritat Mansion" || name === "Castle Dullahan" ||
    name === "Sinister Forest" || name === "Silent Road" ||
    name === "Dujgon Nation" || name === "Nodguj Nation" ||
    name === "Panda Kingdom" || name === "Panda Path" ||
    name === "Harnort Compound" || name === "Hobgoblin's Hoard" ||
    name === "Forest of Eyes" || name === "Fungal Grove" ||
    name === "Gloopy Cave" || name === "Parasitic Slime Mine" ||
    name === "Mushroom Hill" || name === "Big Mushroom Cave" ||
    name === "Eltom" || name === "Ternaves" || name === "Ternaves Tunnel" ||
    name === "Mantis Nest" || name === "Bear Zoo" || name === "Temple of Legends" ||
    name === "Paths of Sludge" || name === "Primal Fen" ||
    name === "Infested Sinkhole" || name === "Swamp Mountain Arch" ||
    name === "Shady Shack" || name === "Enchanted River" ||
    name === "Entamis Village" || name === "Decayed Basin" ||
    name === "Colourful Mountaintop" || name === "Cascading Basins" ||
    name === "Featherfall Cliffs" || name === "Pine Pillar Forest" ||
    name === "Sanctuary Bridge" || name === "Unicorn Trail" ||
    name === "Luxuriant Pond" || name === "Riverbank Knoll" ||
    name === "Royal Gate" || name === "Luminous Plateau" ||
    name === "The Gate" || name === "Ranol's Farm" ||
    name === "Wizard's Warning" ||
    name === "Path to Ozoth's Spire" || name === "Path to the Dojo" ||
    name === "Path to the Forgery" || name === "Path to the Grootslangs" ||
    name === "The Forgery" || name === "The Shiar" || name === "The Hive" ||
    name === "Karoc Quarry" || name === "Gert Camp" ||
    name === "Eagle Tribe" || name === "Owl Tribe" ||
    name === "Elephelk Trail" ||
    name === "Iboju Village" || name === "Paper Trail" ||
    name === "Secluded Ponds" || name === "Secluded Workshop" ||
    name === "Kitrios Armory" || name === "Kitrios Barracks" ||
    name === "Harpy's Haunt North" || name === "Harpy's Haunt South" ||
    name === "Pigmen Ravines" || name === "Orc Battlegrounds" ||
    name === "Orc Lake" || name === "Orc Road" ||
    name === "Cliffhearth Orc Camp" || name === "Loamsprout Orc Camp" ||
    name === "Mudspring Orc Camp" || name === "Sablestone Orc Camp" ||
    name === "Shineridge Orc Camp" || name === "Stonecave Orc Camp" ||
    name === "Sunspark Orc Camp" ||
    name === "Cliffside Passage North" || name === "Cliffside Passage South" ||
    name === "Wayward Split" || name === "Protector's Pathway" ||
    name === "Illuminant Path" ||
    name === "Mycelial Expanse" || name === "Myconid Descent" ||
    name === "Timeworn Arch" || name === "Evergreen Outbreak" ||
    name === "Blooming Boulders" || name === "Winding Waters" ||
    name === "Elefolk Stomping Grounds" || name === "Felroc Fields" ||
    name === "Lusuco" || name === "Lutho" ||
    name === "Ava's Workshop" || name === "Astraulus' Tower"
  ) return "Gavel";

  // --- Wynn Province ---
  if (
    name.startsWith("Ragni") || name.startsWith("Detlas") ||
    name.startsWith("Nemract") || name.startsWith("Almuj") ||
    name.startsWith("Nesaak") || name.startsWith("Troms") ||
    name.startsWith("Nivla") || name.startsWith("Corrupted") ||
    name.startsWith("Maltic") ||
    name === "Apprentice Huts" || name === "Arachnid Woods" ||
    name === "Bandit Cave" || name === "Bandit's Toll" ||
    name === "Barren Sands" || name === "Black Road" ||
    name === "Bob's Tomb" || name === "Broken Road" ||
    name === "Burning Airship" || name === "Burning Farm" ||
    name === "Coastal Trail" || name === "Collapsed Emerald Mine" ||
    name === "Displaced Housing" || name === "Disturbed Crypt" ||
    name === "Dodegar's Forge" || name === "Dusty Pit" ||
    name === "Elkurn" || name === "Emerald Trail" ||
    name === "Entrance to Almuj" || name === "Entrance to Nivla Woods" ||
    name === "Farmers Settlement" || name === "Nomads' Refuge" ||
    name === "Goblin Plains East" || name === "Goblin Plains West" ||
    name === "Great Bridge" || name === "Grey Ruins" || name === "Guild Hall" ||
    name === "Iron Road" || name === "Mine Base Plains" || name === "Mining Base Camp" ||
    name === "Minotaur Barbecue" || name === "Mount Wynn Inn" ||
    name === "Mummy's Tomb" || name === "Scorpion Nest" ||
    name === "Old Coal Mine" || name === "Old Crossroads" ||
    name === "Plains Lake" || name === "Savannah Plains" ||
    name === "Road to Elkurn" || name === "Road to Mine" || name === "Road to Time Valley" ||
    name === "Roots of Corruption" || name === "Ruined Houses" ||
    name === "Time Valley" || name === "Tower of Ascension" ||
    name === "Webbed Fracture" || name === "Wizard Tower" ||
    name === "Sanguine Spider Den" || name === "Southern Outpost" ||
    name === "Scorched Trail" || name === "Accursed Dunes" ||
    name === "Cascading Oasis" || name === "Herb Cave" ||
    name === "Naga Lake" || name === "Lizardman Camp" || name === "Lizardman Lake" ||
    name === "Lion Lair" || name === "Little Wood" ||
    name === "Abandoned Farm" || name === "Abandoned Lumberyard" ||
    name === "Abandoned Mines" || name === "Abandoned Mines Entrance" ||
    name === "Abandoned Pass" ||
    name === "Alekin" || name === "Ancient Nemract" || name === "Ancient Waterworks" ||
    name === "Wolves' Den" || name === "Wood Sprite Hideaway" ||
    name === "Katoa Ranch" || name === "Meteor Crater" || name === "Meteor Trail" ||
    name === "Monte's Village" || name === "Tempo Town" ||
    name === "Troll Tower" || name === "Troll's Challenge" ||
    name === "Mangled Lake" || name === "Twisted Housing" || name === "Twisted Ridge" ||
    name === "Witching Road" || name === "Forgotten Burrows" ||
    name === "Housing Crisis" || name === "Jungle Entrance" ||
    name === "Frozen Fort" || name === "Frozen Homestead" ||
    name === "Frosty Spikes" || name === "Frigid Crossroads" ||
    name === "Icy Descent" || name === "Icy Vigil" ||
    name === "Aerial Descent" || name === "Weird Clearing" ||
    name === "Worm Tunnel" || name === "Waterfall Cave" ||
    name === "Santa's Hideout" || name === "Invaded Barracks" ||
    name === "Overrun Docks" || name === "Overtaken Outpost" ||
    name === "Lifeless Forest" || name === "Blackstring Den" ||
    name === "Silverbull Headquarters" || name === "Raiders' Airbase" ||
    name === "Raiders' Stronghold" || name === "Ruined Prospect" ||
    name === "Razed Inn" || name === "Ruined Villa" ||
    name === "Inhospitable Mountain" || name === "Desolate Valley" ||
    name === "Akias Ruins" || name === "Ancient Excavation" ||
    name === "Balloon Airbase" || name === "Brigand Outpost" ||
    name === "Bloody Trail" || name === "Rocky Bend" ||
    name === "Azure Frontier" || name === "Toxic Caves" || name === "Toxic Drip" ||
    name === "Wanderer's Way" || name === "Nested Cliffside" ||
    name === "Otherworldly Monolith" || name === "Maiden Tower" ||
    name === "Mesquis Tower" || name === "Krolton's Cave" ||
    name === "Ogre Den" ||
    name === "Centerworld Fortress" || name === "Void Valley" ||
    name === "Viscera Pits" || name === "Gateway to Nothing" ||
    name === "Cyclospordial Hazard" || name === "Final Step" ||
    name === "Founder's Statue" || name === "Fountain of Youth" ||
    name === "Workshop Glade" || name === "Industrial Clearing" ||
    name === "Perilous Grotto" ||
    name === "Turncoat Turnabout" || name === "Jitak's Farm" ||
    name === "Forgotten Burrows" || name === "Trunkstump Goblin Camp" ||
    name === "Essren's Hut"
  ) return "Wynn";

  return "Other";
}

// Coordinate-based region fallback for territories not matched by name.
// Uses approximate bounding boxes for each region in game coordinates (X, Z).
const REGION_BOUNDS: { region: string; minX: number; maxX: number; minZ: number; maxZ: number }[] = [
  { region: "Fruma",          minX: -2300, maxX: -850,  minZ: -1800, maxZ: -400 },
  { region: "Corkus",         minX: -1700, maxX: -1300, minZ: -2950, maxZ: -2650 },
  { region: "Ocean",          minX: -700,  maxX: 150,   minZ: -3600, maxZ: -2800 },
  { region: "Sky Islands",    minX: 600,   maxX: 1200,  minZ: -5000, maxZ: -4400 },
  { region: "Molten Heights", minX: 1100,  maxX: 1700,  minZ: -5300, maxZ: -4900 },
  { region: "Canyon",         minX: 200,   maxX: 900,   minZ: -4700, maxZ: -4200 },
  { region: "Gavel",          minX: -700,  maxX: 1000,  minZ: -5600, maxZ: -4000 },
  { region: "Wynn",           minX: -850,  maxX: 1400,  minZ: -2800, maxZ: -300 },
];

interface TerritoryInfo {
  Location?: { start: [number, number]; end: [number, number] };
  resources?: { emeralds: string; ore: string; crops: string; fish: string; wood: string };
}

let _territoryData: Record<string, TerritoryInfo> | null = null;
let _territoryValues: Map<string, number> | null = null;

/** Set the territory coordinate and resource data. Enables coordinate-based region fallback and importance weighting. */
export function setTerritoryData(data: Record<string, TerritoryInfo>) {
  _territoryData = data;
  regionCache = null; // Invalidate cache so new lookups use coordinates

  // Pre-compute territory importance values from resources
  _territoryValues = new Map();
  for (const [name, info] of Object.entries(data)) {
    if (info.resources) {
      const value =
        parseResourceTier(info.resources.emeralds) * 1.0 +
        parseResourceTier(info.resources.ore) * 0.8 +
        parseResourceTier(info.resources.crops) * 0.6 +
        parseResourceTier(info.resources.fish) * 0.4 +
        parseResourceTier(info.resources.wood) * 0.4;
      _territoryValues.set(name, value);
    }
  }
}

/** Parse resource tier strings like "Very High" into numeric values. */
function parseResourceTier(tier: string): number {
  switch (tier) {
    case "Very High": return 4;
    case "High": return 3;
    case "Medium": return 2;
    case "Low": return 1;
    default: return 0;
  }
}

/** Get the importance value of a territory (0 if unknown). */
function getTerritoryValue(name: string): number {
  return _territoryValues?.get(name) || 0;
}

/** Classify a territory by its coordinates as a fallback. */
function classifyByCoordinates(name: string): string {
  if (!_territoryData) return "Other";
  const terr = _territoryData[name];
  if (!terr?.Location?.start) return "Other";
  const [cx, cz] = [
    (terr.Location.start[0] + terr.Location.end[0]) / 2,
    (terr.Location.start[1] + terr.Location.end[1]) / 2,
  ];
  for (const b of REGION_BOUNDS) {
    if (cx >= b.minX && cx <= b.maxX && cz >= b.minZ && cz <= b.maxZ) {
      return b.region;
    }
  }
  return "Other";
}

// ---------------------------------------------------------------------------
// Conflict detection algorithm
// ---------------------------------------------------------------------------

/** 15-minute bucket for fine-grained activity tracking. */
interface Bucket {
  total: number;
  byRegion: Record<string, number>;
  territories: Set<number>;
  guilds: Set<number>;
}

const BUCKET_SECS = 3600; // 1 hour

/** Find the first event index at or after `targetSec` in sorted events array. */
function lowerBound(events: number[][], targetSec: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid][0] < targetSec) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Compute median of a sorted numeric array. */
function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Detect conflicts from exchange data.
 *
 * Algorithm:
 * 1. Bucket guild-vs-guild exchanges into 1-hour windows
 * 2. Global adaptive threshold (median + 2·MAD) to identify active periods
 * 3. Merge adjacent active hours within a 3-hour gap into conflict runs
 * 4. Characterize each conflict: region breakdown, guild attack pairs, factions
 * 5. Score confidence and auto-name
 */
export function detectConflicts(store: ExchangeStore): ConflictEvent[] {
  const { data, territoryEvents } = store;
  if (data.events.length === 0) return [];

  // Cap input to avoid excessive computation on very large datasets
  const MAX_EVENTS = 600_000;
  const events = data.events.length > MAX_EVENTS
    ? data.events.slice(-MAX_EVENTS)
    : data.events;

  // --- Phase 1: Bucket guild-vs-guild exchanges into 1-hour windows ---
  const currentOwner = new Map<number, number>();
  const buckets = new Map<number, Bucket>();

  for (const evt of events) {
    const [unixSec, tIdx, gIdx] = evt;
    const prevOwner = currentOwner.get(tIdx) ?? -1;
    currentOwner.set(tIdx, gIdx);

    if (data.guilds[gIdx] === "None") continue;
    if (prevOwner < 0 || data.guilds[prevOwner] === "None") continue;
    if (gIdx === prevOwner) continue;

    const bk = Math.floor(unixSec / BUCKET_SECS);
    const region = getRegion(data.territories[tIdx]);
    let b = buckets.get(bk);
    if (!b) {
      b = { total: 0, byRegion: {}, territories: new Set(), guilds: new Set() };
      buckets.set(bk, b);
    }
    b.total++;
    b.byRegion[region] = (b.byRegion[region] || 0) + 1;
    b.territories.add(tIdx);
    b.guilds.add(gIdx);
    b.guilds.add(prevOwner);
  }

  if (buckets.size === 0) return [];

  // --- Phase 2: Global adaptive threshold (exchanges per hour) ---
  const sortedBucketKeys = Array.from(buckets.keys()).sort((a, b) => a - b);
  const allRates = Array.from(buckets.values()).map(b => b.total);
  const globalSorted = [...allRates].sort((a, b) => a - b);
  const globalMedian = median(globalSorted);
  const globalMAD = median(globalSorted.map(v => Math.abs(v - globalMedian)).sort((a, b) => a - b));
  const threshold = Math.max(6, globalMedian + 2 * globalMAD);

  // --- Phase 3: Find conflict runs (merge gaps ≤ 3 hours) ---
  interface RawConflict {
    startBucket: number;
    endBucket: number;
    activeBuckets: number[];
  }

  const rawConflicts: RawConflict[] = [];
  let currentRun: RawConflict | null = null;
  const GAP_HOURS = 3;

  for (const bk of sortedBucketKeys) {
    if (buckets.get(bk)!.total < threshold) continue;
    if (currentRun && bk - currentRun.endBucket <= GAP_HOURS) {
      currentRun.endBucket = bk;
      currentRun.activeBuckets.push(bk);
    } else {
      if (currentRun) rawConflicts.push(currentRun);
      currentRun = { startBucket: bk, endBucket: bk, activeBuckets: [bk] };
    }
  }
  if (currentRun) rawConflicts.push(currentRun);

  // --- Phase 4: Characterize each conflict ---
  const conflicts: ConflictEvent[] = [];

  for (let i = 0; i < rawConflicts.length; i++) {
    const raw = rawConflicts[i];
    const startSec = raw.startBucket * BUCKET_SECS;
    const endSec = (raw.endBucket + 1) * BUCKET_SECS;

    let totalExchanges = 0;
    let peakHourly = 0;
    const regionBreakdown: Record<string, number> = {};
    const allTerritories = new Set<number>();

    for (const bk of raw.activeBuckets) {
      const b = buckets.get(bk)!;
      if (b.total > peakHourly) peakHourly = b.total;
      totalExchanges += b.total;
      for (const [r, c] of Object.entries(b.byRegion)) {
        regionBreakdown[r] = (regionBreakdown[r] || 0) + c;
      }
      for (const t of b.territories) allTerritories.add(t);
    }

    if (totalExchanges === 0) continue;

    const regionEntries = Object.entries(regionBreakdown).sort((a, b) => b[1] - a[1]);
    const topRegionPct = regionEntries.length > 0 ? regionEntries[0][1] / totalExchanges : 0;
    const primaryRegion = topRegionPct >= 0.6 ? regionEntries[0][0] : "Global";
    const significantRegions = regionEntries.filter(([, c]) => c / totalExchanges > 0.15);
    const isMultiFront = significantRegions.length >= 3;

    // Initialize territory owners via binary search, then walk events in window
    const guildTaken = new Map<number, number>();
    const guildLost = new Map<number, number>();
    const pairAttacks = new Map<string, number>();
    const owner = new Map<number, number>();

    for (let tIdx = 0; tIdx < territoryEvents.length; tIdx++) {
      const tevts = territoryEvents[tIdx];
      let lo = 0, hi = tevts.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (tevts[mid][0] < startSec) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0) owner.set(tIdx, tevts[lo - 1][1]);
    }

    let weightedExchanges = 0;
    const evtStart = lowerBound(events, startSec);
    for (let ei = evtStart; ei < events.length; ei++) {
      const [sec, tIdx, gIdx] = events[ei];
      if (sec >= endSec) break;
      const prevIdx = owner.get(tIdx) ?? -1;
      owner.set(tIdx, gIdx);
      if (prevIdx < 0) continue;
      if (data.guilds[gIdx] === "None" || data.guilds[prevIdx] === "None") continue;
      if (gIdx === prevIdx) continue;
      guildTaken.set(gIdx, (guildTaken.get(gIdx) || 0) + 1);
      guildLost.set(prevIdx, (guildLost.get(prevIdx) || 0) + 1);
      pairAttacks.set(`${gIdx}_${prevIdx}`, (pairAttacks.get(`${gIdx}_${prevIdx}`) || 0) + 1);
      weightedExchanges += 1 + getTerritoryValue(data.territories[tIdx]);
    }

    const factions = detectFactions(data, guildTaken, guildLost, pairAttacks);

    const durationHours = (endSec - startSec) / 3600;
    const involvedGuilds = new Set([...guildTaken.keys(), ...guildLost.keys()]);
    let confidence = 0;
    if (involvedGuilds.size >= 4) confidence += 0.3;
    else if (involvedGuilds.size >= 2) confidence += 0.15;
    if (durationHours >= 2) confidence += 0.2;
    else if (durationHours >= 1) confidence += 0.1;
    if (peakHourly >= 20) confidence += 0.2;
    else if (peakHourly >= 10) confidence += 0.1;
    if (allTerritories.size >= 10) confidence += 0.15;
    else if (allTerritories.size >= 5) confidence += 0.07;
    if (factions.length >= 2) confidence += computeBipartiteScore(factions, pairAttacks) * 0.15;
    confidence = Math.min(1, confidence);

    const name = generateConflictName(primaryRegion, isMultiFront, significantRegions, factions);

    conflicts.push({
      id: `c_${i}_${startSec}`,
      name,
      startTime: new Date(startSec * 1000),
      endTime: new Date(endSec * 1000),
      totalExchanges,
      peakHourly,
      primaryRegion,
      regionBreakdown,
      sides: factions.length >= 2
        ? [factions[0], factions[1]]
        : [factions[0] || { guilds: [], totalTaken: 0, totalLost: 0 },
           factions[1] || { guilds: [], totalTaken: 0, totalLost: 0 }],
      factions,
      territoriesInvolved: allTerritories.size,
      confidence,
      isMultiFront,
      weightedExchanges: Math.round(weightedExchanges),
    });
  }

  // Sort by total exchanges descending, cap at 200
  conflicts.sort((a, b) => b.totalExchanges - a.totalExchanges);
  return conflicts.slice(0, 200);
}

// ---------------------------------------------------------------------------
// Faction Detection (simple two-side split)
// ---------------------------------------------------------------------------

/**
 * Assign guilds to two sides based on who attacks whom.
 * 1. Find the top hostile pair (most mutual attacks) → seed sides A and B.
 * 2. Assign each remaining guild to the side it attacks more.
 */
function detectFactions(
  data: { guilds: string[]; prefixes: string[] },
  guildTaken: Map<number, number>,
  guildLost: Map<number, number>,
  pairAttacks: Map<string, number>,
): ConflictSide[] {
  const involvedGuilds = new Set<number>();
  for (const g of guildTaken.keys()) involvedGuilds.add(g);
  for (const g of guildLost.keys()) involvedGuilds.add(g);
  if (involvedGuilds.size === 0) return [];

  // Find the top hostile pair to seed the two sides
  let seedA = -1, seedB = -1, bestMutual = 0;
  for (const [pair, count] of pairAttacks) {
    const sep = pair.indexOf("_");
    const a = Number(pair.slice(0, sep));
    const b = Number(pair.slice(sep + 1));
    const mutual = count + (pairAttacks.get(`${b}_${a}`) || 0);
    if (mutual > bestMutual) { bestMutual = mutual; seedA = a; seedB = b; }
  }

  if (seedA < 0) {
    return [buildFactionSide(data, guildTaken, guildLost, [...involvedGuilds])];
  }

  const side0 = new Set<number>([seedA]);
  const side1 = new Set<number>([seedB]);

  // Assign remaining guilds to the side they attack more
  for (const g of involvedGuilds) {
    if (g === seedA || g === seedB) continue;
    let attackSide0 = 0, attackSide1 = 0;
    for (const [pair, count] of pairAttacks) {
      const sep = pair.indexOf("_");
      if (Number(pair.slice(0, sep)) !== g) continue;
      const target = Number(pair.slice(sep + 1));
      if (side0.has(target)) attackSide0 += count;
      if (side1.has(target)) attackSide1 += count;
    }
    if (attackSide1 > attackSide0) side1.add(g); else side0.add(g);
  }

  const factions = [
    buildFactionSide(data, guildTaken, guildLost, [...side0]),
    buildFactionSide(data, guildTaken, guildLost, [...side1]),
  ].filter(f => f.guilds.length > 0);

  // Aggressor (most taken) goes first
  if (factions.length >= 2 && factions[1].totalTaken > factions[0].totalTaken) {
    [factions[0], factions[1]] = [factions[1], factions[0]];
  }

  return factions;
}

/** Build a ConflictSide from a list of guild indices. */
function buildFactionSide(
  data: { guilds: string[]; prefixes: string[] },
  guildTaken: Map<number, number>,
  guildLost: Map<number, number>,
  members: number[],
): ConflictSide {
  const guilds = members.map(gIdx => ({
    name: data.guilds[gIdx],
    prefix: data.prefixes[gIdx],
    taken: guildTaken.get(gIdx) || 0,
    lost: guildLost.get(gIdx) || 0,
  }));

  // Compute totals from ALL members BEFORE truncation
  const totalTaken = guilds.reduce((s, g) => s + g.taken, 0);
  const totalLost = guilds.reduce((s, g) => s + g.lost, 0);

  // Sort by involvement, keep top 10 for display
  guilds.sort((a, b) => (b.taken + b.lost) - (a.taken + a.lost));
  guilds.length = Math.min(guilds.length, 10);

  return { guilds, totalTaken, totalLost };
}

// ---------------------------------------------------------------------------
// Conflict scoring and naming
// ---------------------------------------------------------------------------

/** Compute how cleanly bipartite the faction structure is (0-1). */
function computeBipartiteScore(
  factions: ConflictSide[],
  pairAttacks: Map<string, number>,
): number {
  if (factions.length < 2) return 0;

  // For simplicity, check the top 2 factions
  const side1Names = new Set(factions[0].guilds.map(g => g.name));
  const side2Names = new Set(factions[1].guilds.map(g => g.name));

  let interSideAttacks = 0;
  let intraSideAttacks = 0;

  for (const [pair, count] of pairAttacks) {
    const [aIdx, bIdx] = pair.split("_").map(Number);
    // We don't have name→idx reverse lookup here, so this is approximate
    // based on the guild names in the faction sides
    // Skip this detailed check and use a simpler heuristic
    void aIdx; void bIdx; void count;
  }

  // Simpler heuristic: ratio of guilds that appear in exactly one faction
  const allGuilds = new Set([...side1Names, ...side2Names]);
  const overlap = [...side1Names].filter(n => side2Names.has(n)).length;
  if (allGuilds.size === 0) return 0;
  return 1 - (overlap / allGuilds.size);
}

/** Generate a human-readable name for a conflict. */
function generateConflictName(
  primaryRegion: string,
  isMultiFront: boolean,
  significantRegions: [string, number][],
  factions: ConflictSide[],
): string {
  // Get top guild prefix from each of the first 2 factions
  const prefix1 = factions[0]?.guilds[0]?.prefix || "???";
  const prefix2 = factions[1]?.guilds[0]?.prefix || "???";

  if (isMultiFront) {
    const regionNames = significantRegions
      .slice(0, 2)
      .map(([r]) => r)
      .join("/");
    return `${regionNames} War: ${prefix1} vs ${prefix2}`;
  }

  const location = primaryRegion === "Global" ? "Global" : primaryRegion;
  return `Battle of ${location}: ${prefix1} vs ${prefix2}`;
}

// ---------------------------------------------------------------------------
// War Grouping
// ---------------------------------------------------------------------------

/**
 * Group related conflicts into wars.
 * Two conflicts belong to the same war if they share dominant guilds and are
 * within 48 hours of each other.
 */
export function groupConflictsIntoWars(conflicts: ConflictEvent[]): War[] {
  if (conflicts.length === 0) return [];

  // Sort by start time
  const sorted = [...conflicts].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const MAX_GAP_MS = 12 * 60 * 60 * 1000;  // 12 hours between consecutive battles
  const MAX_WAR_MS = 7 * 24 * 60 * 60 * 1000; // 7 days total war duration cap
  const MIN_GUILD_OVERLAP = 0.5; // 50% of top guilds must overlap

  /** Get the set of top guild names from a conflict's first 2 factions. */
  function getTopGuilds(c: ConflictEvent): Set<string> {
    const names = new Set<string>();
    for (const faction of c.factions.slice(0, 2)) {
      for (const g of faction.guilds.slice(0, 5)) {
        names.add(g.name);
      }
    }
    return names;
  }

  function guildOverlap(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let overlap = 0;
    for (const name of a) {
      if (b.has(name)) overlap++;
    }
    return overlap / Math.min(a.size, b.size);
  }

  const wars: War[] = [];
  const assigned = new Set<string>(); // conflict IDs already in a war

  for (let i = 0; i < sorted.length; i++) {
    if (assigned.has(sorted[i].id)) continue;

    const warConflicts: ConflictEvent[] = [sorted[i]];
    const warGuilds = getTopGuilds(sorted[i]);
    assigned.add(sorted[i].id);

    // Greedily add subsequent conflicts within gap + guild overlap, capped by total duration
    const warStart = warConflicts[0].startTime.getTime();
    for (let j = i + 1; j < sorted.length; j++) {
      if (assigned.has(sorted[j].id)) continue;

      // Stop if this conflict is too far from the previous one
      const gapFromLast = sorted[j].startTime.getTime() - warConflicts[warConflicts.length - 1].endTime.getTime();
      if (gapFromLast > MAX_GAP_MS) break;

      // Stop if war would exceed max duration
      if (sorted[j].endTime.getTime() - warStart > MAX_WAR_MS) break;

      const candidateGuilds = getTopGuilds(sorted[j]);
      if (guildOverlap(warGuilds, candidateGuilds) >= MIN_GUILD_OVERLAP) {
        warConflicts.push(sorted[j]);
        assigned.add(sorted[j].id);
        for (const g of candidateGuilds) warGuilds.add(g);
      }
    }

    if (warConflicts.length >= 2) {
      const totalExchanges = warConflicts.reduce((s, c) => s + c.totalExchanges, 0);
      wars.push({
        id: `war_${wars.length}_${Math.floor(warConflicts[0].startTime.getTime() / 1000)}`,
        name: warConflicts[0].name.replace("Battle of", "War of"),
        startTime: warConflicts[0].startTime,
        endTime: warConflicts[warConflicts.length - 1].endTime,
        conflicts: warConflicts,
        totalExchanges,
      });
    }
  }

  wars.sort((a, b) => b.totalExchanges - a.totalExchanges);
  return wars;
}
