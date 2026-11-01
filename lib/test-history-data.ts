/**
 * Test data for history viewer development.
 * Generates 6 hours of fake snapshot data (36 snapshots at 10-minute intervals).
 */

import { HistorySnapshot, SnapshotTerritory } from "./history-data";
import { TERRITORY_TO_ABBREV } from "./territory-abbreviations";

// Sample guilds for test data
const TEST_GUILDS = [
  { prefix: "TAq", name: "The Aquarium" },
  { prefix: "ERN", name: "Dern" },
  { prefix: "ICA", name: "Icarus" },
  { prefix: "Hax", name: "Hax" },
  { prefix: "TNL", name: "The Nameless" },
  { prefix: "AVS", name: "Avicia" },
  { prefix: "PUN", name: "Paladins United" },
  { prefix: "FUY", name: "Forever Untold Yore" },
  { prefix: "HIC", name: "Holders of Icebound" },
  { prefix: "KoE", name: "Kingdom of Eden" },
  { prefix: "BLA", name: "Blacklist" },
  { prefix: "SYN", name: "Synonym" },
];

// Use ALL territories from the abbreviations mapping
const TEST_TERRITORIES = Object.values(TERRITORY_TO_ABBREV);

// Simple seeded random number generator
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// Generate a random guild assignment for territories
function generateTerritoryOwnership(seed: number): Record<string, SnapshotTerritory> {
  const territories: Record<string, SnapshotTerritory> = {};
  const rng = seededRandom(seed);

  TEST_TERRITORIES.forEach((abbrev) => {
    // Assign guild based on random selection
    const guildIndex = Math.floor(rng() * TEST_GUILDS.length);
    const guild = TEST_GUILDS[guildIndex];

    territories[abbrev] = {
      g: guild.prefix,
      n: guild.name,
    };
  });

  return territories;
}

// Simulate territory changes between snapshots
function evolveTerritories(
  prev: Record<string, SnapshotTerritory>,
  changeCount: number
): Record<string, SnapshotTerritory> {
  const result = { ...prev };
  const territoryKeys = Object.keys(result);

  // Make random changes (more changes for more territories)
  for (let i = 0; i < changeCount; i++) {
    const randomTerritoryIndex = Math.floor(Math.random() * territoryKeys.length);
    const randomGuildIndex = Math.floor(Math.random() * TEST_GUILDS.length);
    const territory = territoryKeys[randomTerritoryIndex];
    const guild = TEST_GUILDS[randomGuildIndex];

    result[territory] = {
      g: guild.prefix,
      n: guild.name,
    };
  }

  return result;
}

// Generate 6 hours of test snapshots (36 snapshots at 10-minute intervals)
export function generateTestSnapshots(): HistorySnapshot[] {
  const snapshots: HistorySnapshot[] = [];
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  let currentTerritories = generateTerritoryOwnership(12345);

  // Generate snapshots every 10 minutes for 6 hours
  for (let i = 0; i <= 36; i++) {
    const timestamp = new Date(sixHoursAgo.getTime() + i * 10 * 60 * 1000);

    // Evolve territories (5-15 changes per snapshot for ~290 territories)
    if (i > 0) {
      const changes = Math.floor(Math.random() * 11) + 5;
      currentTerritories = evolveTerritories(currentTerritories, changes);
    }

    snapshots.push({
      timestamp: timestamp.toISOString(),
      territories: { ...currentTerritories },
    });
  }

  return snapshots;
}

// Cache the generated snapshots so they're consistent during a session
let cachedSnapshots: HistorySnapshot[] | null = null;

export function getTestSnapshots(): HistorySnapshot[] {
  if (!cachedSnapshots) {
    cachedSnapshots = generateTestSnapshots();
  }
  return cachedSnapshots;
}

export function getTestBounds(): { earliest: string; latest: string } {
  const snapshots = getTestSnapshots();
  return {
    earliest: snapshots[0].timestamp,
    latest: snapshots[snapshots.length - 1].timestamp,
  };
}

export function getTestSnapshotsInRange(center: Date, rangeMs: number): HistorySnapshot[] {
  const snapshots = getTestSnapshots();
  const halfRange = rangeMs / 2;

  return snapshots.filter(s => {
    const time = new Date(s.timestamp).getTime();
    return Math.abs(time - center.getTime()) <= halfRange;
  });
}

/**
 * Generate test exchange events in the compact indexed format.
 * Produces ~360 events over 6 hours (1 per minute) across test territories.
 */
export function getTestExchangeEvents() {
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  const territories = Object.keys(TERRITORY_TO_ABBREV);
  const guilds = TEST_GUILDS.map(g => g.name);
  const prefixes = TEST_GUILDS.map(g => g.prefix);

  const events: number[][] = [];
  const rng = seededRandom(99999);

  for (let i = 0; i < 360; i++) {
    const time = new Date(sixHoursAgo.getTime() + i * 60 * 1000);
    const unixSec = Math.floor(time.getTime() / 1000);
    const tIdx = Math.floor(rng() * territories.length);
    const gIdx = Math.floor(rng() * guilds.length);
    events.push([unixSec, tIdx, gIdx]);
  }

  return {
    territories,
    guilds,
    prefixes,
    events,
    earliest: sixHoursAgo.toISOString(),
    latest: now.toISOString(),
  };
}

// Flag to enable/disable test data (set to false to use real database)
export const USE_TEST_DATA = false;
