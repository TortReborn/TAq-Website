import useSWR from 'swr';
import { fetcher } from './fetcher';

export interface GuildMember {
  uuid: string;
  ign: string;
  rank: string;
  playtime7d: number;
  wars7d: number;
  raids7d: number;
  hasStats: boolean;
}

export interface QueueEntry {
  id: number;
  uuid: string;
  ign: string;
  currentRank: string;
  newRank: string | null;
  actionType: 'promote' | 'demote' | 'remove';
  queuedByIgn: string;
  createdAt: string;
  status: 'pending' | 'completed' | 'failed';
  completedAt: string | null;
  errorMessage: string | null;
}

export interface PromoSuggestion {
  id: number;
  uuid: string;
  ign: string;
  currentRank: string;
  suggestedByIgn: string;
  createdAt: string;
}

interface PromotionsData {
  members: GuildMember[];
  pendingQueue: QueueEntry[];
  recentHistory: QueueEntry[];
  promoSuggestions: PromoSuggestion[];
}

export function useExecPromotions() {
  const { data, error, isLoading, mutate } = useSWR<PromotionsData>(
    '/api/exec/promotions',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 10000, dedupingInterval: 5000 }
  );

  const queuePromotion = async (entry: {
    uuid: string;
    ign: string;
    currentRank: string;
    newRank: string | null;
    actionType: 'promote' | 'demote' | 'remove';
  }) => {
    const res = await fetch('/api/exec/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to queue promotion');
    mutate();
    return data;
  };

  const queueBulkPromotions = async (entries: {
    uuid: string;
    ign: string;
    currentRank: string;
    newRank: string | null;
    actionType: 'promote' | 'demote' | 'remove';
  }[]) => {
    const res = await fetch('/api/exec/promotions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to queue bulk promotions');
    mutate();
    return data;
  };

  const cancelQueueEntry = async (id: number) => {
    await fetch(`/api/exec/promotions/${id}`, { method: 'DELETE' });
    mutate();
  };

  const suggestPromotion = async (uuid: string, ign: string, currentRank: string) => {
    const res = await fetch('/api/exec/promotions/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, ign, currentRank }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to suggest promotion');
    mutate();
    return data;
  };

  const removeSuggestion = async (id: number) => {
    const res = await fetch(`/api/exec/promotions/suggest?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove suggestion');
    mutate();
    return data;
  };

  return {
    members: data?.members ?? [],
    pendingQueue: data?.pendingQueue ?? [],
    recentHistory: data?.recentHistory ?? [],
    promoSuggestions: data?.promoSuggestions ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    queuePromotion,
    queueBulkPromotions,
    cancelQueueEntry,
    suggestPromotion,
    removeSuggestion,
  };
}
