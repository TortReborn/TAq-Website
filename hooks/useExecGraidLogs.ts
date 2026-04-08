import useSWR from 'swr';
import { fetcher } from './fetcher';

// --- Types ---

export interface GraidLogParticipant {
  ign: string;
  uuid: string | null;
}

export interface GraidLog {
  id: number;
  raidType: string | null;
  completedAt: string;
  participants: GraidLogParticipant[];
}

export interface GraidLogFilters {
  page?: number;
  perPage?: number;
  raidType?: string;
  ign?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
}

export interface GraidLogMetaData {
  igns: string[];
  raidTypes: string[];
  guildMembers: string[];
}

export interface GraidLogLeaderboardPlayer {
  ign: string;
  total: number;
  notg: number;
  tcc: number;
  tna: number;
  nol: number;
  unknown: number;
}

export interface GraidLogPlayerStats {
  ign: string;
  total: number;
  raidTypeCounts: Record<string, number>;
  bestStreak: number;
  currentStreak: number;
  ranking: number;
  firstRaid: string;
  latestRaid: string;
  bestDay: { date: string; count: number };
  topTeammates: { ign: string; count: number }[];
  recentRaids: {
    id: number;
    raidType: string | null;
    completedAt: string;
    participants: GraidLogParticipant[];
  }[];
  duoPartners: { ign: string; count: number }[];
  activityByDay: Record<string, number>;
}

export interface GraidLogDashboardData {
  totalRaids: number;
  uniqueParticipants: number;
  mostActivePlayer: { ign: string; count: number } | null;
  raidTypeDistribution: { type: string; fullName: string | null; count: number }[];
  raidsOverTime: { week: string; count: number }[];
  topPlayers: { ign: string; count: number }[];
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

export function useExecGraidLogMeta() {
  const { data, error, isLoading, mutate } = useSWR<GraidLogMetaData>(
    '/api/exec/guild-raids/meta',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60000, dedupingInterval: 30000 }
  );

  return {
    igns: data?.igns || [],
    raidTypes: data?.raidTypes || [],
    guildMembers: data?.guildMembers || [],
    loading: isLoading,
    error,
    mutate,
  };
}

export function useExecGraidLogs(filters: GraidLogFilters) {
  const key = buildQuery('/api/exec/guild-raids', {
    page: filters.page,
    perPage: filters.perPage,
    raidType: filters.raidType,
    ign: filters.ign,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sort: filters.sort,
  });

  const { data, error, isLoading, mutate } = useSWR<{ logs: GraidLog[]; total: number; page: number; perPage: number }>(
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

export function useExecGraidLogLeaderboard(sort: string, dateFrom?: string, dateTo?: string) {
  const key = buildQuery('/api/exec/guild-raids/leaderboard', { sort, dateFrom, dateTo });

  const { data, error, isLoading } = useSWR<{ players: GraidLogLeaderboardPlayer[] }>(
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

export function useExecGraidLogStats(ign: string | null) {
  const { data, error, isLoading } = useSWR<{ stats: GraidLogPlayerStats }>(
    ign ? buildQuery('/api/exec/guild-raids/stats', { ign }) : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  return {
    stats: data?.stats || null,
    loading: isLoading,
    error,
  };
}

export function useExecGraidLogDashboard(dateFrom?: string, dateTo?: string) {
  const { data, error, isLoading } = useSWR<{ data: GraidLogDashboardData }>(
    buildQuery('/api/exec/guild-raids/dashboard', { dateFrom, dateTo }),
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  return {
    data: data?.data || null,
    loading: isLoading,
    error,
  };
}

export function useExecGraidLogMutations() {
  const deleteLog = async (id: number) => {
    const res = await fetch(`/api/exec/guild-raids/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete graid log');
    return data;
  };

  const createLog = async (raidType: string, participants: string[]) => {
    const res = await fetch('/api/exec/guild-raids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raidType, participants }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to log guild raid');
    return data;
  };

  return { deleteLog, createLog };
}
