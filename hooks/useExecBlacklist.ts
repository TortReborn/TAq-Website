import useSWR from 'swr';
import { fetcher } from './fetcher';

export interface BlacklistEntry {
  ign: string;
  reason: string | null;
  createdAt: string;
}

interface BlacklistData {
  entries: BlacklistEntry[];
}

export function useExecBlacklist() {
  const { data, error, isLoading, mutate } = useSWR<BlacklistData>(
    '/api/exec/blacklist',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60000, dedupingInterval: 10000 }
  );

  const addToBlacklist = async (ign: string, reason?: string) => {
    const res = await fetch('/api/exec/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ign, reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add to blacklist');
    mutate();
  };

  const updateReason = async (ign: string, reason: string) => {
    const res = await fetch('/api/exec/blacklist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ign, reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update reason');
    mutate();
  };

  const removeFromBlacklist = async (ign: string) => {
    await fetch('/api/exec/blacklist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ign }),
    });
    mutate();
  };

  return {
    entries: data?.entries ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    addToBlacklist,
    updateReason,
    removeFromBlacklist,
  };
}
