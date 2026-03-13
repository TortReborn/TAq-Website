import useSWR from 'swr';
import { fetcher } from './fetcher';

interface ProfileData {
  user: {
    uuid: string;
    ign: string;
    rank: string;
    role: 'exec' | 'member';
    discord_username: string;
    discord_avatar: string;
  };
  stats: {
    playtime: number;
    wars: number;
    raids: number;
    shells: number;
    contributed: number;
    online: boolean;
    server: string | null;
    joined: string | null;
    lastJoin: string | null;
    guildRank: string | null;
  };
  wynnRank: string | null;
  customization: {
    gradient: string[] | string | null;
    backgroundId: number;
  };
  shellsBalance: number;
  timeFrames: Record<string, {
    playtime: number;
    wars: number;
    raids: number;
    shells: number;
    contributed: number;
    hasCompleteData: boolean;
  }>;
  graidEvents: Array<{
    id: number;
    title: string;
    startTs: string | null;
    endTs: string | null;
    completions: number;
  }>;
  totalGraidCompletions: number;
  totalGraidEventsParticipated: number;
}

export function useProfileData() {
  const { data, error, isLoading } = useSWR<ProfileData>(
    '/api/profile',
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
      shouldRetryOnError: false,
    }
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}
