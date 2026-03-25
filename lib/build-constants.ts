// Valid build role categories
export const BUILD_ROLE_OPTIONS = ['DPS', 'HEALER', 'TANK'] as const;
export type BuildRole = (typeof BUILD_ROLE_OPTIONS)[number];

// Role category colors (used as defaults when creating new builds)
export const ROLE_COLORS: Record<BuildRole, string> = {
  DPS: '#ef4444',
  HEALER: '#22c55e',
  TANK: '#3b82f6',
};

// Build definition as returned from the API
export interface BuildDefinition {
  key: string;
  name: string;
  role: BuildRole;
  color: string;
  connsUrl: string;
  hqUrl: string;
  sortOrder: number;
}

// Member war flags
export const MEMBER_FLAGS = {
  frequent_sniper: { label: 'Frequent Sniper' },
  alt: { label: 'Alt' },
} as const;

export const FLAG_KEYS = ['frequent_sniper', 'alt'] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

export function isValidFlagKey(key: string): key is FlagKey {
  return FLAG_KEYS.includes(key as FlagKey);
}
