import useSWR from 'swr';
import { fetcher } from './fetcher';

export interface ExecMember {
  username: string;
  uuid: string;
  online: boolean;
  server: string | null;
  discordRank: string;
  guildRankName: string;
  contributed: number;
  totalPlaytime: number;
  totalWars: number;
  totalRaids: number;
  joined: string | null;
  lastJoin: string | null;
  inactiveDays: number | null;
  timeFrames: Record<string, {
    playtime: number;
    wars: number;
    raids: number;
    shells: number;
    contributed: number;
    hasCompleteData: boolean;
  }>;
  isNewMember: boolean;
  daysInGuild: number;
  kickRankScore: number;
}

interface ExecActivityData {
  members: ExecMember[];
  weeklyRequirement: number;
  pendingJoins: number;
}

export function useExecActivity() {
  const { data, error, isLoading, mutate } = useSWR<ExecActivityData>(
    '/api/exec/activity',
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 120000, // 2 minutes
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
