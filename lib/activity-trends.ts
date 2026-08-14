/**
 * Query layer for the activity trend charts.
 *
 * Five metrics over one shape. Two of them come from different places than you
 * might expect, and the difference matters when reading the charts:
 *
 *   playtime  – hours from playtime_daily, derived from the daily Wynncraft
 *               snapshot. Authoritative for "how much did we play", but it has
 *               no time-of-day: a DATE is a DATE, so timezone is ignored.
 *   presence  – member-hours from presence_hourly, derived from sampling who
 *               is online every 3 minutes. This is the only metric with an
 *               hour-of-day, and it only exists from the day sampling shipped.
 *   captures / raids / snipes – counted events from guild_activity_events,
 *               each carrying a real timestamp back through imported history.
 *
 * Buckets are gap-filled in SQL rather than in the client, so a missing bucket
 * arrives as an explicit zero (or, for presence, as a zero next to a coverage
 * of 0) instead of the chart drawing a straight line over the hole.
 */

export type Metric =
  | 'playtime' | 'wars' | 'raid_clears'   // daily, from the snapshot history
  | 'presence'                            // sampled
  | 'captures' | 'raids' | 'snipes';      // timestamped events
export type RangeKey = '24h' | '7d' | '30d' | '90d' | '1y' | 'all';
export type Bucket = 'hour' | 'day' | 'week';

export const METRICS: Metric[] = [
  'playtime', 'wars', 'raid_clears', 'presence', 'captures', 'raids', 'snipes',
];
export const RANGES: RangeKey[] = ['24h', '7d', '30d', '90d', '1y', 'all'];

/** Metrics that read from guild_activity_events, keyed by that view's `kind`. */
export const EVENT_KINDS: Partial<Record<Metric, string>> = {
  captures: 'capture',
  raids: 'raid',
  snipes: 'snipe',
};

/**
 * Event metrics counted by people rather than by event.
 *
 * A guild raid can be one player or a party of four, so counting rows treats
 * a solo clear and a full group as equal work. Weighting by participants makes
 * the number proportional to effort, and puts it in the same unit as
 * raid_clears, which has always been per-person.
 *
 * Captures have no roster to weight by. Snipes are left as events: their
 * parties are near-uniform (4-6 people, every one logged), so weighting adds
 * scale without adding signal, and "we ran 219 snipes" is the natural phrasing.
 */
export const PARTICIPATION_WEIGHTED: Partial<Record<Metric, boolean>> = {
  raids: true,
};

/** SQL aggregate for an event metric: people, or events. */
function eventAggregate(metric: Metric): string {
  return PARTICIPATION_WEIGHTED[metric] ? 'SUM(e.participants)::float8' : 'COUNT(*)::float8';
}

/**
 * Metrics derived from the daily player_activity snapshot, mapped to their
 * playtime_daily column.
 *
 * These are counters differenced between consecutive snapshots, so they carry
 * history all the way back to the first snapshot — years further than the
 * event tables in some cases — but they resolve only to a calendar day. The
 * snapshot runs at 00:01 UTC, so a day's value is everything that happened
 * since the previous midnight, with no time-of-day inside it.
 *
 * 'raid_clears' and the event-sourced 'raids' both count raids and will not
 * agree: this one is per-member completions from Wynncraft's own counter over
 * all history, while 'raids' is guild raids the bot logged, which has an
 * hour-of-day but only exists from when logging started.
 */
export const SNAPSHOT_COLUMNS: Partial<Record<Metric, 'hours' | 'wars' | 'raids'>> = {
  playtime: 'hours',
  wars: 'wars',
  raid_clears: 'raids',
};

export function isSnapshotMetric(metric: Metric): boolean {
  return metric in SNAPSHOT_COLUMNS;
}

/**
 * Metrics reported as an average rather than a total.
 *
 * A sum of hours is an unreadable quantity: "360 hours yesterday" is the same
 * number whether 15 people played all day or 360 played for an hour, and
 * nobody can picture either. Divided by the hours in the bucket it becomes
 * average concurrent players, which is a number you can hold in your head and
 * compare against the server being worth logging into.
 *
 * This also puts playtime and presence in the same unit — one derived from
 * Wynncraft's own counter, the other from our sampling — so they cross-check
 * each other instead of being two unrelated quantities.
 */
/**
 * Averaging is a guild-level idea. "Average concurrent players" for one member
 * is a fraction between 0 and 1 — technically the share of the window they were
 * online, but not a number anyone reads that way. A single member's playtime is
 * reported as hours.
 */
export function isAveragedMetric(metric: Metric, scope?: MemberScope): boolean {
  // A rank cohort is still several people, so "average concurrent" holds; one
  // member's would be a fraction of a player.
  if (scopeUuid(scope)) return false;
  return metric === 'playtime' || metric === 'presence';
}

/** Unit label for a metric's values, given whether a single member is filtered. */
export function unitFor(metric: Metric, scope?: MemberScope): string {
  const single = scopeUuid(scope);
  if (metric === 'presence' && single) return 'hours online';
  if (metric === 'playtime' && single) return 'hours played';
  if (isAveragedMetric(metric, scope)) return 'avg online';
  if (metric === 'wars') return 'wars';
  // Both raid metrics are per-person, so they share a unit and are comparable.
  if (metric === 'raid_clears' || metric === 'raids') return 'player-raids';
  if (metric === 'snipes') return 'snipes';
  return 'captures';
}

/** Ticks the sampler records in a fully covered hour (one per 3 minutes). */
export const EXPECTED_TICKS_PER_HOUR = 20;

const RANGE_DAYS: Record<RangeKey, number | null> = {
  '24h': 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365, all: null,
};

/**
 * Absolute floor, used only if a table is empty. The `all` range does not
 * start here: it starts at each metric's own first record.
 *
 * Anchoring `all` to a fixed date drew years of empty buckets before tracking
 * began — a flat zero line running most of the chart's width, with the real
 * data crushed into the last inch. Every unbounded window now floors at
 * MIN() of whichever table answers it.
 */
export const EPOCH_FLOOR = '2018-01-01';

/**
 * Who a series covers: everyone, one member, or a set of guild ranks.
 *
 * Ranks live in discord_links, so a cohort resolves to a uuid subquery rather
 * than a list of ids in the URL — the taxonomy stays server-side and the link
 * stays short.
 */
export type MemberScope =
  | undefined                      // whole guild
  | { uuid: string }
  | { ranks: string[]; label?: string }
  | { notRanks: string[]; label?: string };

/**
 * Ranks that count as exec. Mirrors EXEC_RANKS in lib/exec-auth.ts, which is
 * server-only (it pulls in crypto and next/server) — the same split
 * lib/exec-nav.ts already makes for NARWHAL_RANKS. Keep the two in sync.
 */
export const EXEC_RANK_NAMES = [
  'Hammerhead', 'Sailfish', 'Dolphin', 'Narwhal', 'Hydra', '✫✪✫ Hydra - Leader',
];

/**
 * Ranks the picker offers by default.
 *
 * Not exhaustive, and deliberately not treated as such: discord_links also
 * holds Barracuda and a few one-offs. The UI builds its list from the live
 * roster instead, and any rank not named here still resolves — a rank cohort
 * is validated against the roster, not against this array.
 */
export const ALL_RANK_NAMES = [
  'Hydra', 'Narwhal', 'Dolphin', 'Sailfish', 'Hammerhead',
  'Swordfish', 'Angler', 'Barracuda', 'Piranha', 'Manatee', 'Starfish',
];

/** Resolve a URL cohort token to the scope it covers. */
export function scopeFromParams(uuid?: string, cohort?: string): MemberScope {
  if (uuid) return { uuid };
  if (!cohort) return undefined;
  if (cohort === 'exec') return { ranks: EXEC_RANK_NAMES, label: 'Executives' };
  // Everything that is not exec, including ranks nobody has enumerated here.
  if (cohort === 'non-exec') return { notRanks: EXEC_RANK_NAMES, label: 'Non-executives' };
  if (cohort.startsWith('rank:')) {
    const rank = cohort.slice(5).trim();
    // Any non-empty rank is allowed: an unknown one simply matches no rows,
    // which is honest, where rejecting it would widen the query to the guild.
    return rank ? { ranks: [rank], label: rank } : undefined;
  }
  return undefined;
}

export function scopeUuid(scope: MemberScope): string | undefined {
  return scope && 'uuid' in scope ? scope.uuid : undefined;
}

/**
 * SQL fragment narrowing a table to the scope, appending any bind values.
 *
 * Empty for the whole guild, so the common case adds nothing to the query.
 */
export function scopeFilter(scope: MemberScope, alias: string, values: unknown[]): string {
  if (!scope) return '';
  if ('uuid' in scope) return `AND ${alias}.uuid = $${values.push(scope.uuid)}::uuid`;
  // "Not exec" is expressed as a negation rather than a list of the other
  // ranks: an explicit list silently drops any rank nobody remembered to add.
  // Barracuda (45 members) was exactly that — it existed in discord_links but
  // not in the hardcoded hierarchy, so it fell into neither cohort and two
  // thirds of guild playtime went unaccounted for.
  const test = 'notRanks' in scope
    ? `NOT (dl.rank = ANY($${values.push(scope.notRanks)}::text[]))`
    : `dl.rank = ANY($${values.push(scope.ranks)}::text[])`;
  return `AND ${alias}.uuid IN (
            SELECT dl.uuid FROM discord_links dl
            WHERE dl.linked AND dl.uuid IS NOT NULL AND ${test})`;
}

/** First record for a metric family, as a SQL expression for the `all` floor. */
const FIRST_RECORD = {
  playtime_daily: `(SELECT MIN(day)::timestamp FROM playtime_daily)`,
  presence: `(SELECT MIN(hour) FROM presence_coverage_hourly WHERE ticks_observed > 0)`,
  events: (kindParam: string) =>
    `(SELECT MIN(occurred_at) FROM guild_activity_events WHERE kind = ${kindParam})`,
};

/**
 * Range as a Postgres interval, or null for unbounded.
 *
 * Both ends of every window are derived from the database's NOW() rather than
 * from the Node process's clock. Mixing the two put the start of the window on
 * one clock and its end on another, which shifts the final bucket whenever the
 * app server and Postgres disagree about the time.
 */
export function intervalFor(range: RangeKey): string | null {
  const days = RANGE_DAYS[range];
  return days === null ? null : `${days} days`;
}

export function isMetric(v: string | null): v is Metric {
  return !!v && (METRICS as string[]).includes(v);
}

export function isRange(v: string | null): v is RangeKey {
  return !!v && (RANGES as string[]).includes(v);
}

/**
 * Reject anything Postgres would choke on inside AT TIME ZONE. The value is
 * always passed as a bind parameter, so this is about returning 400 instead of
 * 500 — not about injection.
 */
export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Bucket width for a metric over a range.
 *
 * playtime has no finer grain than a day no matter how short the range, so it
 * never returns 'hour'. Everything else follows the range.
 */
/**
 * Ranges where the snapshot metrics read from the hourly counter samples
 * instead of the daily table.
 *
 * member_counters_hourly only describes time since it was deployed, so it can
 * serve short windows but not a year. Longer ranges keep using playtime_daily,
 * which reaches back through the whole snapshot history at day grain.
 */
/**
 * Ranges served from member_counters_hourly — currently none, and the reason
 * is worth keeping.
 *
 * Sampling the cumulative counters hourly looks like it should yield
 * hour-of-day, but Wynncraft does not flush them continuously. Measured
 * against the presence sampler over the same hours: 9 of 13 members who were
 * provably online for a full hour recorded exactly zero playtime in it, while
 * others jumped 3.17, 4.00 and 6.83 hours inside a single hour — more than an
 * hour can hold. The counter records when the server flushed, not when the
 * playing happened. It averages out over a day, which is why the daily
 * snapshot is sound, but at hour grain it is noise.
 *
 * Hour-of-day is already available from sources that timestamp the event
 * itself: presence sampling for who is online, graid_logs for raids,
 * territory_exchanges for captures, snipe_logs for snipes.
 *
 * The sampler still runs and member_counters_hourly still fills: it costs one
 * upsert per tick, it is the evidence behind this note, and it is the only way
 * to tell whether the flush behaviour ever changes. Putting a range back in
 * this list is all that is needed to use it.
 */
const HOURLY_CAPABLE_RANGES: RangeKey[] = [];

/**
 * Could this range be served hourly at all? Whether it actually is depends on
 * how far back the samples reach — see hourlyCoverageQuery.
 */
export function usesHourlyCounters(metric: Metric, range: RangeKey): boolean {
  return isSnapshotMetric(metric) && HOURLY_CAPABLE_RANGES.includes(range);
}

/**
 * Do the hourly samples reach back far enough to cover the whole window?
 *
 * Sampling starts the day it is deployed, so for a while a 7-day window is
 * mostly older than the data. Falling back to the daily table in that case is
 * the difference between a readable week and a wall of empty buckets, and the
 * switch happens on its own as samples accumulate — no date to hard-code and
 * come back to change.
 */
/**
 * Do the presence rollups cover the whole window?
 *
 * Presence and playtime measure the same thing in the same unit — average
 * concurrent players — one by sampling who is online, the other from
 * Wynncraft's daily total. So a short window can be served by presence at hour
 * grain instead of collapsing to a single daily point, and long windows keep
 * the snapshot's years of history. Unlike the cumulative counters, presence
 * timestamps the observation itself, so its hour-of-day is real.
 */
export function presenceCoverageQuery(range: RangeKey): Query {
  // Not "does presence span the window" — that bar is too high early on and
  // produces the worst possible chart while waiting: a 24-hour window on daily
  // data is one bucket wide, which is a dot, not a trend. Instead take
  // whichever source shows more structure. Five sampled hours beat a single
  // daily point at 24h; seven daily points still beat five hours across a
  // week; and once sampling spans the week it wins there too. The comparison
  // re-evaluates itself as data accumulates, with no threshold to tune.
  return {
    text: `
      WITH presence_buckets AS (
        SELECT COUNT(*)::int AS n
        FROM presence_coverage_hourly
        WHERE hour >= NOW() - $1::interval AND ticks_observed > 0
      ), daily_buckets AS (
        SELECT COUNT(DISTINCT day)::int AS n
        FROM playtime_daily
        WHERE day >= ((NOW() - $1::interval) AT TIME ZONE 'UTC')::date
      )
      SELECT p.n >= 2 AND p.n >= d.n AS covered, p.n AS presence_n, d.n AS daily_n
      FROM presence_buckets p, daily_buckets d`,
    values: [intervalFor(range) ?? '7 days'],
  };
}

export function hourlyCoverageQuery(range: RangeKey): Query {
  return {
    text: `SELECT MIN(hour) IS NOT NULL
                  AND MIN(hour) <= date_trunc('hour', NOW() - $1::interval) AS covered
           FROM member_counters_hourly`,
    values: [intervalFor(range) ?? '7 days'],
  };
}

export function bucketFor(metric: Metric, range: RangeKey): Bucket {
  if (isSnapshotMetric(metric)) {
    if (usesHourlyCounters(metric, range)) return 'hour';
    return range === '1y' || range === 'all' ? 'week' : 'day';
  }
  if (range === '24h' || range === '7d') return 'hour';
  if (range === '30d' || range === '90d') return 'day';
  return 'week';
}

export interface TrendPoint {
  t: string;
  value: number;
  /** Presence only: 0–1 share of the bucket the sampler actually observed. */
  coverage?: number;
  /**
   * Snapshot metrics only: share of the bucket's member-days that were
   * interpolated, clamped or capped rather than measured cleanly. Counted by
   * row, so zero-valued adjustments still register.
   */
  approximate?: number;
  /**
   * Presence only: 0–1 share of online members that could be attributed to a
   * uuid. Below 1 means members are hiding their online status — they are in
   * the guild-wide value but absent from any per-member breakdown.
   */
  attributed?: number;
}

export interface Query {
  text: string;
  values: unknown[];
}

/**
 * playtime_daily keyed by DATE. Timezone is deliberately absent: the snapshot
 * runs once a day at 00:01 UTC, so re-slicing it into another zone would imply
 * a precision the source does not have — the window is anchored to UTC days
 * explicitly rather than inheriting whatever zone the session happens to use.
 */
export function playtimeQuery(bucket: Bucket, range: RangeKey, scope?: MemberScope): Query {
  return snapshotQuery('hours', bucket, range, scope);
}

/**
 * Hour-of-day series for a snapshot counter, from member_counters_hourly.
 *
 * Each member's hourly delta is the difference against their previous hourly
 * reading, and only pairs exactly one hour apart are counted: a wider span
 * means the sampler was down, and the activity inside it could have happened
 * at any hour, so crediting it to the closing hour would invent a spike.
 * Negative deltas are floored, matching the daily backfill's treatment of the
 * counter running backwards.
 *
 * coverage is the share of member-hours backed by such a clean pair, so a
 * partially-sampled hour is visibly partial rather than quietly low.
 */
export function hourlyCounterQuery(
  column: 'hours' | 'wars' | 'raids',
  range: RangeKey,
  tz: string,
  scope?: MemberScope,
): Query {
  if (column !== 'hours' && column !== 'wars' && column !== 'raids') {
    throw new Error(`Refusing to interpolate unknown column: ${column}`);
  }
  const source = column === 'hours' ? 'playtime' : column;
  const values: unknown[] = [intervalFor(range) ?? '7 days', tz];
  const uuidFilter = scopeFilter(scope, 'c', values);

  // Playtime is reported as average concurrent players: member-hours accrued
  // in an hour is, by definition, the average number online during it.
  const bucketValue = column === 'hours'
    ? 'COALESCE(SUM(d.delta), 0)'
    : 'COALESCE(SUM(d.delta), 0)';

  return {
    text: `
      WITH window_bounds AS (
        SELECT date_trunc('hour', NOW() - $1::interval) AS from_ts
      ),
      paired AS (
        SELECT c.uuid, c.hour,
               c.${source} - LAG(c.${source}) OVER w AS raw_delta,
               c.hour - LAG(c.hour) OVER w           AS span
        FROM member_counters_hourly c, window_bounds w
        -- Complete hours only. The reading for the hour in progress is
        -- whatever the last tick saw, minutes into it, so its delta covers a
        -- fraction of an hour and lands as a fake collapse at the right edge.
        WHERE c.hour >= w.from_ts - interval '1 hour'
          AND c.hour < date_trunc('hour', NOW()) ${uuidFilter}
        WINDOW w AS (PARTITION BY c.uuid ORDER BY c.hour)
      ),
      d AS (
        SELECT uuid, hour, GREATEST(raw_delta, 0)::float8 AS delta
        FROM paired
        WHERE span = interval '1 hour'
      ),
      series AS (
        SELECT generate_series(
                 date_trunc('hour', (SELECT from_ts FROM window_bounds) AT TIME ZONE $2),
                 date_trunc('hour', (NOW() - interval '1 hour') AT TIME ZONE $2),
                 interval '1 hour') AS t
      ),
      agg AS (
        SELECT date_trunc('hour', d.hour AT TIME ZONE $2) AS t,
               ${bucketValue} AS value,
               COUNT(*)::float8 AS member_hours
        FROM d GROUP BY 1
      ),
      -- How many members reported at all in the hour, clean pair or not.
      seen AS (
        SELECT date_trunc('hour', p.hour AT TIME ZONE $2) AS t,
               COUNT(*)::float8 AS reported
        FROM paired p GROUP BY 1
      )
      SELECT s.t,
             COALESCE(a.value, 0) AS value,
             COALESCE(a.value, 0) AS raw_total,
             CASE WHEN COALESCE(sn.reported, 0) > 0
                  THEN LEAST(1.0, COALESCE(a.member_hours, 0) / sn.reported)
                  ELSE 0 END AS coverage
      FROM series s
      LEFT JOIN agg a  ON a.t  = s.t
      LEFT JOIN seen sn ON sn.t = s.t
      ORDER BY s.t`,
    values,
  };
}

/**
 * Any of the daily snapshot counters (hours / wars / raids) from
 * playtime_daily.
 *
 * The column name is not a bind parameter — Postgres cannot parameterise an
 * identifier — so it is looked up in SNAPSHOT_COLUMNS by the caller and
 * re-checked here against a literal allowlist. Nothing user-supplied reaches
 * the string.
 */
export function snapshotQuery(
  column: 'hours' | 'wars' | 'raids',
  bucket: Bucket,
  range: RangeKey,
  scope?: MemberScope,
): Query {
  if (column !== 'hours' && column !== 'wars' && column !== 'raids') {
    throw new Error(`Refusing to interpolate unknown column: ${column}`);
  }
  const values: unknown[] = [bucket, intervalFor(range)];
  const uuidFilter = scopeFilter(scope, 'p', values);

  // Guild-wide, playtime is average concurrent players: hours across the days
  // actually present, over the hours those days contain. Dividing by the days
  // present rather than the nominal bucket length keeps a part-finished week
  // honest instead of diluted. For one member that ratio is a fraction nobody
  // reads as a player count, so a member's playtime stays in hours. Counters
  // are counts either way.
  const averaged = column === 'hours' && !scopeUuid(scope)
    ? 'SUM(p.hours)::float8 / NULLIF(COUNT(DISTINCT p.day) * 24, 0)'
    : `SUM(p.${column})::float8`;

  return {
    text: `
      WITH bounds AS (
        SELECT date_trunc($1, COALESCE((NOW() - $2::interval) AT TIME ZONE 'UTC',
                                       ${FIRST_RECORD.playtime_daily},
                                       TIMESTAMP '${EPOCH_FLOOR}')) AS from_t,
               -- Stop at the last day that has a snapshot, not at today. The
               -- snapshot for the current day does not exist until 00:01
               -- tomorrow, so running the series to "now" appends a bucket
               -- that is always zero and reads as a nightly collapse.
               -- LEAST ignores NULL, so an empty table falls back to now.
               LEAST(date_trunc($1, NOW() AT TIME ZONE 'UTC'),
                     date_trunc($1, (SELECT MAX(day) FROM playtime_daily)::timestamp)) AS to_t
      ),
      series AS (
        SELECT generate_series(bounds.from_t, bounds.to_t, ('1 ' || $1)::interval) AS t
        FROM bounds
      ),
      agg AS (
        SELECT date_trunc($1, p.day::timestamp) AS t,
               ${averaged} AS value,
               SUM(p.${column})::float8 AS raw_total,
               -- Counted by row, not weighted by value. A clamped row carries
               -- zero hours, so an hours-weighted ratio reports almost no
               -- adjustment for exactly the buckets adjusted the most: on
               -- 2026-04-25 Wynncraft revised around 95 members playtime
               -- downward, and an hours-weighted signal called that day clean.
               -- (Avoid the percent sign in this SQL: psycopg2-based tooling
               -- reads it as a parameter format.)
               COUNT(*) FILTER (WHERE p.source <> 'exact')::float8 AS adjusted_rows,
               COUNT(*)::float8 AS total_rows
        FROM playtime_daily p, bounds
        WHERE p.day >= bounds.from_t::date ${uuidFilter}
        GROUP BY 1
      )
      SELECT s.t,
             COALESCE(a.value, 0) AS value,
             COALESCE(a.raw_total, 0) AS raw_total,
             CASE WHEN COALESCE(a.total_rows, 0) > 0
                  THEN a.adjusted_rows / a.total_rows ELSE 0 END AS approximate
      FROM series s LEFT JOIN agg a ON a.t = s.t
      ORDER BY s.t`,
    values,
  };
}

/**
 * The single figure a stat tile shows for a window: a count for counted
 * metrics, an average for averaged ones.
 *
 * Summing the per-bucket points would be wrong for the averaged metrics — the
 * mean of daily averages is not the range's average once buckets differ in
 * length — so the headline is computed over the whole window in one go, and
 * the previous window uses exactly the same expression so the delta compares
 * like with like.
 *
 * `previous` shifts to the equal-length window immediately before; it returns
 * null for the unbounded range, which has no "before".
 */
export function headlineQuery(
  metric: Metric,
  range: RangeKey,
  scope?: MemberScope,
  previous = false,
  /** Whether the caller resolved this range to the hourly samples. */
  hourly = usesHourlyCounters(metric, range),
): Query | null {
  const interval = intervalFor(range);
  if (previous && !interval) return null;

  // Unbounded current window reaches back to the floor; every other case is
  // one or two interval-widths back from now.
  const from = interval ? (previous ? `NOW() - 2 * $1::interval` : `NOW() - $1::interval`)
                        : `TIMESTAMPTZ '${EPOCH_FLOOR}'`;
  const to = previous ? `NOW() - $1::interval` : `NOW()`;
  const base: unknown[] = interval ? [interval] : [];

  // Short windows read the hourly samples, so the headline matches the series
  // rather than being computed off a different table.
  if (isSnapshotMetric(metric) && hourly) {
    const column = SNAPSHOT_COLUMNS[metric]!;
    const source = column === 'hours' ? 'playtime' : column;
    const values = [...base];
    const uuidFilter = scopeFilter(scope, 'c', values);
    const shift = previous ? '2 * $1::interval' : '$1::interval';
    const upper = previous ? `AND c.hour < date_trunc('hour', NOW() - $1::interval)` : '';
    // Member-hours accrued in an hour is the average concurrency during it, so
    // playtime averages across hours while counters sum.
    const expr = column === 'hours'
      ? `COALESCE(SUM(delta) / NULLIF(COUNT(DISTINCT hour), 0), 0)`
      : `COALESCE(SUM(delta), 0)`;
    return {
      text: `
        WITH paired AS (
          SELECT c.uuid, c.hour,
                 c.${source} - LAG(c.${source}) OVER w AS raw_delta,
                 c.hour - LAG(c.hour) OVER w           AS span
          FROM member_counters_hourly c
          WHERE c.hour >= date_trunc('hour', NOW() - ${shift}) - interval '1 hour'
                AND c.hour < date_trunc('hour', NOW())
                ${upper} ${uuidFilter}
          WINDOW w AS (PARTITION BY c.uuid ORDER BY c.hour)
        ), d AS (
          SELECT hour, GREATEST(raw_delta, 0)::float8 AS delta
          FROM paired WHERE span = interval '1 hour'
        )
        SELECT ${expr}::float8 AS total FROM d`,
      values,
    };
  }

  if (isSnapshotMetric(metric)) {
    const column = SNAPSHOT_COLUMNS[metric]!;
    const values = [...base];
    const uuidFilter = scopeFilter(scope, 'p', values);
    const expr = column === 'hours' && !scopeUuid(scope)
      ? `COALESCE(SUM(p.hours)::float8 / NULLIF(COUNT(DISTINCT p.day) * 24, 0), 0)`
      : `COALESCE(SUM(p.${column}), 0)::float8`;
    // Compared on date boundaries, exactly as the series is. Comparing a DATE
    // against a timestamp cutoff drops the boundary day, because the date casts
    // to midnight and the cutoff is partway through it — which silently lost one
    // day in thirty, and every day of a 24-hour window.
    const lowerDate = interval
      ? `((NOW() ${previous ? '- 2 * $1::interval' : '- $1::interval'}) AT TIME ZONE 'UTC')::date`
      : `DATE '${EPOCH_FLOOR}'`;
    const upperClause = previous
      ? `AND p.day < ((NOW() - $1::interval) AT TIME ZONE 'UTC')::date`
      : '';
    return {
      text: `SELECT ${expr} AS total
             FROM playtime_daily p
             WHERE p.day >= ${lowerDate} ${upperClause} ${uuidFilter}`,
      values,
    };
  }

  if (metric === 'presence') {
    const values = [...base];
    const expr = scope
      ? `COALESCE(SUM(p.minutes)::float8 / 60.0, 0)`
      : `COALESCE(AVG(c.online_avg), 0)::float8`;
    if (scope) {
      const filter = scopeFilter(scope, 'p', values);
      return {
        text: `SELECT ${expr} AS total FROM presence_hourly p
               WHERE p.hour >= ${from} AND p.hour < ${to} ${filter}`,
        values,
      };
    }
    return {
      text: `SELECT ${expr} AS total FROM presence_coverage_hourly c
             WHERE c.hour >= ${from} AND c.hour < ${to}`,
      values,
    };
  }

  const values = [...base];
  const kindIdx = values.push(EVENT_KINDS[metric]);
  return {
    text: `SELECT COALESCE(${eventAggregate(metric)}, 0) AS total
           FROM guild_activity_events e
           WHERE e.kind = $${kindIdx} AND e.occurred_at >= ${from} AND e.occurred_at < ${to}`,
    values,
  };
}

/**
 * Most recent data point a metric has, ignoring the requested range.
 *
 * An all-zero chart is ambiguous — no activity, or no data that far forward?
 * This lets the empty state say which, instead of leaving the reader to guess.
 */
export function latestPointQuery(metric: Metric): Query {
  if (isSnapshotMetric(metric)) {
    return { text: `SELECT MAX(day)::timestamptz AS latest FROM playtime_daily`, values: [] };
  }
  if (metric === 'presence') {
    return { text: `SELECT MAX(hour) AS latest FROM presence_coverage_hourly`, values: [] };
  }
  return {
    text: `SELECT MAX(occurred_at) AS latest FROM guild_activity_events WHERE kind = $1`,
    values: [EVENT_KINDS[metric]],
  };
}

/**
 * Member-hours online per bucket, plus the observed-tick share so the chart can
 * tell a quiet hour from an unsampled one.
 *
 * Two different sources, deliberately:
 *
 *   guild-wide  – presence_coverage_hourly.online_avg, which is the guild
 *                 endpoint's own count. Members who restrict online_status are
 *                 counted there but report their per-member flag as false, so
 *                 summing presence_hourly instead would silently omit them
 *                 (measured at 10 of 150 members).
 *   per-member  – presence_hourly, which is all that can name a uuid. Its
 *                 total is the attributable subset by construction, and the
 *                 caller is told so via `attributed`.
 *
 * An hour's online_avg is an average concurrency, so it contributes that many
 * member-hours to its bucket.
 */
export function presenceQuery(bucket: Bucket, range: RangeKey, tz: string, scope?: MemberScope): Query {
  const values: unknown[] = [bucket, intervalFor(range), tz];
  const uuidFilter = scopeFilter(scope, 'p', values);
  // online_avg is already average concurrency within its hour, so the mean of
  // it across a bucket's hours is the bucket's average concurrency — and it
  // matches the unit playtime is reported in. Summing would give member-hours,
  // a quantity nobody can picture. raw_total keeps the sum for the tooltip.
  const aggSource = scope
    ? `SELECT date_trunc($1, p.hour AT TIME ZONE $3) AS t,
              SUM(p.minutes)::float8 / 60.0 AS value,
              SUM(p.minutes)::float8 / 60.0 AS raw_total
       FROM presence_hourly p, window_bounds w
       WHERE p.hour >= w.from_ts ${uuidFilter}
       GROUP BY 1`
    : `SELECT date_trunc($1, c.hour AT TIME ZONE $3) AS t,
              AVG(c.online_avg)::float8 AS value,
              SUM(c.online_avg)::float8 AS raw_total
       FROM presence_coverage_hourly c, window_bounds w
       WHERE c.hour >= w.from_ts
       GROUP BY 1`;
  return {
    text: `
      WITH window_bounds AS (
        SELECT COALESCE(NOW() - $2::interval,
                        ${FIRST_RECORD.presence},
                        TIMESTAMPTZ '${EPOCH_FLOOR}') AS from_ts
      ),
      bounds AS (
        SELECT date_trunc($1, w.from_ts AT TIME ZONE $3) AS from_t,
               date_trunc($1, NOW()     AT TIME ZONE $3) AS to_t
        FROM window_bounds w
      ),
      series AS (
        SELECT generate_series(bounds.from_t, bounds.to_t, ('1 ' || $1)::interval) AS t
        FROM bounds
      ),
      agg AS (${aggSource}),
      cov AS (
        SELECT date_trunc($1, c.hour AT TIME ZONE $3) AS t,
               SUM(c.ticks_observed)::float8 AS ticks,
               SUM(c.online_avg)::float8     AS online_sum,
               SUM(c.attributed_avg)::float8 AS attributed_sum
        FROM presence_coverage_hourly c, window_bounds w
        WHERE c.hour >= w.from_ts
        GROUP BY 1
      ),
      -- Hours the bucket could have held, so coverage is measured against the
      -- calendar rather than against however many hours happen to have rows.
      capacity AS (
        SELECT s.t, COUNT(*)::float8 AS hours_possible
        FROM series s,
             LATERAL generate_series(s.t, s.t + ('1 ' || $1)::interval - interval '1 hour',
                                     interval '1 hour') AS h
        GROUP BY s.t
      )
      SELECT s.t,
             COALESCE(a.value, 0) AS value,
             COALESCE(a.raw_total, 0) AS raw_total,
             LEAST(1.0, COALESCE(cv.ticks, 0) /
                        NULLIF(cap.hours_possible * ${EXPECTED_TICKS_PER_HOUR}, 0)) AS coverage,
             CASE WHEN COALESCE(cv.online_sum, 0) > 0
                  THEN cv.attributed_sum / cv.online_sum ELSE 1 END AS attributed
      FROM series s
      LEFT JOIN agg a       ON a.t  = s.t
      LEFT JOIN cov cv      ON cv.t = s.t
      LEFT JOIN capacity cap ON cap.t = s.t
      ORDER BY s.t`,
    values,
  };
}

/**
 * Events from guild_activity_events, bucketed in the viewer's zone — counted by
 * participants where the metric is weighted, otherwise by event. raw_total
 * always carries the plain event count, so the tooltip can show both and the
 * average party size stays recoverable.
 */
export function eventQuery(metric: Metric, bucket: Bucket, range: RangeKey, tz: string): Query {
  const kind = EVENT_KINDS[metric]!;
  return {
    text: `
      WITH window_bounds AS (
        SELECT COALESCE(NOW() - $2::interval,
                        ${FIRST_RECORD.events('$4')},
                        TIMESTAMPTZ '${EPOCH_FLOOR}') AS from_ts
      ),
      bounds AS (
        SELECT date_trunc($1, w.from_ts AT TIME ZONE $3) AS from_t,
               date_trunc($1, NOW()     AT TIME ZONE $3) AS to_t
        FROM window_bounds w
      ),
      series AS (
        SELECT generate_series(bounds.from_t, bounds.to_t, ('1 ' || $1)::interval) AS t
        FROM bounds
      ),
      agg AS (
        SELECT date_trunc($1, e.occurred_at AT TIME ZONE $3) AS t,
               ${eventAggregate(metric)} AS value,
               COUNT(*)::float8 AS raw_total
        FROM guild_activity_events e, window_bounds w
        WHERE e.kind = $4 AND e.occurred_at >= w.from_ts
        GROUP BY 1
      )
      SELECT s.t,
             COALESCE(a.value, 0) AS value,
             COALESCE(a.raw_total, 0) AS raw_total
      FROM series s LEFT JOIN agg a ON a.t = s.t
      ORDER BY s.t`,
    values: [bucket, intervalFor(range), tz, kind],
  };
}

export interface HeatmapCell {
  dow: number;   // 0 = Monday
  hour: number;  // 0–23 in the requested zone
  total: number;
  occurrences: number;
  average: number;
}

/**
 * How often each (day-of-week, hour) slot occurred in the window, so cells can
 * be averaged. Without this a Monday 20:00 in a 30-day range is summed over
 * four or five occurrences depending on where the month landed, and the grid
 * shows calendar accidents as activity.
 */
export function slotOccurrenceQuery(range: RangeKey, tz: string, metric?: Metric): Query {
  // On an unbounded range, counting calendar slots from a fixed floor divides
  // by years in which the metric did not yet exist, understating every cell.
  const floor = metric && EVENT_KINDS[metric]
    ? `${FIRST_RECORD.events('$3')}, `
    : '';
  const values: unknown[] = [intervalFor(range), tz];
  if (floor) values.push(EVENT_KINDS[metric!]);
  return {
    text: `
      WITH window_bounds AS (
        SELECT COALESCE(NOW() - $1::interval, ${floor}
                        TIMESTAMPTZ '${EPOCH_FLOOR}') AS from_ts
      )
      SELECT EXTRACT(ISODOW FROM h)::int - 1 AS dow,
             EXTRACT(HOUR   FROM h)::int     AS hour,
             COUNT(*)::int                   AS occurrences
      FROM window_bounds w,
           generate_series(date_trunc('hour', w.from_ts),
                           date_trunc('hour', NOW()),
                           interval '1 hour') g(utc_hour),
           LATERAL (SELECT g.utc_hour AT TIME ZONE $2 AS h) local
      GROUP BY 1, 2`,
    values,
  };
}

/**
 * Occurrences for the presence grid: hours actually sampled, not hours on the
 * calendar.
 *
 * For an event metric the calendar is the right denominator — a slot with no
 * captures genuinely had none. Presence is different: an unsampled hour is not
 * a quiet hour, and dividing by calendar occurrences scales every cell down by
 * the share of time the sampler was not running. With four hours of history
 * the same data read 3.0 over a 30-day window and 0.3 over a year, purely
 * because the year contains more unobserved slots.
 */
export function presenceOccurrenceQuery(range: RangeKey, tz: string): Query {
  return {
    text: `
      WITH window_bounds AS (
        SELECT COALESCE(NOW() - $1::interval, TIMESTAMPTZ '${EPOCH_FLOOR}') AS from_ts
      )
      SELECT EXTRACT(ISODOW FROM c.hour AT TIME ZONE $2)::int - 1 AS dow,
             EXTRACT(HOUR   FROM c.hour AT TIME ZONE $2)::int     AS hour,
             COUNT(*)::int                                        AS occurrences
      FROM presence_coverage_hourly c, window_bounds w
      WHERE c.hour >= w.from_ts AND c.ticks_observed > 0
      GROUP BY 1, 2`,
    values: [intervalFor(range), tz],
  };
}

export function eventHeatmapQuery(metric: Metric, range: RangeKey, tz: string): Query {
  return {
    text: `
      WITH window_bounds AS (
        SELECT COALESCE(NOW() - $1::interval, TIMESTAMPTZ '${EPOCH_FLOOR}') AS from_ts
      )
      SELECT EXTRACT(ISODOW FROM e.occurred_at AT TIME ZONE $2)::int - 1 AS dow,
             EXTRACT(HOUR   FROM e.occurred_at AT TIME ZONE $2)::int     AS hour,
             ${eventAggregate(metric)} AS total
      FROM guild_activity_events e, window_bounds w
      WHERE e.kind = $3 AND e.occurred_at >= w.from_ts
      GROUP BY 1, 2`,
    values: [intervalFor(range), tz, EVENT_KINDS[metric]],
  };
}

/**
 * Hour-of-day grid for a snapshot counter, from the same clean one-hour pairs
 * the trend uses. Only covers time since hourly sampling was deployed.
 */
export function hourlyCounterHeatmapQuery(
  column: 'hours' | 'wars' | 'raids',
  range: RangeKey,
  tz: string,
): Query {
  if (column !== 'hours' && column !== 'wars' && column !== 'raids') {
    throw new Error(`Refusing to interpolate unknown column: ${column}`);
  }
  const source = column === 'hours' ? 'playtime' : column;
  return {
    text: `
      WITH window_bounds AS (
        SELECT COALESCE(NOW() - $1::interval, TIMESTAMPTZ '${EPOCH_FLOOR}') AS from_ts
      ),
      paired AS (
        SELECT c.uuid, c.hour,
               c.${source} - LAG(c.${source}) OVER w AS raw_delta,
               c.hour - LAG(c.hour) OVER w           AS span
        FROM member_counters_hourly c, window_bounds w
        WHERE c.hour >= w.from_ts - interval '1 hour'
          AND c.hour < date_trunc('hour', NOW())
        WINDOW w AS (PARTITION BY c.uuid ORDER BY c.hour)
      )
      SELECT EXTRACT(ISODOW FROM hour AT TIME ZONE $2)::int - 1 AS dow,
             EXTRACT(HOUR   FROM hour AT TIME ZONE $2)::int     AS hour,
             SUM(GREATEST(raw_delta, 0))::float8                AS total
      FROM paired
      WHERE span = interval '1 hour'
      GROUP BY 1, 2`,
    values: [intervalFor(range), tz],
  };
}

/** Same two-source split as presenceQuery: guild-wide is authoritative, a uuid
 *  filter necessarily falls back to what presence_buckets could attribute. */
export function presenceHeatmapQuery(range: RangeKey, tz: string, scope?: MemberScope): Query {
  const values: unknown[] = [intervalFor(range), tz];
  const uuidFilter = scopeFilter(scope, 'p', values);
  const body = scope
    ? `SELECT EXTRACT(ISODOW FROM p.hour AT TIME ZONE $2)::int - 1 AS dow,
              EXTRACT(HOUR   FROM p.hour AT TIME ZONE $2)::int     AS hour,
              SUM(p.minutes)::float8 / 60.0 AS total
       FROM presence_hourly p, window_bounds w
       WHERE p.hour >= w.from_ts ${uuidFilter}
       GROUP BY 1, 2`
    : `SELECT EXTRACT(ISODOW FROM c.hour AT TIME ZONE $2)::int - 1 AS dow,
              EXTRACT(HOUR   FROM c.hour AT TIME ZONE $2)::int     AS hour,
              SUM(c.online_avg)::float8 AS total
       FROM presence_coverage_hourly c, window_bounds w
       WHERE c.hour >= w.from_ts
       GROUP BY 1, 2`;
  return {
    text: `
      WITH window_bounds AS (
        SELECT COALESCE(NOW() - $1::interval, TIMESTAMPTZ '${EPOCH_FLOOR}') AS from_ts
      )
      ${body}`,
    values,
  };
}

/**
 * Expand sparse (dow, hour) aggregates into the dense 7x24 grid the UI draws.
 * A slot the guild never touched must still be a cell, or the grid silently
 * reshapes itself around whichever hours happen to have data.
 */
export function buildHeatmapGrid(
  totals: { dow: number; hour: number; total: number }[],
  occurrences: { dow: number; hour: number; occurrences: number }[],
): HeatmapCell[] {
  const totalBy = new Map(totals.map((r) => [`${r.dow}:${r.hour}`, Number(r.total)]));
  const occBy = new Map(occurrences.map((r) => [`${r.dow}:${r.hour}`, Number(r.occurrences)]));

  const cells: HeatmapCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const key = `${dow}:${hour}`;
      const total = totalBy.get(key) ?? 0;
      const occ = occBy.get(key) ?? 0;
      cells.push({ dow, hour, total, occurrences: occ, average: occ > 0 ? total / occ : 0 });
    }
  }
  return cells;
}

/**
 * The busiest contiguous window in the grid, aggregated across all days —
 * the "schedule wars here" answer the heatmap exists to give.
 */
export function bestWindow(cells: HeatmapCell[], hours: number): { startHour: number; average: number } {
  const byHour = new Array(24).fill(0);
  for (const c of cells) byHour[c.hour] += c.average;

  let best = { startHour: 0, average: -1 };
  for (let start = 0; start < 24; start++) {
    let sum = 0;
    for (let i = 0; i < hours; i++) sum += byHour[(start + i) % 24];
    const avg = sum / hours;
    if (avg > best.average) best = { startHour: start, average: avg };
  }
  return best;
}
