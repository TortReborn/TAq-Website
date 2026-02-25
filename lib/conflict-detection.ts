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
  startTime: Date;
  endTime: Date;
  totalExchanges: number;
  peakHourly: number;
  primaryRegion: string;
  regionBreakdown: Record<string, number>;
  sides: [ConflictSide, ConflictSide];
  territoriesInvolved: number;
}

export interface ConflictSide {
  guilds: { name: string; prefix: string; taken: number; lost: number }[];
  totalTaken: number;
  totalLost: number;
}

// ---------------------------------------------------------------------------
// Region mapping
// ---------------------------------------------------------------------------

const REGIONS = [
  "Wynn", "Gavel", "Ocean", "Corkus", "Canyon", "Molten Heights", "Sky Islands",
] as const;

export type Region = (typeof REGIONS)[number] | "Other";

export const ALL_REGIONS: readonly string[] = [...REGIONS, "Other"];

// Cached lookup: territory name → region
let regionCache: Map<string, string> | null = null;

/** Classify a territory into a map region by name patterns. */
export function getRegion(name: string): string {
  if (regionCache?.has(name)) return regionCache.get(name)!;

  const region = classifyTerritory(name);
  if (!regionCache) regionCache = new Map();
  regionCache.set(name, region);
  return region;
}

function classifyTerritory(name: string): string {
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
    name === "Elephant Stomping Grounds" || name === "Elephelk Trail" ||
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
    name === "Forgotten Burrows" || name === "Trunkstump Goblin Camp"
  ) return "Wynn";

  return "Other";
}

// ---------------------------------------------------------------------------
// Conflict detection algorithm
// ---------------------------------------------------------------------------

interface HourBucket {
  total: number;
  byRegion: Record<string, number>;
  territories: Set<number>;
}

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

/**
 * Detect conflicts from exchange data.
 * Analyzes all territory exchanges to find periods of intense activity.
 */
export function detectConflicts(store: ExchangeStore): ConflictEvent[] {
  const { data, territoryEvents } = store;
  if (data.events.length === 0) return [];

  // --- Phase 1: Bucket events by hour ---
  const currentOwner = new Map<number, number>(); // terrIdx → guildIdx
  const buckets = new Map<number, HourBucket>(); // floor(unixSec/3600) → bucket

  for (const evt of data.events) {
    const [unixSec, tIdx, gIdx] = evt;
    const prevOwnerIdx = currentOwner.get(tIdx) ?? -1;
    currentOwner.set(tIdx, gIdx);

    // Only count guild-vs-guild exchanges
    const attackerName = data.guilds[gIdx];
    const defenderName = prevOwnerIdx >= 0 ? data.guilds[prevOwnerIdx] : "None";
    if (attackerName === "None" || defenderName === "None") continue;
    if (attackerName === defenderName) continue;

    const hourKey = Math.floor(unixSec / 3600);
    const region = getRegion(data.territories[tIdx]);

    let bucket = buckets.get(hourKey);
    if (!bucket) {
      bucket = { total: 0, byRegion: {}, territories: new Set() };
      buckets.set(hourKey, bucket);
    }
    bucket.total++;
    bucket.byRegion[region] = (bucket.byRegion[region] || 0) + 1;
    bucket.territories.add(tIdx);
  }

  // --- Phase 2: Find conflict periods using adaptive threshold ---
  const hourlyTotals = Array.from(buckets.values()).map(b => b.total);
  if (hourlyTotals.length === 0) return [];

  // Compute median + 2*MAD threshold (minimum 8)
  const sorted = [...hourlyTotals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mad = sorted.map(v => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(sorted.length / 2)];
  const threshold = Math.max(8, median + 2 * mad);

  // Find runs of active hours (allowing 3-hour gaps)
  const sortedHours = Array.from(buckets.keys()).sort((a, b) => a - b);
  const GAP_HOURS = 3;

  interface RawConflict {
    startHour: number;
    endHour: number;
    hours: number[];
  }

  const rawConflicts: RawConflict[] = [];
  let current: RawConflict | null = null;

  for (const hour of sortedHours) {
    const bucket = buckets.get(hour)!;
    if (bucket.total < threshold) continue;

    if (current && hour - current.endHour <= GAP_HOURS) {
      current.endHour = hour;
      current.hours.push(hour);
    } else {
      if (current) rawConflicts.push(current);
      current = { startHour: hour, endHour: hour, hours: [hour] };
    }
  }
  if (current) rawConflicts.push(current);

  // --- Phase 3: Characterize each conflict ---
  const conflicts: ConflictEvent[] = [];

  for (let i = 0; i < rawConflicts.length; i++) {
    const raw = rawConflicts[i];
    const startSec = raw.startHour * 3600;
    const endSec = (raw.endHour + 1) * 3600; // include the full last hour

    // Sum bucket stats
    let totalExchanges = 0;
    let peakHourly = 0;
    const regionBreakdown: Record<string, number> = {};
    const allTerritories = new Set<number>();

    for (const hour of raw.hours) {
      const b = buckets.get(hour)!;
      totalExchanges += b.total;
      if (b.total > peakHourly) peakHourly = b.total;
      for (const [reg, count] of Object.entries(b.byRegion)) {
        regionBreakdown[reg] = (regionBreakdown[reg] || 0) + count;
      }
      for (const t of b.territories) allTerritories.add(t);
    }

    // Find primary region
    let primaryRegion = "Global";
    const regionEntries = Object.entries(regionBreakdown).sort((a, b) => b[1] - a[1]);
    if (regionEntries.length > 0) {
      const topRegionPct = regionEntries[0][1] / totalExchanges;
      primaryRegion = topRegionPct >= 0.6 ? regionEntries[0][0] : "Global";
    }

    // Build guild interaction matrix from events in this time range
    const guildTaken = new Map<number, number>(); // guildIdx → territories taken
    const guildLost = new Map<number, number>();  // guildIdx → territories lost
    const pairAttacks = new Map<string, number>(); // "attacker_defender" → count

    const owner = new Map<number, number>(); // rebuild state for this window

    // Initialize owners from events before this conflict
    for (let tIdx = 0; tIdx < territoryEvents.length; tIdx++) {
      const tevts = territoryEvents[tIdx];
      // Binary search for last event before startSec
      let lo = 0, hi = tevts.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (tevts[mid][0] < startSec) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0) {
        owner.set(tIdx, tevts[lo - 1][1]);
      }
    }

    // Walk events in the conflict window
    const evtStart = lowerBound(data.events, startSec);
    for (let ei = evtStart; ei < data.events.length; ei++) {
      const [sec, tIdx, gIdx] = data.events[ei];
      if (sec >= endSec) break;

      const prevIdx = owner.get(tIdx) ?? -1;
      owner.set(tIdx, gIdx);

      const attacker = data.guilds[gIdx];
      const defender = prevIdx >= 0 ? data.guilds[prevIdx] : "None";
      if (attacker === "None" || defender === "None") continue;
      if (attacker === defender) continue;

      guildTaken.set(gIdx, (guildTaken.get(gIdx) || 0) + 1);
      guildLost.set(prevIdx, (guildLost.get(prevIdx) || 0) + 1);
      pairAttacks.set(`${gIdx}_${prevIdx}`, (pairAttacks.get(`${gIdx}_${prevIdx}`) || 0) + 1);
    }

    // Alliance detection: greedy bipartite assignment
    const sides = buildSides(data, guildTaken, guildLost, pairAttacks);

    conflicts.push({
      id: `c_${i}_${startSec}`,
      startTime: new Date(startSec * 1000),
      endTime: new Date(endSec * 1000),
      totalExchanges,
      peakHourly,
      primaryRegion,
      regionBreakdown,
      sides,
      territoriesInvolved: allTerritories.size,
    });
  }

  // Sort by total exchanges descending, cap at 100
  conflicts.sort((a, b) => b.totalExchanges - a.totalExchanges);
  return conflicts.slice(0, 100);
}

/**
 * Build two sides of a conflict using greedy bipartite graph partitioning.
 */
function buildSides(
  data: { guilds: string[]; prefixes: string[] },
  guildTaken: Map<number, number>,
  guildLost: Map<number, number>,
  pairAttacks: Map<string, number>,
): [ConflictSide, ConflictSide] {
  // Get all involved guilds
  const involvedGuilds = new Set<number>();
  for (const g of guildTaken.keys()) involvedGuilds.add(g);
  for (const g of guildLost.keys()) involvedGuilds.add(g);

  if (involvedGuilds.size === 0) {
    return [
      { guilds: [], totalTaken: 0, totalLost: 0 },
      { guilds: [], totalTaken: 0, totalLost: 0 },
    ];
  }

  // Find the strongest attacker-defender pair to seed the two sides
  let bestPair = "";
  let bestCount = 0;
  for (const [pair, count] of pairAttacks) {
    // Also consider the reverse direction
    const [a, b] = pair.split("_").map(Number);
    const reverseCount = pairAttacks.get(`${b}_${a}`) || 0;
    const totalConflict = count + reverseCount;
    if (totalConflict > bestCount) {
      bestCount = totalConflict;
      bestPair = pair;
    }
  }

  const sideA = new Set<number>(); // "attackers" side
  const sideB = new Set<number>(); // "defenders" side

  if (bestPair) {
    const [seedA, seedB] = bestPair.split("_").map(Number);
    sideA.add(seedA);
    sideB.add(seedB);
  }

  // Assign remaining guilds based on who they attack / are attacked by
  const remaining = [...involvedGuilds].filter(g => !sideA.has(g) && !sideB.has(g));

  // Sort by total involvement (most involved first for better seeding)
  remaining.sort((a, b) => {
    const aTotal = (guildTaken.get(a) || 0) + (guildLost.get(a) || 0);
    const bTotal = (guildTaken.get(b) || 0) + (guildLost.get(b) || 0);
    return bTotal - aTotal;
  });

  for (const guild of remaining) {
    // How much does this guild attack side A vs side B?
    let attacksOnA = 0, attacksOnB = 0;
    let attackedByA = 0, attackedByB = 0;

    for (const member of sideA) {
      attacksOnA += pairAttacks.get(`${guild}_${member}`) || 0;
      attackedByA += pairAttacks.get(`${member}_${guild}`) || 0;
    }
    for (const member of sideB) {
      attacksOnB += pairAttacks.get(`${guild}_${member}`) || 0;
      attackedByB += pairAttacks.get(`${member}_${guild}`) || 0;
    }

    // If guild attacks side B more or is attacked by side B more → side A
    // (they're fighting against side B, so they're with side A)
    const hostilityToA = attacksOnA + attackedByA;
    const hostilityToB = attacksOnB + attackedByB;

    if (hostilityToB >= hostilityToA) {
      sideA.add(guild); // Fights against B → joins A
    } else {
      sideB.add(guild); // Fights against A → joins B
    }
  }

  // Build side summaries
  function buildSide(members: Set<number>): ConflictSide {
    const guilds = [...members].map(gIdx => ({
      name: data.guilds[gIdx],
      prefix: data.prefixes[gIdx],
      taken: guildTaken.get(gIdx) || 0,
      lost: guildLost.get(gIdx) || 0,
    }));

    // Sort by total involvement, keep top 10
    guilds.sort((a, b) => (b.taken + b.lost) - (a.taken + a.lost));
    guilds.length = Math.min(guilds.length, 10);

    return {
      guilds,
      totalTaken: guilds.reduce((s, g) => s + g.taken, 0),
      totalLost: guilds.reduce((s, g) => s + g.lost, 0),
    };
  }

  const result: [ConflictSide, ConflictSide] = [buildSide(sideA), buildSide(sideB)];

  // Ensure side with more taken territories is first (the "aggressors")
  if (result[1].totalTaken > result[0].totalTaken) {
    return [result[1], result[0]];
  }

  return result;
}
