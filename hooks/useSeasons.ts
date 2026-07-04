import { useEffect, useState } from 'react';
import { RawSeason, SeasonPeriod, buildSeasonPeriods } from '@/lib/seasons';

/**
 * Fetch guild seasons (cached server-side) and return them as on/off-season periods.
 * Non-fatal: on any failure returns an empty list so the timeline just omits season bands.
 *
 * @param enabled Only fetch when true (e.g. the history tab is open).
 */
export function useSeasons(enabled: boolean = true): SeasonPeriod[] {
  const [periods, setPeriods] = useState<SeasonPeriod[]>([]);

  useEffect(() => {
    if (!enabled || periods.length > 0) return;
    let cancelled = false;

    fetch('/api/seasons')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { seasons?: RawSeason[] }) => {
        if (!cancelled && Array.isArray(data.seasons)) {
          setPeriods(buildSeasonPeriods(data.seasons));
        }
      })
      .catch(() => {
        /* non-fatal — timeline renders without season context */
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, periods.length]);

  return periods;
}
