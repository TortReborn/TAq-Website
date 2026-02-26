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
// Calibrated for fruma_map.png (4262x6644) using Detlas as reference.
export function coordToPixel(coord: [number, number]): [number, number] {
  // Using Detlas as reference point:
  // Game coordinate [402, -1657] maps to pixel [3049, 5052] on fruma_map.png
  const refGameCoord = [402, -1657];
  const refPixelCoord = [3049, 5052];

  // Calculate offset from reference point
  const deltaX = coord[0] - refGameCoord[0];
  const deltaY = coord[1] - refGameCoord[1];

  // Adjusted scale factors
  const scaleX = 1.0;
  const scaleY = 1.0;

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

// Guild color cache - client side
let guildColorCache: Record<string, string> | null = null;
let guildColorCacheTimestamp: number = 0;
const GUILD_COLOR_CACHE_TTL = 300000; // 5 minutes

// Validate hex color format
function isValidHexColor(color: string | undefined): boolean {
  if (!color) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

// Load all cached guild colors from database
export async function loadGuildColors(guildNames: string[]): Promise<Record<string, string>> {
  try {
    // Check if we have a valid client-side cache
    const now = Date.now();
    if (guildColorCache && (now - guildColorCacheTimestamp) < GUILD_COLOR_CACHE_TTL) {
      // Return from cache
      const result: Record<string, string> = {};
      for (const name of guildNames) {
        if (name === 'Unclaimed') {
          result[name] = '#808080';
        } else {
          // Try prefix first, then guild name - only use valid hex colors
          const lowerName = name.toLowerCase();
          const cachedColor = guildColorCache[lowerName];
          result[name] = isValidHexColor(cachedColor) ? cachedColor : '#FFFFFF';
        }
      }
      return result;
    }

    // Fetch all cached guild colors from database (no external API calls)
    const response = await fetch('/api/guild-colors/cached');

    if (!response.ok) {
      console.warn('Failed to fetch cached guild colors');
      // Return white for all guilds (gray for Unclaimed)
      const result: Record<string, string> = {};
      for (const name of guildNames) {
        result[name] = name === 'Unclaimed' ? '#808080' : '#FFFFFF';
      }
      return result;
    }

    const data = await response.json();
    const { guildColors } = data;

    // Update client-side cache with all guild colors
    guildColorCache = {};
    for (const [key, color] of Object.entries(guildColors)) {
      guildColorCache[key.toLowerCase()] = color as string;
    }
    guildColorCacheTimestamp = now;

    // Build result map for requested guilds
    const result: Record<string, string> = {};
    for (const name of guildNames) {
      if (name === 'Unclaimed') {
        result[name] = '#808080';
      } else {
        // Try exact match first, then lowercase - only use valid hex colors
        const lowerName = name.toLowerCase();
        const candidates = [guildColors[name], guildColors[lowerName], guildColorCache[lowerName]];
        const validColor = candidates.find(c => isValidHexColor(c));
        result[name] = validColor || '#FFFFFF';
      }
    }

    return result;

  } catch (error) {
    console.error('Error loading cached guild colors:', error);
    // Return white for all guilds on error (gray for Unclaimed)
    const result: Record<string, string> = {};
    for (const name of guildNames) {
      result[name] = name === 'Unclaimed' ? '#808080' : '#FFFFFF';
    }
    return result;
  }
}

// Single guild color helper (uses cached colors only)
export async function getGuildColor(guildName: string, guildPrefix?: string): Promise<string> {
  if (!guildName || guildName === 'Unclaimed') {
    return '#808080';
  }

  // Check client-side cache first
  const now = Date.now();
  if (guildColorCache && (now - guildColorCacheTimestamp) < GUILD_COLOR_CACHE_TTL) {
    // Try prefix first - only use valid hex colors
    if (guildPrefix) {
      const prefixColor = guildColorCache[guildPrefix.toLowerCase()];
      if (isValidHexColor(prefixColor)) return prefixColor;
    }
    // Try guild name
    const nameColor = guildColorCache[guildName.toLowerCase()];
    if (isValidHexColor(nameColor)) return nameColor;

    // Not in cache or invalid color, return white
    return '#FFFFFF';
  }

  // Load all cached colors once and use for this guild
  const colors = await loadGuildColors([guildName]);
  return colors[guildName] || '#FFFFFF';
}

// Convert hex color to RGB
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Calculate relative luminance of a color (0 = black, 1 = white)
export function getColorLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5; // Default to mid-luminance if invalid

  // Convert to sRGB
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  // Apply gamma correction
  const rLinear = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gLinear = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bLinear = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  // Calculate luminance
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

// Adjust color for better contrast against backgrounds
// In dark mode: if color is too dark, lighten it
// In light mode: if color is too light, darken it
export function getContrastColor(hex: string, isDarkMode: boolean = true): string {
  const luminance = getColorLuminance(hex);
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  if (isDarkMode) {
    // In dark mode: dark colors need to be lightened
    if (luminance < 0.15) {
      // Lighten the color by mixing with white
      const factor = 0.4; // How much to lighten
      const r = Math.round(rgb.r + (255 - rgb.r) * factor);
      const g = Math.round(rgb.g + (255 - rgb.g) * factor);
      const b = Math.round(rgb.b + (255 - rgb.b) * factor);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
  } else {
    // In light mode: light colors need to be darkened
    if (luminance > 0.6) {
      // Darken the color by reducing values
      const factor = 0.35; // How much to darken
      const r = Math.round(rgb.r * (1 - factor));
      const g = Math.round(rgb.g * (1 - factor));
      const b = Math.round(rgb.b * (1 - factor));
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
  }

  return hex;
}
