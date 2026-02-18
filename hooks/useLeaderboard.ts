import useSWR from 'swr';
import { fetcher } from './fetcher';

export function useLeaderboard() {
  const { data, error, isLoading, mutate } = useSWR('/api/members/activity', fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 60000,
    dedupingInterval: 30000,
  });

  return {
    membersData: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
  };
}
