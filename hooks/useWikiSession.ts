import useSWR from 'swr';
import { fetcher } from './fetcher';

/**
 * The viewer's standing in the Chronicles.
 *
 * Separate from useExecSession because a chronicler may never have been in the
 * guild — useExecSession reports them as unauthenticated, which is correct for
 * every other surface and wrong for this one.
 */
export interface WikiUser {
  discordId: string;
  name: string;
  isExec: boolean;
  isChronicler: boolean;
  isGuildMember: boolean;
  canPublish: boolean;
  canReview: boolean;
  canManageChroniclers: boolean;
}

interface WikiSessionResponse {
  authenticated: boolean;
  user?: WikiUser;
  /** Present only for reviewers — which image store this deployment uses. */
  imageBackend?: 'blob' | 'blob-private' | 's3';
}

export function useWikiSession() {
  const { data, error, isLoading, mutate } = useSWR<WikiSessionResponse>(
    '/api/wiki/session',
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 5 * 60 * 1000,
      dedupingInterval: 30000,
      shouldRetryOnError: false,
    },
  );

  return {
    user: data?.user ?? null,
    authenticated: data?.authenticated ?? false,
    canPublish: data?.user?.canPublish ?? false,
    canReview: data?.user?.canReview ?? false,
    canManageChroniclers: data?.user?.canManageChroniclers ?? false,
    imageBackend: data?.imageBackend ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
  };
}
