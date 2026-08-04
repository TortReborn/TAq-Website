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
      throw await errorFrom(res, 'Failed to add note');
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
      throw await errorFrom(res, 'Failed to toggle note');
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
      throw await errorFrom(res, 'Failed to edit note');
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
      throw await errorFrom(res, 'Failed to delete note');
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
