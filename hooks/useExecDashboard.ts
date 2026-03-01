import useSWR from 'swr';
import { fetcher } from './fetcher';

interface VoteSummary {
  accept: number;
  deny: number;
  abstain: number;
}

interface RecentApplication {
  id: number;
  type: string;
  username: string;
  status: string;
  submittedAt: string;
  votes: VoteSummary;
}

interface GuildStats {
  totalMembers: number;
  onlineMembers: number;
  name: string;
}

interface DashboardData {
  pendingApplications: number;
  recentApplications: RecentApplication[];
  guild: GuildStats;
}

export function useExecDashboard() {
  const { data, error, isLoading, mutate } = useSWR<DashboardData>(
    '/api/exec/dashboard',
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 60000,
      dedupingInterval: 30000,
    }
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
  };
}
