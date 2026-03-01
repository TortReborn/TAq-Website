import useSWR from 'swr';
import { fetcher } from './fetcher';

export interface BauTopic {
  id: number;
  topic: string;
  description: string | null;
}

export interface RequestedTopic {
  id: number;
  topic: string;
  description: string | null;
  submittedByIgn: string | null;
  createdAt: string;
}

interface BauData { topics: BauTopic[] }
interface RequestedData { topics: RequestedTopic[] }

export function useExecAgendaBau() {
  const { data, error, isLoading, mutate } = useSWR<BauData>(
    '/api/exec/agenda/bau',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  const addTopic = async (topic: string, description?: string) => {
    await fetch('/api/exec/agenda/bau', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, description }),
    });
    mutate();
  };

  const editTopic = async (id: number, topic: string, description?: string) => {
    await fetch('/api/exec/agenda/bau', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, topic, description }),
    });
    mutate();
  };

  const removeTopic = async (id: number) => {
    await fetch('/api/exec/agenda/bau', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    mutate();
  };

  return {
    topics: data?.topics ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    addTopic,
    editTopic,
    removeTopic,
  };
}

export function useExecAgendaRequested() {
  const { data, error, isLoading, mutate } = useSWR<RequestedData>(
    '/api/exec/agenda/requested',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  const submitTopic = async (topic: string, description?: string) => {
    await fetch('/api/exec/agenda/requested', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, description }),
    });
    mutate();
  };

  const removeTopic = async (id: number) => {
    await fetch('/api/exec/agenda/requested', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    mutate();
  };

  return {
    topics: data?.topics ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    submitTopic,
    removeTopic,
  };
}
