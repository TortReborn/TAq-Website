/**
 * Structured logger for the map page's data-loading path.
 *
 * Always on in development. In production it stays silent unless the user
 * opts in with `localStorage.setItem('map-debug', '1')` — so field reports
 * of slow loads can include real timings without shipping console noise.
 *
 * Every entry is prefixed `[map:<scope>]` so logs can be filtered in
 * DevTools and asserted on in Playwright tests.
 */

export type MapLogScope =
  | 'static'    // guild colors, verbose/externals JSON, guild list
  | 'live'      // live territory polling
  | 'bounds'    // /api/map-history/bounds
  | 'snapshot'  // /api/map-history/snapshot
  | 'events'    // /api/map-history/events chunks
  | 'cache'     // IndexedDB history cache
  | 'store'     // client-side ExchangeStore builds/merges
  | 'mode'      // live/history tab switches
  | 'timeline'; // timeline interactions (scrub, playback, jumps)

function enabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV !== 'production') return true;
  try {
    return window.localStorage.getItem('map-debug') === '1';
  } catch {
    return false;
  }
}

function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

/** Log a one-off event with optional structured details. */
export function mapLog(scope: MapLogScope, message: string, details?: Record<string, unknown>): void {
  if (!enabled()) return;
  if (details !== undefined) {
    console.log(`[map:${scope}] ${message}`, details);
  } else {
    console.log(`[map:${scope}] ${message}`);
  }
}

/** Log a failure. Always emitted (errors are worth keeping in production). */
export function mapError(scope: MapLogScope, message: string, error?: unknown): void {
  console.error(`[map:${scope}] ${message}`, error ?? '');
}

/**
 * Start a timing span. Returns a `done` callback that logs the elapsed time,
 * e.g. `[map:events] chunk 2026-06-01→2026-09-01 462ms {events: 12034}`.
 */
export function mapTime(scope: MapLogScope, label: string): (details?: Record<string, unknown>) => number {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return (details?: Record<string, unknown>) => {
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
    if (enabled()) {
      if (details !== undefined) {
        console.log(`[map:${scope}] ${label} ${fmt(elapsed)}`, details);
      } else {
        console.log(`[map:${scope}] ${label} ${fmt(elapsed)}`);
      }
    }
    return elapsed;
  };
}

/**
 * Fetch with timing: logs URL, status, duration and payload size.
 * Rethrows on network failure after logging.
 */
export async function timedFetch(scope: MapLogScope, url: string, init?: RequestInit): Promise<Response> {
  const done = mapTime(scope, `GET ${url.split('?')[0]}`);
  try {
    const res = await fetch(url, init);
    const size = res.headers.get('content-length');
    done({ status: res.status, ...(size ? { kb: Math.round(Number(size) / 1024) } : {}) });
    return res;
  } catch (err) {
    done({ failed: true });
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      mapError(scope, `fetch failed: ${url}`, err);
    }
    throw err;
  }
}
