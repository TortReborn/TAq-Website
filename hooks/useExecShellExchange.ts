import useSWR from 'swr';
import { fetcher } from './fetcher';

export interface IngredientItem {
  key: string;
  name: string;
  shells: number;
  per: number;
  highlight: boolean;
  toggled: boolean;
}

export interface TierData {
  shells: number;
  per: number;
  highlight: boolean;
  toggled: boolean;
}

export interface MaterialItem {
  key: string;
  name: string;
  tiers: {
    t1: TierData;
    t2: TierData;
    t3: TierData;
  };
}

interface ShellExchangeData {
  ingredients: IngredientItem[];
  materials: MaterialItem[];
}

export function useExecShellExchange() {
  const { data, error, isLoading, mutate } = useSWR<ShellExchangeData>(
    '/api/exec/shell-exchange',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  const addItem = async (formData: FormData): Promise<void> => {
    const res = await fetch('/api/exec/shell-exchange', {
      method: 'POST',
      body: formData,
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to add item');
    mutate();
  };

  const updateItem = async (formData: FormData): Promise<void> => {
    const res = await fetch('/api/exec/shell-exchange', {
      method: 'PUT',
      body: formData,
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to update item');
    mutate();
  };

  const deleteItem = async (name: string, type: 'ingredient' | 'material'): Promise<void> => {
    const res = await fetch('/api/exec/shell-exchange', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to delete item');
    mutate();
  };

  return {
    ingredients: data?.ingredients ?? [],
    materials: data?.materials ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    addItem,
    updateItem,
    deleteItem,
  };
}
