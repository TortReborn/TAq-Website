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

// Pre-computed possible externals for each territory
export type TerritoryExternalsData = Record<string, string[]>;

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

// Calculate external territories for HQ bonus using pre-computed lookup
// Externals are territories at depth 2-3 from the HQ that the guild owns
// IMPORTANT: Depth 1 (direct connections) do NOT count as externals
// Pattern: HQ -> conn (NOT ext) -> ext -> ext -> no effect
export function calculateExternals(
  hqTerritoryName: string,
  ownerGuildName: string,
  territories: Record<string, Territory>,
  externalsData: TerritoryExternalsData | null
): number {
  if (!externalsData) return 0;

  const possibleExternals = externalsData[hqTerritoryName];
  if (!possibleExternals || possibleExternals.length === 0) return 0;

  let externals = 0;
  for (const externalName of possibleExternals) {
    const territory = territories[externalName];
    if (territory && territory.guild.name === ownerGuildName) {
      externals++;
    }
  }

  return externals;
}

// Get the maximum possible externals for a territory (from pre-computed data)
export function getMaxPossibleExternals(
  territoryName: string,
  externalsData: TerritoryExternalsData | null
): number {
  if (!externalsData) return 0;
  const possibleExternals = externalsData[territoryName];
  return possibleExternals ? possibleExternals.length : 0;
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
