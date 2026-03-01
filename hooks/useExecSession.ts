import useSWR from 'swr';
import { fetcher } from './fetcher';

interface ExecUser {
  discord_id: string;
  discord_username: string;
  discord_avatar: string;
  ign: string;
  rank: string;
}

interface ExecSessionResponse {
  authenticated: boolean;
  user?: ExecUser;
}

export function useExecSession() {
  const { data, error, isLoading, mutate } = useSWR<ExecSessionResponse>(
    '/api/auth/exec-session',
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 5 * 60 * 1000, // recheck every 5 minutes
      dedupingInterval: 30000,
      // Don't throw on 401 - treat it as unauthenticated
      shouldRetryOnError: false,
    }
  );

  return {
    user: data?.user ?? null,
    authenticated: data?.authenticated ?? false,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
  };
}
