import useSWR from 'swr';
import { fetcher } from './fetcher';

interface Vote {
  voter_discord_id: string;
  voter_username: string;
  vote: 'accept' | 'deny' | 'abstain';
  source: 'website' | 'discord';
  voted_at: string;
}

interface VoteSummary {
  accept: number;
  deny: number;
  abstain: number;
}

export interface ExecApplication {
  id: number;
  type: string;
  discordId: string;
  discordUsername: string;
  discordAvatar: string | null;
  status: string;
  answers: Record<string, string>;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  guildLeavePending: boolean;
  pollStatus: string | null;
  votes: Vote[];
  voteSummary: VoteSummary;
  userVote: 'accept' | 'deny' | 'abstain' | null;
}

interface ApplicationsData {
  applications: ExecApplication[];
}

export function useExecApplications(statusFilter: string = 'all') {
  const url = statusFilter === 'all'
    ? '/api/exec/applications'
    : `/api/exec/applications?status=${statusFilter}`;

  const { data, error, isLoading, mutate } = useSWR<ApplicationsData>(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 30000, // 30 seconds for live vote updates
      dedupingInterval: 10000,
    }
  );

  return {
    applications: data?.applications ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    mutate,
  };
}
