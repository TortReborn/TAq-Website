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

// Function to load territories from the database cache (managed by external bot)
export async function loadTerritories(): Promise<Record<string, Territory>> {
  try {
    // Load from our API proxy - no fallbacks, cache managed by external bot
    const apiResponse = await fetch('/api/territories', {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (apiResponse.ok) {
      const result = await apiResponse.json();
      // Check if the response contains an error
      if (result.error) {
        console.warn('Territory API error:', result.error);
        return {};
      }
      return result;
    }
    
    console.warn('Failed to load territories from cache, status:', apiResponse.status);
    return {};
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
// Note: Guild colors are now managed by external bot and included in guild data
// This function provides fallback colors for display
export function getGuildColor(guildName: string, guildPrefix?: string): string {
  // Define some common known guild colors as fallback
  const knownGuildColors: Record<string, string> = {
    'AQU': '#0066CC', // The Aquarium - blue
    'ANK': '#8B0000', // Ankh - dark red
    'AVO': '#228B22', // Avicia - green
    'ICO': '#FFD700', // Icon - gold
    'IMP': '#8A2BE2', // Imperium - purple
    'SUN': '#FF8C00', // Sundal - orange
    'TNA': '#DC143C', // The Aquarium - red variant
  };

  // Check if we have a known color for the prefix
  if (guildPrefix && knownGuildColors[guildPrefix.toUpperCase()]) {
    return knownGuildColors[guildPrefix.toUpperCase()];
  }

  // Check if we have a known color for the name
  if (guildName && knownGuildColors[guildName.toUpperCase()]) {
    return knownGuildColors[guildName.toUpperCase()];
  }

  // Generate a consistent color based on guild name/prefix
  const text = guildPrefix || guildName || 'default';
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert to color, ensuring it's not too dark or too light
  const hue = Math.abs(hash) % 360;
  const saturation = 60 + (Math.abs(hash) % 30); // 60-90%
  const lightness = 40 + (Math.abs(hash) % 20); // 40-60%
  
  // Convert HSL to hex
  const hslToHex = (h: number, s: number, l: number) => {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  
  return hslToHex(hue, saturation, lightness);
}
