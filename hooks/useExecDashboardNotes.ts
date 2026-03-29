import useSWR from 'swr';
import { fetcher } from './fetcher';

export interface DashboardNote {
  id: number;
  content: string;
  completed: boolean;
  createdAt: string;
  createdBy: string;
}

interface NotesData {
  notes: DashboardNote[];
}

export function useExecDashboardNotes() {
  const { data, error, isLoading, mutate } = useSWR<NotesData>(
    '/api/exec/dashboard/notes',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 15000, dedupingInterval: 5000 }
  );

  const addNote = async (content: string) => {
    const res = await fetch('/api/exec/dashboard/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Failed to add note');
    }
    mutate();
  };

  const toggleNote = async (id: number, completed: boolean) => {
    if (data) {
      mutate(
        { notes: data.notes.map(n => n.id === id ? { ...n, completed } : n) },
        false
      );
    }
    const res = await fetch('/api/exec/dashboard/notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, completed }),
    });
    if (!res.ok) {
      mutate();
      const d = await res.json();
      throw new Error(d.error || 'Failed to toggle note');
    }
  };

  const editNote = async (id: number, content: string) => {
    if (data) {
      mutate(
        { notes: data.notes.map(n => n.id === id ? { ...n, content } : n) },
        false
      );
    }
    const res = await fetch('/api/exec/dashboard/notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, content }),
    });
    if (!res.ok) {
      mutate();
      const d = await res.json();
      throw new Error(d.error || 'Failed to edit note');
    }
  };

  const deleteNote = async (id: number) => {
    if (data) {
      mutate(
        { notes: data.notes.filter(n => n.id !== id) },
        false
      );
    }
    const res = await fetch('/api/exec/dashboard/notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      mutate();
      const d = await res.json();
      throw new Error(d.error || 'Failed to delete note');
    }
  };

  return {
    notes: data?.notes ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    addNote,
    toggleNote,
    editNote,
    deleteNote,
  };
}
