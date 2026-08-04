import useSWR from 'swr';
import { fetcher } from './fetcher';

export interface DashboardEvent {
  id: number;
  title: string;
  description: string | null;
  eventDate: string;
  createdAt: string;
  createdBy: string;
}

interface EventsData {
  events: DashboardEvent[];
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  // Checked before parsing: the exec API returns a JSON 401 ({ error: 'Unauthorized' }),
  // which is accurate but not actionable — tell the user what to actually do about it.
  if (res.status === 401) return new Error('Session expired — reload and sign in again.');
  try {
    const d = await res.json();
    return new Error(d.error || fallback);
  } catch {
    return new Error(`${fallback} (HTTP ${res.status})`);
  }
}

export function useExecDashboardEvents() {
  const { data, error, isLoading, mutate } = useSWR<EventsData>(
    '/api/exec/dashboard/events',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  const addEvent = async (title: string, eventDate: string, description?: string) => {
    const res = await fetch('/api/exec/dashboard/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, eventDate, description }),
    });
    if (!res.ok) {
      throw await errorFrom(res, 'Failed to add event');
    }
    mutate();
  };

  const editEvent = async (id: number, updates: { title?: string; description?: string; eventDate?: string }) => {
    if (data) {
      mutate(
        { events: data.events.map(e => e.id === id ? { ...e, ...updates } : e) },
        false
      );
    }
    const res = await fetch('/api/exec/dashboard/events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    if (!res.ok) {
      mutate();
      throw await errorFrom(res, 'Failed to edit event');
    }
  };

  const deleteEvent = async (id: number) => {
    if (data) {
      mutate(
        { events: data.events.filter(e => e.id !== id) },
        false
      );
    }
    const res = await fetch('/api/exec/dashboard/events', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      mutate();
      throw await errorFrom(res, 'Failed to delete event');
    }
  };

  return {
    events: data?.events ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    addEvent,
    editEvent,
    deleteEvent,
  };
}
