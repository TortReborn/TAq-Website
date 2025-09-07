export function fmtInt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Territory interfaces and functions
export interface Territory {
  guild: {
    uuid: string;
    name: string;
    prefix: string;
  };
  acquired: string;
  location: {
    start: [number, number];
    end: [number, number];
  };
  resources?: {
    emeralds: string;
    ore: string;
    crops: string;
    fish: string;
    wood: string;
  };
  "Trading Routes"?: string[];
}

// Legacy interface for territories_verbose.json
export interface TerritoryVerbose {
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

// Function to load territories from the Wynncraft API or local JSON
export async function loadTerritories(): Promise<Record<string, Territory>> {
  try {
    // First try to load from our API proxy
    const apiResponse = await fetch('/api/territories');
    if (apiResponse.ok) {
      const result = await apiResponse.json();
      // Check if the response contains an error
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    }
    
    // Fallback to local territories_verbose.json if API fails
    const localResponse = await fetch('/territories_verbose.json');
    if (!localResponse.ok) {
      throw new Error(`Failed to load territories: ${localResponse.statusText}`);
    }
    
    const verboseTerritories: Record<string, TerritoryVerbose> = await localResponse.json();
    
    // Convert verbose format to simplified format
    const territories: Record<string, Territory> = {};
    for (const [name, verboseTerritory] of Object.entries(verboseTerritories)) {
      territories[name] = {
        guild: verboseTerritory.Guild,
        acquired: verboseTerritory.Acquired,
        location: verboseTerritory.Location,
        resources: verboseTerritory.resources,
        "Trading Routes": verboseTerritory["Trading Routes"]
      };
    }
    
    return territories;
  } catch (error) {
    console.error('Error loading territories:', error);
    return {};
  }
}

// Coordinate conversion utility - maps game coordinates to pixel coordinates
export function coordToPixel(coord: [number, number]): [number, number] {
  // Using Detlas as reference point:
  // Game coordinate [402, -1657] should map to pixel [2872, 4990]
  const refGameCoord = [402, -1657];
  const refPixelCoord = [2872, 4990];
  
  // Calculate offset from reference point
  const deltaX = coord[0] - refGameCoord[0];
  const deltaY = coord[1] - refGameCoord[1];
  
  // Adjusted scale factors
  const scaleX = 1.0;
  const scaleY = 1.0; // fix: Y axis now matches map image orientation
  
  // Apply small offset to shift overlays left and higher
  const pixelX = refPixelCoord[0] + deltaX * scaleX - 85;
  const pixelY = refPixelCoord[1] + deltaY * scaleY - 75;
  
  return [pixelX, pixelY];
}

// Helper function to get territory at a specific coordinate
export function getTerritoryAtCoord(coord: [number, number], territories: Record<string, Territory>): { name: string; territory: Territory } | null {
  for (const [name, territory] of Object.entries(territories)) {
    const { start, end } = territory.location;
    if (
      coord[0] >= Math.min(start[0], end[0]) &&
      coord[0] <= Math.max(start[0], end[0]) &&
      coord[1] >= Math.min(start[1], end[1]) &&
      coord[1] <= Math.max(start[1], end[1])
    ) {
      return { name, territory };
    }
  }
  return null;
}

// Helper function to get guild color
// Athena API guild color cache
let athenaGuildColorMap: Record<string, string> = {};
// Fetch colors at module load
(async () => {
  try {
    const res = await fetch("https://athena.wynntils.com/cache/get/guildList");
    if (res.ok) {
      const guilds = await res.json();
      athenaGuildColorMap = {};
      for (const g of guilds) {
        if (g.prefix && g.color) {
          athenaGuildColorMap[g.prefix.toUpperCase()] = g.color;
        }
      }
    }
  } catch (e) {
    // fallback silently
  }
})();

// Synchronous color getter
export function getGuildColor(guildName: string, guildPrefix?: string): string {
  function isValidHexColor(hex: string | undefined): boolean {
    return typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex);
  }
  const colorByPrefix = guildPrefix ? athenaGuildColorMap[guildPrefix.toUpperCase()] : undefined;
  const colorByName = guildName ? athenaGuildColorMap[guildName.toUpperCase()] : undefined;
  if (isValidHexColor(colorByPrefix)) {
    return colorByPrefix!;
  }
  if (isValidHexColor(colorByName)) {
    return colorByName!;
  }
  // Always return gray if no valid color found or color is invalid
  return "#666666";
}
