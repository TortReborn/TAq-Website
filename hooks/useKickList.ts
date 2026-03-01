import useSWR from 'swr';
import { fetcher } from './fetcher';

export interface KickListEntry {
  uuid: string;
  ign: string;
  tier: number;
  addedBy: string;
  createdAt: string;
}

interface KickListData {
  entries: KickListEntry[];
  lastUpdated: string | null;
  lastUpdatedBy: string | null;
}

export function useKickList() {
  const { data, error, isLoading, mutate } = useSWR<KickListData>(
    '/api/exec/kick-list',
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 60000,
      dedupingInterval: 10000,
    }
  );

  const addToKickList = async (uuid: string, ign: string, tier: number) => {
    await fetch('/api/exec/kick-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, ign, tier }),
    });
    mutate();
  };

  const removeFromKickList = async (uuid: string) => {
    await fetch('/api/exec/kick-list', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid }),
    });
    mutate();
  };

  const changeTier = async (uuid: string, tier: number) => {
    await fetch('/api/exec/kick-list', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, tier }),
    });
    mutate();
  };

  return {
    entries: data?.entries ?? [],
    lastUpdated: data?.lastUpdated ?? null,
    lastUpdatedBy: data?.lastUpdatedBy ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    addToKickList,
    removeFromKickList,
    changeTier,
  };
}
