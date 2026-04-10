// Valid build role categories
export const BUILD_ROLE_OPTIONS = ['DPS', 'HEALER', 'TANK'] as const;
export type BuildRole = (typeof BUILD_ROLE_OPTIONS)[number];

// Role category colors (used as defaults when creating new builds)
export const ROLE_COLORS: Record<BuildRole, string> = {
  DPS: '#ef4444',
  HEALER: '#22c55e',
  TANK: '#3b82f6',
};

// A single version of a build (Conns/HQ links + metadata).
export interface BuildVersion {
  major: number;
  minor: number;
  connsUrl: string;
  hqUrl: string;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
}

// Build definition as returned from the API
export interface BuildDefinition {
  key: string;
  name: string;
  role: BuildRole;
  color: string;
  sortOrder: number;
  versions: BuildVersion[];                                 // newest first
  latestVersion: { major: number; minor: number } | null;
}

// A version reference attached to a member.
export interface VersionRef {
  major: number;
  minor: number;
}

export const formatVersion = (v: VersionRef): string => `${v.major}.${v.minor}`;

export const versionsEqual = (a: VersionRef, b: VersionRef): boolean =>
  a.major === b.major && a.minor === b.minor;

// Sort newest-first (descending major, then descending minor).
export const compareVersionsDesc = (a: VersionRef, b: VersionRef): number => {
  if (a.major !== b.major) return b.major - a.major;
  return b.minor - a.minor;
};

// Compute the next version number from the latest, applying the
// "minor rolls into major at .10" rule the user wants:
//   1.0 -> 1.1 -> ... -> 1.9 -> 2.0
// A 'major' bump always goes to (latest.major + 1).0.
export const computeNextVersion = (
  latest: VersionRef | null,
  bump: 'minor' | 'major'
): VersionRef => {
  if (!latest) return { major: 1, minor: 0 };
  if (bump === 'major') return { major: latest.major + 1, minor: 0 };
  const nextMinor = latest.minor + 1;
  if (nextMinor >= 10) return { major: latest.major + 1, minor: 0 };
  return { major: latest.major, minor: nextMinor };
};

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
