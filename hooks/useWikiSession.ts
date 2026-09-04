import useSWR from 'swr';
import { fetcher } from './fetcher';
import { hidesChroniclerTools, useViewAs } from './useViewAs';

/**
 * The viewer's standing in the Chronicle.
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

  // "View as" is a preview, and it only ever takes rights away. The server
  // still enforces the real ones, so this cannot grant anything — an action
  // attempted while previewing would be refused by the API regardless.
  const viewAs = useViewAs();
  const masked = hidesChroniclerTools(viewAs);
  const user = data?.user ?? null;

  return {
    user:
      masked && user
        ? { ...user, isChronicler: false, canPublish: false, canReview: false, canManageChroniclers: false }
        : user,
    authenticated: (data?.authenticated ?? false) && viewAs !== 'non-member',
    canPublish: masked ? false : (data?.user?.canPublish ?? false),
    canReview: masked ? false : (data?.user?.canReview ?? false),
    canManageChroniclers: masked ? false : (data?.user?.canManageChroniclers ?? false),
    imageBackend: data?.imageBackend ?? null,
    /** The real answer, ignoring any preview — for the toggle itself. */
    reallyChronicler: data?.user?.isChronicler ?? false,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
  };
}
