import useSWR from 'swr';
import { fetcher } from './fetcher';

export interface MemberNote {
  note: string;
  updatedAt: string;
  updatedBy: string;
}

interface MemberNotesData {
  notes: Record<string, MemberNote>;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  if (res.status === 401) return new Error('Session expired — reload and sign in again.');
  try {
    const d = await res.json();
    return new Error(d.error || fallback);
  } catch {
    return new Error(`${fallback} (HTTP ${res.status})`);
  }
}

export function useMemberNotes() {
  const { data, error, isLoading, mutate } = useSWR<MemberNotesData>(
    '/api/exec/members/notes',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60000, dedupingInterval: 5000 }
  );

  const saveNote = async (uuid: string, note: string) => {
    const trimmed = note.trim();
    if (data) {
      mutate(
        { notes: { ...data.notes, [uuid]: { note: trimmed, updatedAt: new Date().toISOString(), updatedBy: data.notes[uuid]?.updatedBy ?? 'you' } } },
        false
      );
    }
    const res = await fetch('/api/exec/members/notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, note: trimmed }),
    });
    if (!res.ok) {
      mutate();
      throw await errorFrom(res, 'Failed to save note');
    }
    mutate();
  };

  const deleteNote = async (uuid: string) => {
    if (data) {
      const rest = { ...data.notes };
      delete rest[uuid];
      mutate({ notes: rest }, false);
    }
    const res = await fetch('/api/exec/members/notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid }),
    });
    if (!res.ok) {
      mutate();
      throw await errorFrom(res, 'Failed to delete note');
    }
  };

  return {
    notesByUuid: data?.notes ?? {},
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    saveNote,
    deleteNote,
  };
}
