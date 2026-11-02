"use client";

/**
 * Distribution: the two in-game queues exec works through, as tabs. Tomes
 * (TAQ-116) are requested with the bot's button and given out here; aspects
 * are given out with the TAq management mod, so their tab only shows the
 * queue. ?tab=aspects opens the second tab.
 */

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import AspectsTab from '@/components/distribution/AspectsTab';
import TomesTab from '@/components/distribution/TomesTab';

const TABS = [
  { key: 'tomes', label: 'Tomes' },
  { key: 'aspects', label: 'Aspects' },
] as const;
type Tab = (typeof TABS)[number]['key'];

function Distribution() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = params.get('tab') === 'aspects' ? 'aspects' : 'tomes';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Distribution</h1>
        <div role="tablist" style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.5rem', padding: '0.2rem' }}>
          {TABS.map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key}
              onClick={() => router.replace(t.key === 'tomes' ? pathname : `${pathname}?tab=${t.key}`, { scroll: false })}
              style={{
                padding: '0.4rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                background: tab === t.key ? '#3b82f6' : 'transparent', color: tab === t.key ? '#fff' : 'var(--text-secondary)',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'tomes' ? <TomesTab /> : <AspectsTab />}
    </div>
  );
}

export default function DistributionPage() {
  return <Suspense fallback={null}><Distribution /></Suspense>;
}
