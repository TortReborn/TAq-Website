import { Territory } from './utils';

export interface TerritoryVerboseData {
  resources: {
    emeralds: string;
    ore: string;
    crops: string;
    fish: string;
    wood: string;
  };
  "Trading Routes": string[];
  Location: {
    start: [number, number];
    end: [number, number];
  };
  Guild: {
    uuid: string;
    name: string;
    prefix: string;
  };
  Acquired: string;
}

export interface ConnectionResult {
  owned: number;
  total: number;
}

// Calculate how many of a territory's connections are owned by the same guild
export function calculateConnections(
  territoryName: string,
  ownerGuildName: string,
  territories: Record<string, Territory>,
  verboseData: Record<string, TerritoryVerboseData> | null
): ConnectionResult {
  // Try to get trading routes from verbose data first
  let tradingRoutes: string[] | undefined;

  if (verboseData) {
    const verbose = verboseData[territoryName];
    if (verbose && verbose["Trading Routes"]) {
      tradingRoutes = verbose["Trading Routes"];
    }
  }

  // Fallback: try to get from territory data itself
  if (!tradingRoutes) {
    const territory = territories[territoryName];
    if (territory && territory["Trading Routes"]) {
      tradingRoutes = territory["Trading Routes"];
    }
  }

  if (!tradingRoutes || tradingRoutes.length === 0) {
    return { owned: 0, total: 0 };
  }

  const total = tradingRoutes.length;
  let owned = 0;

  for (const connectedTerritoryName of tradingRoutes) {
    const connectedTerritory = territories[connectedTerritoryName];
    if (connectedTerritory && connectedTerritory.guild.name === ownerGuildName) {
      owned++;
    }
  }

  return { owned, total };
}

// Calculate external territories for HQ bonus
// Externals are territories within 3 connections of the HQ that the guild owns
// IMPORTANT: Depth 1 (direct connections) do NOT count as externals
// Pattern: HQ -> conn (NOT ext) -> ext -> ext -> no effect
export function calculateExternals(
  hqTerritoryName: string,
  ownerGuildName: string,
  territories: Record<string, Territory>,
  verboseData: Record<string, TerritoryVerboseData> | null,
  maxDepth: number = 3
): number {
  const visited = new Set<string>();
  const queue: { name: string; depth: number }[] = [{ name: hqTerritoryName, depth: 0 }];
  let externals = 0;

  // Helper to get trading routes for a territory
  const getTradingRoutes = (name: string): string[] => {
    // Try verbose data first
    if (verboseData) {
      const verbose = verboseData[name];
      if (verbose && verbose["Trading Routes"]) {
        return verbose["Trading Routes"];
      }
    }
    // Fallback to territory data
    const territory = territories[name];
    if (territory && territory["Trading Routes"]) {
      return territory["Trading Routes"];
    }
    return [];
  };

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current.name)) continue;
    visited.add(current.name);

    // Count as external if:
    // - Not the HQ itself
    // - Depth >= 2 (connections at depth 1 don't count as externals)
    // - Territory is owned by the same guild
    if (current.name !== hqTerritoryName && current.depth >= 2) {
      const territory = territories[current.name];
      if (territory && territory.guild.name === ownerGuildName) {
        externals++;
      }
    }

    // Continue BFS if we haven't reached max depth
    if (current.depth < maxDepth) {
      const tradingRoutes = getTradingRoutes(current.name);
      for (const connectedName of tradingRoutes) {
        if (!visited.has(connectedName)) {
          queue.push({ name: connectedName, depth: current.depth + 1 });
        }
      }
    }
  }

  return externals;
}

// Get all guild-owned territories
export function getGuildTerritories(
  guildName: string,
  territories: Record<string, Territory>
): string[] {
  return Object.entries(territories)
    .filter(([, territory]) => territory.guild.name === guildName)
    .map(([name]) => name);
}
