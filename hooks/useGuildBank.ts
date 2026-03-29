import useSWR from 'swr';
import { useState, useCallback } from 'react';
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

export interface InventoryItem {
  itemName: string;
  bankType: string;
  quantity: number;
}

export interface GuildBankStats {
  deposits: number;
  withdrawals: number;
  totalItems: number;
  uniqueItems: number;
}

interface GuildBankData {
  transactions: GuildBankTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  inventory: InventoryItem[];
  stats: GuildBankStats;
}

export const PAGE_SIZE_OPTIONS = [100, 250, 500, 1000] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export function useGuildBank() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(() => {
    if (typeof window === 'undefined') return 100;
    const cached = Number(sessionStorage.getItem('guildBank:pageSize'));
    return PAGE_SIZE_OPTIONS.includes(cached as PageSize) ? (cached as PageSize) : 100;
  });

  const { data, error, isLoading, mutate } = useSWR<GuildBankData>(
    `/api/exec/guild-bank?page=${page}&limit=${pageSize}`,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 120000,
      dedupingInterval: 30000,
      keepPreviousData: true,
    }
  );

  const goToPage = useCallback((p: number) => {
    setPage(Math.max(1, p));
  }, []);

  const changePageSize = useCallback((size: PageSize) => {
    setPageSize(size);
    setPage(1);
    sessionStorage.setItem('guildBank:pageSize', String(size));
  }, []);

  return {
    transactions: data?.transactions ?? [],
    inventory: data?.inventory ?? [],
    stats: data?.stats ?? { deposits: 0, withdrawals: 0, totalItems: 0, uniqueItems: 0 },
    total: data?.total ?? 0,
    page: data?.page ?? page,
    pageSize,
    totalPages: data?.totalPages ?? 1,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    goToPage,
    changePageSize,
  };
}
