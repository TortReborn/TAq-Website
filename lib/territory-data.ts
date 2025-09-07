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
}

// Legacy interface for territories_verbose.json (if we ever need it)
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

// Coordinate conversion utility
// Reference point: pixel 2787, 4991 corresponds to coordinate 404, -1581
export function coordToPixel(coord: [number, number]): [number, number] {
  const refPixel = [2787, 4991];
  const refCoord = [404, -1581];
  
  // Calculate scale factor based on reference point
  // This is a simplified linear transformation - you may need to adjust these values
  const scaleX = 2.5; // Approximate pixels per coordinate unit (adjust based on testing)
  const scaleY = -2.5; // Negative because Y coordinates are inverted on screen
  
  const pixelX = refPixel[0] + (coord[0] - refCoord[0]) * scaleX;
  const pixelY = refPixel[1] + (coord[1] - refCoord[1]) * scaleY;
  
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
export function getGuildColor(guildName: string): string {
  switch (guildName) {
    case "The Aquarium":
      return "#00ff88";
    case "":
      return "#666666"; // Neutral/unclaimed
    default:
      return "#ff4444"; // Enemy guilds
  }
}

// Function to load territories from the Wynncraft API or local JSON
export async function loadTerritories(): Promise<Record<string, Territory>> {
  try {
    // First try to load from the API
    const apiResponse = await fetch('https://api.wynncraft.com/v3/guild/list/territory');
    if (apiResponse.ok) {
      const territories = await apiResponse.json();
      return territories;
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
        location: verboseTerritory.Location
      };
    }
    
    return territories;
  } catch (error) {
    console.error('Error loading territories:', error);
    return {};
  }
}
