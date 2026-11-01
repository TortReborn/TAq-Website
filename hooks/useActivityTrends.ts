import useSWR from 'swr';
import { fetcher } from './fetcher';

export type TrendMetric =
  | 'playtime' | 'wars' | 'raid_clears'
  | 'presence'
  | 'captures' | 'raids' | 'snipes';
export type TrendRange = '24h' | '7d' | '30d' | '90d' | '1y' | 'all';

export interface TrendResponse {
  metric: TrendMetric;
  range: TrendRange;
  bucket: 'hour' | 'day' | 'week';
  tz: string;
  unit: string;
  /** True when values are averages (avg concurrent players), not totals. */
  averaged: boolean;
  /** Which table served this range — hourly samples, the daily snapshot, or event logs. */
  source: 'presence-samples' | 'hourly-samples' | 'daily-snapshot' | 'events';
  /** Window-wide figure: a count, or an average for averaged metrics. */
  total: number;
  points: {
    t: string; value: number;
    coverage?: number; approximate?: number; attributed?: number; rawTotal?: number;
  }[];
  /** Presence only: 0–1 share of online members that could be named. */
  attributedShare?: number;
  /** Presence only: whether the series counts everyone or only nameable members. */
  scope?: 'guild-total' | 'attributed';
  /** Most recent record this metric has at all, regardless of the range asked for. */
  latest: string | null;
  /** Total for the same-length window immediately before this one; null for range=all. */
  previousTotal: number | null;
}

export interface HeatmapResponse {
  metric: TrendMetric;
  range: TrendRange;
  tz: string;
  unit: string;
  max: number;
  total: number;
  cells: { dow: number; hour: number; total: number; occurrences: number; average: number }[];
  peak: { dow: number; hour: number; average: number };
  bestWindows: { two: { startHour: number; average: number }; four: { startHour: number; average: number } };
}

function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return q.toString();
}

export function useActivityTrend(
  metric: TrendMetric, range: TrendRange, tz: string, scope?: string,
) {
  const { data, error, isLoading } = useSWR<TrendResponse>(
    `/api/exec/activity/trends?${query({ metric, range, tz })}${scope ? `&${scope}` : ''}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  return { data, error, loading: isLoading };
}

/** `scope` is a ready-made query fragment (`uuid=...` or `cohort=...`) narrowing
 *  the series to one member or a rank; guild-wide event metrics reject it. */
export function useActivityHeatmap(
  metric: TrendMetric, range: TrendRange, tz: string, scope?: string,
) {
  const { data, error, isLoading } = useSWR<HeatmapResponse>(
    `/api/exec/activity/heatmap?${query({ metric, range, tz })}${scope ? `&${scope}` : ''}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  return { data, error, loading: isLoading };
}

/** The viewer's own zone, so the charts default to the hours they live in. */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
