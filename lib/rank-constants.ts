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

// Promo suggestion visibility: suggestions for members at this rank index or above
// are restricted to PROMO_VISIBILITY_MIN_VIEWER_IDX+ viewers only
export const PROMO_VISIBILITY_RANK_THRESHOLD_IDX = 5; // Hammerhead
export const PROMO_VISIBILITY_MIN_VIEWER_IDX = 8;     // Narwhal

// Wynncraft server ranks (from bot's Helpers/variables.py wynn_ranks)
export const WYNN_RANKS: Record<string, { color: string; display: string }> = {
  champion: { color: '#ffa214', display: 'CHAMPION' },
  heroplus: { color: '#bc3c7c', display: 'HERO+' },
  hero: { color: '#8b3f8c', display: 'HERO' },
  vipplus: { color: '#5a7dbf', display: 'VIP+' },
  vip: { color: '#44aa33', display: 'VIP' },
  media: { color: '#bf3399', display: 'MEDIA' },
  admin: { color: '#d11111', display: 'ADMIN' },
  administrator: { color: '#d11111', display: 'ADMIN' },
  dev: { color: '#d11111', display: 'DEVELOPER' },
  web: { color: '#d11111', display: 'WEB' },
  owner: { color: '#aa0000', display: 'OWNER' },
  moderator: { color: '#ff6a00', display: 'MODERATOR' },
  artist: { color: '#00aaaa', display: 'ARTIST' },
  builder: { color: '#00aaaa', display: 'BUILDER' },
  cmd: { color: '#00aaaa', display: 'CMD' },
  gm: { color: '#00aaaa', display: 'GM' },
  hybrid: { color: '#00aaaa', display: 'HYBRID' },
  item: { color: '#00aaaa', display: 'ITEM' },
  music: { color: '#00aaaa', display: 'MUSIC' },
  qa: { color: '#00aaaa', display: 'QA' },
};

export function getWynnRankInfo(rank: string | null): { color: string; display: string } | null {
  if (!rank) return null;
  const info = WYNN_RANKS[rank.toLowerCase()];
  return info || null;
}
