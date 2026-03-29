'use client';

import { useEffect } from 'react';
import { useAnalyticsTracker } from '@/hooks/useAnalyticsTracker';

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { trackAction } = useAnalyticsTracker();

  // Global click listener to capture button/link clicks automatically
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('button, a[href]');
      if (!target) return;
      const label = target.textContent?.trim().slice(0, 100);
      if (label && label.length > 1) {
        trackAction('click', label);
      }
    };
    document.addEventListener('click', handler, { passive: true });
    return () => document.removeEventListener('click', handler);
  }, [trackAction]);

  return <>{children}</>;
}
