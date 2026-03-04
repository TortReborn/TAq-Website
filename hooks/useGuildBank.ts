import useSWR from 'swr';
import { fetcher } from './fetcher';

export interface GuildBankTransaction {
  id: number;
  playerName: string;
  action: 'deposited' | 'withdrew';
  itemCount: number;
  itemName: string;
  bankType: string;
  firstReported: string;
  reportCount: number;
}

interface GuildBankData {
  transactions: GuildBankTransaction[];
}

export function useGuildBank() {
  const { data, error, isLoading, mutate } = useSWR<GuildBankData>(
    '/api/exec/guild-bank',
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 120000,
      dedupingInterval: 30000,
    }
  );

  return {
    transactions: data?.transactions ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
  };
}
