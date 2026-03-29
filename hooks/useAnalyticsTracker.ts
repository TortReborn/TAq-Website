'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useExecSession } from './useExecSession';

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem('analytics_session_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('analytics_session_id', id);
  }
  return id;
}

export function useAnalyticsTracker() {
  const pathname = usePathname();
  const { user } = useExecSession();
  const sessionId = useRef('');
  const pageViewId = useRef<number | null>(null);
  const startTime = useRef(Date.now());

  // Initialize session ID on mount
  useEffect(() => {
    sessionId.current = getOrCreateSessionId();
  }, []);

  // Track page views and duration
  useEffect(() => {
    if (!sessionId.current) sessionId.current = getOrCreateSessionId();

    startTime.current = Date.now();
    pageViewId.current = null;

    // Record page view
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'pageview',
        page_path: pathname,
        session_id: sessionId.current,
        discord_id: user?.discord_id || null,
        ign: user?.ign || null,
        referrer: typeof document !== 'undefined' ? document.referrer : null,
      }),
    })
      .then(r => r.json())
      .then(d => { pageViewId.current = d.id; })
      .catch(() => {});

    // Heartbeat for duration updates every 30s
    const interval = setInterval(() => {
      if (pageViewId.current) {
        const blob = new Blob(
          [JSON.stringify({
            type: 'duration',
            id: pageViewId.current,
            duration_ms: Date.now() - startTime.current,
          })],
          { type: 'application/json' }
        );
        navigator.sendBeacon('/api/analytics/track', blob);
      }
    }, 30000);

    // Send final duration on visibility change
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && pageViewId.current) {
        const blob = new Blob(
          [JSON.stringify({
            type: 'duration',
            id: pageViewId.current,
            duration_ms: Date.now() - startTime.current,
          })],
          { type: 'application/json' }
        );
        navigator.sendBeacon('/api/analytics/track', blob);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      // Send final duration on navigation
      if (pageViewId.current) {
        const blob = new Blob(
          [JSON.stringify({
            type: 'duration',
            id: pageViewId.current,
            duration_ms: Date.now() - startTime.current,
          })],
          { type: 'application/json' }
        );
        navigator.sendBeacon('/api/analytics/track', blob);
      }
    };
  }, [pathname, user?.discord_id]);

  const trackAction = useCallback(
    (actionType: string, actionLabel: string, metadata?: Record<string, unknown>) => {
      if (!sessionId.current) return;
      const blob = new Blob(
        [JSON.stringify({
          type: 'action',
          page_path: pathname,
          action_type: actionType,
          action_label: actionLabel,
          metadata: metadata || null,
          session_id: sessionId.current,
          discord_id: user?.discord_id || null,
          ign: user?.ign || null,
        })],
        { type: 'application/json' }
      );
      navigator.sendBeacon('/api/analytics/track', blob);
    },
    [pathname, user?.discord_id, user?.ign]
  );

  return { trackAction };
}
