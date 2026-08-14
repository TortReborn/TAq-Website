/**
 * Emit every query lib/activity-trends.ts can build, as JSON, for execution by
 * an external checker. Touches no credentials and opens no connection — it
 * exists so the SQL can be validated against a real database without a second,
 * drift-prone copy of these statements living outside the module that owns
 * them.
 *
 * Emits the full metric x range matrix, tagged so the checker can assert
 * cross-query invariants (a headline must agree with its own series, a
 * previous-window figure must use the same expression as the current one).
 *
 *   npx tsx scripts/_dump-activity-sql.ts > queries.json
 */
import {
  playtimeQuery, presenceQuery, eventQuery, snapshotQuery, latestPointQuery,
  headlineQuery, hourlyCounterQuery, hourlyCounterHeatmapQuery, hourlyCoverageQuery,
  slotOccurrenceQuery, eventHeatmapQuery, presenceHeatmapQuery, presenceOccurrenceQuery,
  bucketFor, isSnapshotMetric, isAveragedMetric, usesHourlyCounters,
  unitFor, SNAPSHOT_COLUMNS, METRICS, RANGES,
  type RangeKey, type Metric,
} from '../lib/activity-trends';

const TZ = 'America/New_York';
const SAMPLE_UUID = '00000000-0000-0000-0000-000000000000';

interface Entry {
  label: string;
  kind: 'series' | 'headline' | 'previous' | 'heatmap' | 'occurrences' | 'latest' | 'coverage';
  metric: Metric;
  range: RangeKey;
  bucket?: string;
  averaged?: boolean;
  hourly?: boolean;
  unit?: string;
  text: string;
  values: unknown[];
}

const out: Entry[] = [];
const add = (e: Omit<Entry, 'text' | 'values'>, q: { text: string; values: unknown[] }) =>
  out.push({ ...e, ...q });

// ── the full matrix ────────────────────────────────────────────────────────
for (const metric of METRICS) {
  for (const range of RANGES) {
    const bucket = bucketFor(metric, range);
    const hourly = usesHourlyCounters(metric, range);
    const base = { metric, range, bucket, hourly,
                   averaged: isAveragedMetric(metric), unit: unitFor(metric) };

    // Series. Snapshot metrics have two possible sources; emit whichever the
    // range resolves to, and for hourly-capable ranges emit the daily fallback
    // too so both paths are exercised even before samples accumulate.
    if (hourly) {
      add({ ...base, kind: 'series', label: `${metric} ${range} series [hourly]` },
          hourlyCounterQuery(SNAPSHOT_COLUMNS[metric]!, range, TZ));
      add({ ...base, kind: 'series', hourly: false,
            label: `${metric} ${range} series [daily fallback]` },
          snapshotQuery(SNAPSHOT_COLUMNS[metric]!, bucketFor(metric, '30d'), range));
    } else if (isSnapshotMetric(metric)) {
      add({ ...base, kind: 'series', label: `${metric} ${range} series` },
          snapshotQuery(SNAPSHOT_COLUMNS[metric]!, bucket, range));
    } else if (metric === 'presence') {
      add({ ...base, kind: 'series', label: `${metric} ${range} series` },
          presenceQuery(bucket, range, TZ));
    } else {
      add({ ...base, kind: 'series', label: `${metric} ${range} series` },
          eventQuery(metric, bucket, range, TZ));
    }

    // Headline and its comparison window, in both source modes where relevant.
    add({ ...base, kind: 'headline', label: `${metric} ${range} headline` },
        headlineQuery(metric, range, undefined, false, hourly)!);
    const prev = headlineQuery(metric, range, undefined, true, hourly);
    if (prev) add({ ...base, kind: 'previous', label: `${metric} ${range} previous` }, prev);

    // Heatmaps, for every metric that can carry an hour-of-day.
    if (range !== '24h') {
      if (metric === 'presence') {
        add({ ...base, kind: 'heatmap', label: `${metric} ${range} heatmap` },
            presenceHeatmapQuery(range, TZ));
      } else if (isSnapshotMetric(metric)) {
        add({ ...base, kind: 'heatmap', label: `${metric} ${range} heatmap` },
            hourlyCounterHeatmapQuery(SNAPSHOT_COLUMNS[metric]!, range, TZ));
      } else {
        add({ ...base, kind: 'heatmap', label: `${metric} ${range} heatmap` },
            eventHeatmapQuery(metric, range, TZ));
      }
      // Mirrors the route: presence divides by hours it actually sampled.
      add({ ...base, kind: 'occurrences', label: `${metric} ${range} occurrences` },
          metric === 'presence' ? presenceOccurrenceQuery(range, TZ)
                                : slotOccurrenceQuery(range, TZ));
    }
  }

  add({ metric, range: 'all', kind: 'latest', label: `${metric} latest` },
      latestPointQuery(metric));
}

// ── per-member paths ───────────────────────────────────────────────────────
add({ metric: 'playtime', range: '90d', kind: 'series', label: 'playtime 90d one member' },
    playtimeQuery('day', '90d', { uuid: SAMPLE_UUID }));
add({ metric: 'presence', range: '7d', kind: 'series', label: 'presence 7d one member' },
    presenceQuery('hour', '7d', 'UTC', { uuid: SAMPLE_UUID }));
add({ metric: 'playtime', range: '7d', kind: 'series', label: 'playtime 7d one member [hourly]' },
    hourlyCounterQuery('hours', '7d', 'UTC', { uuid: SAMPLE_UUID }));

// ── timezone handling ──────────────────────────────────────────────────────
for (const tz of ['UTC', 'America/New_York', 'Europe/London', 'Australia/Sydney']) {
  add({ metric: 'captures', range: '30d', kind: 'series', bucket: 'day',
        label: `captures 30d in ${tz}` },
      eventQuery('captures', 'day', '30d', tz));
}

// ── source-selection probes ────────────────────────────────────────────────
for (const range of ['24h', '7d'] as RangeKey[]) {
  add({ metric: 'playtime', range, kind: 'coverage', label: `hourly coverage ${range}` },
      hourlyCoverageQuery(range));
}

process.stdout.write(JSON.stringify(out, null, 2));
