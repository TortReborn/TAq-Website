// Rank display order (1 = highest rank)
export const RANK_ORDER: Record<string, number> = {
  'Hydra': 1, 'Narwhal': 2, 'Dolphin': 3, 'Sailfish': 4,
  'Hammerhead': 5, 'Angler': 6, 'Barracuda': 7, 'Piranha': 8,
  'Manatee': 9, 'Starfish': 10,
};

// Rank colors for display
export const RANK_COLORS: Record<string, string> = {
  'Hydra': '#ac034c', 'Narwhal': '#eb2279', 'Dolphin': '#9d68ff',
  'Sailfish': '#396aff', 'Hammerhead': '#04b0eb', 'Angler': '#00e2db',
  'Barracuda': '#79e64a', 'Piranha': '#c8ff00', 'Manatee': '#ffe226',
  'Starfish': '#e8a41c',
};

// Rank hierarchy from lowest to highest (for promotion/demotion validation)
export const RANK_HIERARCHY = [
  'Starfish', 'Manatee', 'Piranha', 'Barracuda', 'Angler',
  'Hammerhead', 'Sailfish', 'Dolphin', 'Narwhal', 'Hydra',
];

export function getRankColor(rank: string | null | undefined): string {
  return (rank && RANK_COLORS[rank]) || 'var(--text-muted)';
}

export function isValidPromotion(currentRank: string, targetRank: string): boolean {
  return RANK_HIERARCHY.indexOf(targetRank) > RANK_HIERARCHY.indexOf(currentRank);
}

export function isValidDemotion(currentRank: string, targetRank: string): boolean {
  return RANK_HIERARCHY.indexOf(targetRank) < RANK_HIERARCHY.indexOf(currentRank);
}
