import useSWR from 'swr';
import { fetcher } from './fetcher';

export interface ShellBalance {
  discordId: string;
  ign: string;
  uuid: string | null;
  rank: string | null;
  shells: number;
  balance: number;
}

export interface IngredientRate {
  shells: number;
  per: number;
  highlight: boolean;
  toggled: boolean;
}

export interface MaterialTierRate {
  shells: number;
  per: number;
  highlight: boolean;
  toggled: boolean;
}

export interface MaterialRate {
  t1: MaterialTierRate;
  t2: MaterialTierRate;
  t3: MaterialTierRate;
  toggled: boolean;
}

export interface ShellAuditEntry {
  id: number;
  actorName: string;
  action: string;
  createdAt: string;
}

interface ShellsData {
  members: { name: string; uuid: string }[];
  discordLinks: Record<string, { discordId: string; ign: string; rank: string }>;
  balances: ShellBalance[];
  ingredients: Record<string, IngredientRate>;
  materials: Record<string, MaterialRate>;
  auditLog: ShellAuditEntry[];
}

export function useExecShells() {
  const { data, error, isLoading, mutate } = useSWR<ShellsData>(
    '/api/exec/shells',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  const manageShells = async (discordId: string, amount: number, action: 'add' | 'remove') => {
    const res = await fetch('/api/exec/shells', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordId, amount, action }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to manage shells');
    mutate();
  };

  const editExchangeItem = async (
    type: 'ingredient' | 'material',
    name: string,
    updates: Partial<IngredientRate> | Record<string, unknown>
  ) => {
    const res = await fetch('/api/exec/shells', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name, data: updates }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to edit exchange item');
    mutate();
  };

  const addExchangeItem = async (
    type: 'ingredient' | 'material',
    name: string,
    itemData: IngredientRate | MaterialRate
  ) => {
    const res = await fetch('/api/exec/shells', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name, data: itemData }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to add exchange item');
    mutate();
  };

  const removeExchangeItem = async (type: 'ingredient' | 'material', name: string) => {
    const res = await fetch('/api/exec/shells', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to remove exchange item');
    mutate();
  };

  return {
    members: data?.members ?? [],
    discordLinks: data?.discordLinks ?? {},
    balances: data?.balances ?? [],
    ingredients: data?.ingredients ?? {},
    materials: data?.materials ?? {},
    auditLog: data?.auditLog ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    manageShells,
    editExchangeItem,
    addExchangeItem,
    removeExchangeItem,
  };
}
