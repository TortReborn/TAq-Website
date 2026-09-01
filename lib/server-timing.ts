/**
 * Minimal per-request timing for API routes.
 *
 * Usage:
 *   const timing = createTiming('map-history/bounds');
 *   const rows = await timing.span('query', () => pool.query(...));
 *   timing.log();                       // one structured line to the server console
 *   headers: { ...timing.header() }     // Server-Timing header, visible in DevTools
 */

interface Span {
  name: string;
  ms: number;
}

export interface RouteTiming {
  /** Time an async operation under a named span. */
  span<T>(name: string, fn: () => Promise<T>): Promise<T>;
  /** Log a single summary line: route, total ms, span breakdown. */
  log(extra?: Record<string, unknown>): void;
  /** Server-Timing response header for browser DevTools. */
  header(): Record<string, string>;
}

export function createTiming(route: string): RouteTiming {
  const start = performance.now();
  const spans: Span[] = [];

  return {
    async span<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const s = performance.now();
      try {
        return await fn();
      } finally {
        spans.push({ name, ms: performance.now() - s });
      }
    },
    log(extra?: Record<string, unknown>) {
      const total = Math.round(performance.now() - start);
      const parts = spans.map((s) => `${s.name}=${Math.round(s.ms)}ms`).join(' ');
      console.log(`[api:${route}] ${total}ms ${parts}`, extra ?? '');
    },
    header() {
      const value = [
        ...spans.map((s) => `${s.name.replace(/[^a-zA-Z0-9_-]/g, '_')};dur=${s.ms.toFixed(1)}`),
        `total;dur=${(performance.now() - start).toFixed(1)}`,
      ].join(', ');
      return { 'Server-Timing': value };
    },
  };
}
