import useSWR from 'swr';
import { fetcher } from './fetcher';

export function useLootruns() {
  const { data, error, isLoading } = useSWR('/api/lootpools/lootruns', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120000,
  });

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}

export function useAspects() {
  const { data, error, isLoading } = useSWR('/api/lootpools/aspects', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120000,
  });

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}
