'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Battle from '@/components/duel/Battle';
import GridBattle from '@/components/duel/GridBattle';
import WarBattle from '@/components/duel/WarBattle';
import { useDuelMatch } from '@/hooks/useDuels';
import { useExecSession } from '@/hooks/useExecSession';
import { serverGrid } from '@/hooks/useGrid';
import { serverWar } from '@/hooks/useWar';

function Match({ id }: { id: string }) {
  const m = useDuelMatch(id);
  // One poller for every ruleset; the payload says which board to draw.
  if (m.match?.ruleset === 'war') return <WarBattle ctl={serverWar(m)} />;
  if (m.match?.ruleset === 'grid') return <GridBattle ctl={serverGrid(m)} />;
  return <Battle ctl={m} />;
}

export default function DuelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { authenticated, loading } = useExecSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !authenticated) router.push('/login');
  }, [loading, authenticated, router]);

  if (!authenticated) return null;
  return <Match id={id} />;
}
