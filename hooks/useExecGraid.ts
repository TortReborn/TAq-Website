import useSWR from 'swr';
import { fetcher } from './fetcher';
import type { ActiveEvent, Row } from '@/lib/graid';

export interface GraidEvent {
  id: number;
  title: string;
  startTs: string;
  endTs: string | null;
  active: boolean;
  lowRankReward: number;
  highRankReward: number;
  minCompletions: number;
  bonusThreshold: number | null;
  bonusAmount: number | null;
  createdAt: string;
}

interface GraidListData {
  events: GraidEvent[];
}

interface LeaderboardData {
  event: ActiveEvent;
  rows: Row[];
}

export function useExecGraid() {
  const { data, error, isLoading, mutate } = useSWR<GraidListData>(
    '/api/exec/graid',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  const createEvent = async (eventData: {
    title: string;
    lowRankReward: number;
    highRankReward: number;
    minCompletions: number;
    bonusThreshold?: number;
    bonusAmount?: number;
  }) => {
    const res = await fetch('/api/exec/graid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create event');
    mutate();
    return data;
  };

  const updateEvent = async (id: number, updates: Record<string, any>) => {
    const res = await fetch(`/api/exec/graid/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update event');
    mutate();
    return data;
  };

  const endEvent = async (id: number) => {
    return updateEvent(id, { active: false });
  };

  return {
    events: data?.events ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    createEvent,
    updateEvent,
    endEvent,
  };
}

export function useExecGraidLeaderboard(eventId: number | null) {
  const { data, error, isLoading, mutate } = useSWR<LeaderboardData>(
    eventId ? `/api/exec/graid/${eventId}/leaderboard` : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  return {
    event: data?.event ?? null,
    rows: data?.rows ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
  };
}
