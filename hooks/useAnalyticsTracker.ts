'use client';

import { useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useExecSession } from './useExecSession';

// Heavily batched analytics tracker.
//
// Design:
// - One module-level queue shared across all hook instances.
// - Pageview rows are written once, on page end, with duration baked in
//   (no INSERT + UPDATE round trip, no heartbeats).
// - Visibility changes pause/resume the active page timer instead of
//   spawning new rows, so tab switches don't inflate view counts.
// - Queue flushes on a timer, on size threshold, and on visibility hidden
//   / pagehide via sendBeacon so events survive tab close.

type PageviewEvent = {
  type: 'pageview';
  page_path: string;
  duration_ms: number;
  referrer: string | null;
  session_id: string;
  discord_id: string | null;
  ign: string | null;
};

type ActionEvent = {
  type: 'action';
  page_path: string;
  action_type: string;
  action_label: string;
  metadata: Record<string, unknown> | null;
  session_id: string;
  discord_id: string | null;
  ign: string | null;
};

type AnalyticsEvent = PageviewEvent | ActionEvent;

const FLUSH_INTERVAL_MS = 15_000;
const MAX_QUEUE_SIZE = 25;

const queue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

type CurrentPage = {
  path: string;
  // Time the current visible period started (ms since epoch).
  visibleSince: number;
  // Time accumulated from prior visible periods on this same page.
  accumulatedMs: number;
  visible: boolean;
  referrer: string | null;
  sessionId: string;
  discordId: string | null;
  ign: string | null;
};

let currentPage: CurrentPage | null = null;
let globalListenersInstalled = false;

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem('analytics_session_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('analytics_session_id', id);
  }
  return id;
}

function clearFlushTimer() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush(false);
  }, FLUSH_INTERVAL_MS);
}

function flush(useBeacon: boolean) {
  if (typeof window === 'undefined' || queue.length === 0) return;
  const events = queue.splice(0, queue.length);
  const body = JSON.stringify({ events });

  if (useBeacon && typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const blob = new Blob([body], { type: 'application/json' });
    const ok = navigator.sendBeacon('/api/analytics/track', blob);
    if (ok) return;
    // Fall through to fetch with keepalive if the beacon was rejected
    // (e.g. payload too large for the browser's beacon quota).
  }

  fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Analytics is best-effort; drop on failure.
  });
}

function enqueue(event: AnalyticsEvent) {
  queue.push(event);
  if (queue.length >= MAX_QUEUE_SIZE) {
    clearFlushTimer();
    flush(false);
  } else {
    scheduleFlush();
  }
}

function pauseCurrentPage() {
  if (!currentPage || !currentPage.visible) return;
  currentPage.accumulatedMs += Date.now() - currentPage.visibleSince;
  currentPage.visible = false;
}

function resumeCurrentPage() {
  if (!currentPage || currentPage.visible) return;
  currentPage.visibleSince = Date.now();
  currentPage.visible = true;
}

function endCurrentPage() {
  if (!currentPage) return;
  const duration_ms = currentPage.visible
    ? currentPage.accumulatedMs + (Date.now() - currentPage.visibleSince)
    : currentPage.accumulatedMs;
  enqueue({
    type: 'pageview',
    page_path: currentPage.path,
    duration_ms,
    referrer: currentPage.referrer,
    session_id: currentPage.sessionId,
    discord_id: currentPage.discordId,
    ign: currentPage.ign,
  });
  currentPage = null;
}

function installGlobalListeners() {
  if (globalListenersInstalled || typeof document === 'undefined') return;
  globalListenersInstalled = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Tab/app went to background. Pause the page timer (don't end it —
      // the user may come back) and flush whatever's queued in case the
      // tab is actually being closed and pagehide doesn't reach us.
      pauseCurrentPage();
      flush(true);
    } else {
      resumeCurrentPage();
    }
  });

  // pagehide is the recommended unload signal — fires reliably on tab
  // close and navigation, including on iOS Safari where beforeunload is
  // unreliable.
  window.addEventListener('pagehide', () => {
    endCurrentPage();
    flush(true);
  });
}

export function useAnalyticsTracker() {
  const pathname = usePathname();
  const { user } = useExecSession();

  useEffect(() => {
    installGlobalListeners();
    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;

    // End any prior page (SPA route change or user identity change).
    endCurrentPage();

    currentPage = {
      path: pathname,
      visibleSince: Date.now(),
      accumulatedMs: 0,
      visible: typeof document === 'undefined' || document.visibilityState !== 'hidden',
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      sessionId,
      discordId: user?.discord_id || null,
      ign: user?.ign || null,
    };
  }, [pathname, user?.discord_id, user?.ign]);

  const trackAction = useCallback(
    (actionType: string, actionLabel: string, metadata?: Record<string, unknown>) => {
      const sessionId = getOrCreateSessionId();
      if (!sessionId) return;
      enqueue({
        type: 'action',
        page_path: pathname,
        action_type: actionType,
        action_label: actionLabel,
        metadata: metadata || null,
        session_id: sessionId,
        discord_id: user?.discord_id || null,
        ign: user?.ign || null,
      });
    },
    [pathname, user?.discord_id, user?.ign]
  );

  return { trackAction };
}
