import useSWR from 'swr';
import { fetcher } from './fetcher';

// --- Types ---

export interface SnipeParticipant {
  ign: string;
  role: 'Tank' | 'Healer' | 'DPS';
}

export interface SnipeLog {
  id: number;
  hq: string;
  difficulty: number;
  snipedAt: string;
  guildTag: string;
  conns: number;
  loggedBy: string;
  season: number;
  participants: SnipeParticipant[];
}

export interface SnipeFilters {
  page?: number;
  perPage?: number;
  season?: number | null; // null = current, 0 = all
  hq?: string;
  guildTag?: string;
  ign?: string;
  diffMin?: number;
  diffMax?: number;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
}

export interface SnipeMetaData {
  territories: string[];
  routeCounts: Record<string, number>;
  currentSeason: number;
  igns: string[];
  snipedHqs: string[];
  seasonsWithData: number[];
  guildMembers: string[];
}

export interface LeaderboardPlayer {
  ign: string;
  total: number;
  bestDifficulty: number;
  bestHq: string;
  bestStreak: number;
  currentStreak: number;
}

export interface PlayerStats {
  ign: string;
  total: number;
  bestDifficulty: number;
  bestHq: string;
  bestStreak: number;
  currentStreak: number;
  ranking: number;
  firstSnipe: string;
  latestSnipe: string;
  uniqueGuilds: number;
  uniqueHqs: number;
  zeroConnSnipes: number;
  drySnipes: number;
  bestDay: { date: string; count: number };
  topGuilds: { tag: string; count: number }[];
  topHqs: { name: string; count: number }[];
  topTeammates: { ign: string; count: number }[];
  roleBreakdown: { role: string; count: number }[];
  recentSnipes: SnipeLog[];
  duoPartners: { ign: string; count: number; bestDifficulty: number }[];
  activityByDay: Record<string, number>; // day name → count
}

export interface DashboardData {
  totalSnipes: number;
  uniqueParticipants: number;
  mostSnipedGuild: { tag: string; count: number } | null;
  hardestSnipe: { id: number; hq: string; difficulty: number; guildTag: string } | null;
  snipesOverTime: { week: string; count: number }[];
  difficultyDistribution: { bucket: string; count: number }[];
  guildBreakdown: { tag: string; count: number }[];
  hqFrequency: { name: string; count: number }[];
  roleDistribution: { role: string; count: number }[];
  seasonComparison: { season: number; count: number }[];
}

// --- Hooks ---

function buildQuery(base: string, params: Record<string, any>): string {
  const url = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.set(k, String(v));
  }
  const qs = url.toString();
  return qs ? `${base}?${qs}` : base;
}

export function useExecSnipeMeta() {
  const { data, error, isLoading } = useSWR<SnipeMetaData>(
    '/api/exec/snipes/meta',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60000, dedupingInterval: 30000 }
  );

  return {
    territories: data?.territories || [],
    routeCounts: data?.routeCounts || {},
    currentSeason: data?.currentSeason ?? 1,
    igns: data?.igns || [],
    snipedHqs: data?.snipedHqs || [],
    seasonsWithData: data?.seasonsWithData || [],
    guildMembers: data?.guildMembers || [],
    loading: isLoading,
    error,
  };
}

export function useExecSnipeLogs(filters: SnipeFilters) {
  const key = buildQuery('/api/exec/snipes', {
    page: filters.page,
    perPage: filters.perPage,
    season: filters.season,
    hq: filters.hq,
    guildTag: filters.guildTag,
    ign: filters.ign,
    diffMin: filters.diffMin,
    diffMax: filters.diffMax,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sort: filters.sort,
  });

  const { data, error, isLoading, mutate } = useSWR<{ logs: SnipeLog[]; total: number; page: number; perPage: number }>(
    key,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  return {
    logs: data?.logs || [],
    total: data?.total || 0,
    page: data?.page || 1,
    perPage: data?.perPage || 25,
    loading: isLoading,
    error,
    refresh: mutate,
  };
}

export function useExecSnipeLeaderboard(sort: string, season: number | null) {
  const key = buildQuery('/api/exec/snipes/leaderboard', { sort, season });

  const { data, error, isLoading } = useSWR<{ players: LeaderboardPlayer[] }>(
    key,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  return {
    players: data?.players || [],
    loading: isLoading,
    error,
  };
}

export function useExecSnipeStats(ign: string | null) {
  const { data, error, isLoading } = useSWR<{ stats: PlayerStats }>(
    ign ? buildQuery('/api/exec/snipes/stats', { ign }) : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  return {
    stats: data?.stats || null,
    loading: isLoading,
    error,
  };
}

export function useExecSnipeDashboard(season: number | null) {
  const { data, error, isLoading } = useSWR<{ data: DashboardData }>(
    buildQuery('/api/exec/snipes/dashboard', { season }),
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  return {
    data: data?.data || null,
    loading: isLoading,
    error,
  };
}

export function useExecSnipeMutations() {
  const createSnipe = async (body: {
    hq: string;
    difficulty: number;
    guildTag: string;
    conns: number;
    snipedAt?: string;
    season?: number;
    participants: SnipeParticipant[];
  }) => {
    const res = await fetch('/api/exec/snipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create snipe');
    return data;
  };

  const updateSnipe = async (id: number, body: {
    hq?: string;
    difficulty?: number;
    guildTag?: string;
    conns?: number;
    snipedAt?: string;
    season?: number;
    participants?: SnipeParticipant[];
  }) => {
    const res = await fetch(`/api/exec/snipes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update snipe');
    return data;
  };

  const deleteSnipe = async (id: number) => {
    const res = await fetch(`/api/exec/snipes/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete snipe');
    return data;
  };

  const bulkAction = async (action: 'delete' | 'update_season', ids: number[], season?: number) => {
    const res = await fetch('/api/exec/snipes/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids, season }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Bulk operation failed');
    return data;
  };

  return { createSnipe, updateSnipe, deleteSnipe, bulkAction };
}
