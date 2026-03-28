import useSWR from 'swr';
import { fetcher } from './fetcher';
import type { PlayerSnipeStats } from '@/lib/snipe-stats';

export function useProfileSnipeStats() {
  const { data, error, isLoading } = useSWR<{ stats: PlayerSnipeStats }>(
    '/api/profile/snipe-stats',
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  );

  return {
    stats: data?.stats ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}
