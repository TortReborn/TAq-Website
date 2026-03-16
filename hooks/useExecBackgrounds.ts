import useSWR from 'swr';
import { fetcher } from './fetcher';

export interface Background {
  id: number;
  name: string;
  description: string;
  price: number;
  public: boolean;
}

export interface BackgroundAuditEntry {
  id: number;
  actorName: string;
  action: string;
  createdAt: string;
}

export interface UserCustomization {
  background: number;
  owned: number[];
  gradient: [string, string] | null;
}

interface BackgroundsData {
  backgrounds: Background[];
  members: { name: string; uuid: string }[];
  discordLinks: Record<string, { discordId: string; ign: string; rank: string }>;
  auditLog: BackgroundAuditEntry[];
}

export function useExecBackgrounds() {
  const { data, error, isLoading, mutate } = useSWR<BackgroundsData>(
    '/api/exec/backgrounds',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  const uploadBackground = async (formData: FormData): Promise<{ id: number }> => {
    const res = await fetch('/api/exec/backgrounds', {
      method: 'POST',
      body: formData,
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to upload background');
    mutate();
    return { id: d.id };
  };

  const editBackground = async (id: number, updates: Partial<Omit<Background, 'id'>>) => {
    const res = await fetch('/api/exec/backgrounds', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to edit background');
    mutate();
  };

  const unlockBackground = async (discordId: string, backgroundId: number) => {
    const res = await fetch('/api/exec/backgrounds', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlock', discordId, backgroundId }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to unlock background');
    mutate();
  };

  const setBackground = async (discordId: string, backgroundId: number) => {
    const res = await fetch('/api/exec/backgrounds', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', discordId, backgroundId }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to set background');
    mutate();
  };

  const setGradient = async (discordId: string, topColor: string, bottomColor: string) => {
    const res = await fetch('/api/exec/backgrounds', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'gradient', discordId, topColor, bottomColor }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to set gradient');
    mutate();
  };

  const removeBackground = async (discordId: string, backgroundId: number) => {
    const res = await fetch('/api/exec/backgrounds', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', discordId, backgroundId }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to remove background');
    mutate();
  };

  const fetchUserCustomization = async (discordId: string): Promise<UserCustomization> => {
    const res = await fetch(`/api/exec/backgrounds/user?discordId=${encodeURIComponent(discordId)}`);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to fetch user customization');
    return d;
  };

  return {
    backgrounds: data?.backgrounds ?? [],
    members: data?.members ?? [],
    discordLinks: data?.discordLinks ?? {},
    auditLog: data?.auditLog ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    uploadBackground,
    editBackground,
    unlockBackground,
    removeBackground,
    setBackground,
    setGradient,
    fetchUserCustomization,
  };
}
