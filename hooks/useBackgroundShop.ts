import useSWR, { mutate as globalMutate } from 'swr';
import { fetcher } from './fetcher';

interface BackgroundItem {
  id: number;
  name: string;
  description: string;
  price: number;
}

interface BackgroundShopData {
  backgrounds: BackgroundItem[];
  owned: number[];
  activeId: number;
  shellsBalance: number;
}

export function useBackgroundShop() {
  const { data, error, isLoading, mutate } = useSWR<BackgroundShopData>(
    '/api/backgrounds',
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
      shouldRetryOnError: false,
    }
  );

  const purchaseBackground = async (id: number): Promise<{ error?: string }> => {
    const bg = data?.backgrounds.find(b => b.id === id);
    if (!bg || !data) return { error: 'Background not found' };

    const optimisticData: BackgroundShopData = {
      ...data,
      owned: [...data.owned, id],
      shellsBalance: data.shellsBalance - bg.price,
    };

    try {
      await mutate(
        async () => {
          const res = await fetch('/api/backgrounds/purchase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backgroundId: id }),
          });
          if (!res.ok) {
            const d = await res.json();
            throw new Error(d.error || 'Purchase failed');
          }
          const result = await res.json();
          return {
            ...data,
            owned: result.owned,
            shellsBalance: result.newBalance,
          };
        },
        {
          optimisticData,
          rollbackOnError: true,
          revalidate: false,
        }
      );
      // Revalidate profile data so card shell balance updates
      globalMutate('/api/profile');
      return {};
    } catch (err: any) {
      return { error: err.message || 'Purchase failed' };
    }
  };

  const setActiveBackground = async (id: number): Promise<{ error?: string }> => {
    if (!data) return { error: 'Data not loaded' };

    const optimisticData: BackgroundShopData = {
      ...data,
      activeId: id,
    };

    try {
      await mutate(
        async () => {
          const res = await fetch('/api/backgrounds/set-active', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backgroundId: id }),
          });
          if (!res.ok) {
            const d = await res.json();
            throw new Error(d.error || 'Failed to set background');
          }
          const result = await res.json();
          return { ...data, activeId: result.activeId };
        },
        {
          optimisticData,
          rollbackOnError: true,
          revalidate: false,
        }
      );
      // Revalidate profile data so card background updates
      globalMutate('/api/profile');
      return {};
    } catch (err: any) {
      return { error: err.message || 'Failed to set background' };
    }
  };

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    purchaseBackground,
    setActiveBackground,
  };
}
