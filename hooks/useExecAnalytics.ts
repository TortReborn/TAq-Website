import useSWR from 'swr';
import { fetcher } from './fetcher';

export interface OverviewData {
  uniqueUsers: number;
  totalPageViews: number;
  totalLogins: number;
  avgSessionDuration: number;
  topPages: { page: string; views: number; uniqueUsers: number; avgDuration: number }[];
  topUsers: { discordId: string; ign: string; views: number; lastSeen: string }[];
}

export interface LoginsData {
  daily: { day: string; count: number }[];
  recent: { discord_id: string; ign: string; rank: string; role: string; created_at: string }[];
}

export interface PageviewsData {
  summary: { page: string; views: number; uniqueUsers: number; sessions: number; avgDuration: number }[];
  recent: { discord_id: string; ign: string; page_path: string; duration_ms: number; session_id: string; created_at: string }[];
}

export interface ActionsData {
  actions: { label: string; type: string; page: string; count: number; lastUsed: string; uniqueUsers: number }[];
}

export interface UsersData {
  users: { discordId: string; ign: string; totalViews: number; totalActions: number; lastSeen: string; topPage: string }[];
}

function buildUrl(metric: string, from?: string, to?: string, page?: string) {
  const params = new URLSearchParams({ metric });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (page) params.set('page', page);
  return `/api/exec/analytics?${params.toString()}`;
}

export function useAnalyticsOverview(from?: string, to?: string) {
  const { data, error, isLoading, mutate } = useSWR<OverviewData>(
    buildUrl('overview', from, to),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );
  return { data: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: () => mutate() };
}

export function useAnalyticsLogins(from?: string, to?: string) {
  const { data, error, isLoading, mutate } = useSWR<LoginsData>(
    buildUrl('logins', from, to),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );
  return { data: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: () => mutate() };
}

export function useAnalyticsPageviews(from?: string, to?: string, page?: string) {
  const { data, error, isLoading, mutate } = useSWR<PageviewsData>(
    buildUrl('pageviews', from, to, page),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );
  return { data: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: () => mutate() };
}

export function useAnalyticsActions(from?: string, to?: string, page?: string) {
  const { data, error, isLoading, mutate } = useSWR<ActionsData>(
    buildUrl('actions', from, to, page),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );
  return { data: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: () => mutate() };
}

export function useAnalyticsUsers(from?: string, to?: string) {
  const { data, error, isLoading, mutate } = useSWR<UsersData>(
    buildUrl('users', from, to),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );
  return { data: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: () => mutate() };
}
