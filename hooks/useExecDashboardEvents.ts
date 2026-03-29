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
      const d = await res.json();
      throw new Error(d.error || 'Failed to add event');
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
      const d = await res.json();
      throw new Error(d.error || 'Failed to edit event');
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
      const d = await res.json();
      throw new Error(d.error || 'Failed to delete event');
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
