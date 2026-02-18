import useSWR from 'swr';
import { fetcher } from './fetcher';

export function useMembers() {
  const { data, error, isLoading, mutate } = useSWR('/api/members', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 30000,
  });

  return {
    membersData: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
  };
}
