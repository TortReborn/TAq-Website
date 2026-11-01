export function fmtInt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
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
  /**
   * Live per-resource data from the Wynncraft API (array form). `generation` is the
   * CURRENT production (base × the owning guild's bonuses); `baseGeneration` is the
   * intrinsic base. Absent in history mode (snapshots only carry ownership).
   */
  resources?: LiveResource[];
  "Trading Routes"?: string[];
  links?: string[];
  /** True when this territory is the owning guild's headquarters (live API field). */
  hq?: boolean;
  /** Live defence rating from the Wynncraft API. */
  defences?: TerritoryDefence;
  /** Live treasury rating from the Wynncraft API. */
  treasury?: TerritoryTreasury;
}

export type TerritoryDefence = 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
export type TerritoryTreasury = 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export type LiveResourceType = 'EMERALD' | 'ORE' | 'WOOD' | 'FISH' | 'CROP';

export interface LiveResource {
  type: LiveResourceType;
  /** Current production per hour (base × the owning guild's bonuses). */
  generation: number;
  /** Intrinsic base production per hour (owner-independent). */
  baseGeneration: number;
  stored: number;
  limit: number;
}

// Map the live API resource-type enum to the verbose object keys used elsewhere.
const LIVE_RESOURCE_KEY: Record<LiveResourceType, string> = {
  EMERALD: 'emeralds',
  ORE: 'ore',
  WOOD: 'wood',
  FISH: 'fish',
  CROP: 'crops',
};

/**
 * Pull CURRENT production per resource from a territory's live API resources array,
 * keyed by verbose key (emeralds/ore/wood/fish/crops). Returns null when the live
 * array is unavailable (e.g. history mode), so callers can fall back to base-only.
 */
export function currentGenerationByKey(territory: Territory): Record<string, number> | null {
  const res = territory.resources;
  if (!Array.isArray(res)) return null;
  const out: Record<string, number> = {};
  for (const r of res) {
    const key = LIVE_RESOURCE_KEY[r.type];
    if (key) out[key] = r.generation;
  }
  return out;
}

// Function to load territories from the database cache (managed by external bot)
export async function loadTerritories(): Promise<Record<string, Territory>> {
  try {
    // The map page inlines a script that starts this fetch before hydration —
    // consume that in-flight result once instead of fetching again
    const early = (window as unknown as { __earlyTerritories?: Promise<Record<string, Territory> | null> }).__earlyTerritories;
    if (early) {
      (window as unknown as { __earlyTerritories?: unknown }).__earlyTerritories = undefined;
      const result = await early;
      if (result && !('error' in result)) return result;
    }

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
// Calibrated for the fruma map image (4262x6644) using Detlas as reference.
export function coordToPixel(coord: [number, number]): [number, number] {
  // Using Detlas as reference point:
  // Game coordinate [402, -1657] maps to pixel [3049, 5052] on the fruma map image
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
