import useSWR from 'swr';
import { fetcher } from './fetcher';

export function useGraidEvent() {
  const { data, error, isLoading, mutate } = useSWR('/api/graid-event', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  return {
    eventData: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
  };
}
