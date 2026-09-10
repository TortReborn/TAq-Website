import { Pool } from 'pg';
import { loadChronicleData } from './chronicle-db';
import { resolveWikiSlugs } from './wiki-db';
import { slugify } from './wiki';
import {
  AllianceEmbedData,
  WarChartEmbedData,
  WikiEmbedData,
  WikiEmbedMap,
  WIKI_EMBED_DATE_RE,
  WAR_CHART_MAX_WEEKS,
  clipWarChartEnd,
  weightedWeekMean,
  extractWikiEmbeds,
} from './wiki-embeds';

/**
 * Server-side resolution of wiki embed directives against the chronicle and
 * territory_exchanges tables. Bad directives resolve to {kind:'error'} so the
 * article still renders with an inline notice instead of failing the page.
 */

const WEEK_MS = 7 * 24 * 3600 * 1000;

type ChronicleLoad = ReturnType<typeof loadChronicleData>;

async function resolveAllianceEmbed(pool: Pool, chronicle: ChronicleLoad, name: string): Promise<WikiEmbedData> {
  const { alliances } = await chronicle;
  const needle = name.toLowerCase();
  const alliance =
    alliances.find(a => a.name.toLowerCase() === needle) ??
    alliances.find(a => a.tag.toLowerCase() === needle);
  if (!alliance) return { kind: 'error', message: `No chronicle alliance named “${name}”` };

  let startsAt = '';
  let endsAt: string | null = '';
  for (const m of alliance.memberships) {
    if (!startsAt || m.joinedAt < startsAt) startsAt = m.joinedAt;
    if (endsAt !== null) {
      if (m.leftAt === null) endsAt = null;
      else if (m.leftAt > endsAt) endsAt = m.leftAt;
    }
  }
  const slug = slugify(alliance.name);
  const existing = await resolveWikiSlugs(pool, [slug]);

  const data: AllianceEmbedData = {
    kind: 'alliance',
    name: alliance.name,
    tag: alliance.tag,
    color: alliance.color,
    allianceKind: alliance.kind,
    description: alliance.description,
    startsAt,
    endsAt: endsAt === '' ? null : endsAt,
    members: alliance.memberships.map(m => ({ guild: m.guild, joinedAt: m.joinedAt, leftAt: m.leftAt })),
    wikiSlug: existing.has(slug) ? slug : null,
  };
  return data;
}

/**
 * Weekly time-weighted holdings for two guilds.
 *
 * This chart used to plot each guild's captures against the other, week by
 * week, and that series could not say anything. Territory is conserved: what A
 * takes from B, B has to take back before it can be taken again, so over any
 * bucket the two counts differ only by the change in how many of the contested
 * squares each side ends up holding — a few dozen at most, against five-figure
 * capture volumes. Measured across the corpus the two lines ran at r ≥ 0.9958
 * on five of the six war pages: one line drawn twice. Worse, it flattered the
 * loser — the KongoBoys campaign against Profession Heaven, which ended a
 * five-year neutrality, plotted as 3,837 against 4,034, near parity.
 *
 * Holdings are the state the fighting was over, and they diverge: the same six
 * windows come out between r = -0.14 and r = -0.86, one side's gain being the
 * other's loss, which is what a war looks like.
 *
 * A square's holder is the attacker of the last exchange on it, so the series
 * is built from spans and clipped into weekly buckets. Two details matter:
 *
 * - `attacker_name = 'None'` is the release sentinel, not a guild. It ends a
 *   holding without starting one, which the `holder IN (a, b)` filter gets
 *   right for free.
 * - The feed sometimes writes a whole chain under one timestamp (X takes from
 *   Y, then Z takes from X, same second). Ordering those by time alone leaves
 *   `lead()` to break the tie arbitrarily and hands the following span — which
 *   can be a fortnight — to a guild that had already lost it. The row whose
 *   defender is another row's attacker in the same group happened second, and
 *   that resolves all but a handful: of 869 collisions in the Avicia–Sequoia
 *   window, 829 order cleanly and 40 are cycles (`None ← Avicia` beside
 *   `Avicia ← None`) that nothing in the row itself can separate. Those 40
 *   moved the drawn series by at most one territory-week, so they are left
 *   arbitrary rather than resolved by a second lookup.
 */
const HOLDINGS_SQL = `
WITH b AS (SELECT $3::timestamptz AS s, $4::timestamptz AS e),
terr AS (
  SELECT DISTINCT territory FROM territory_exchanges, b
   WHERE attacker_name IN ($1,$2) AND exchange_time < b.e
),
rel AS (
  SELECT te.territory, te.attacker_name, te.defender_name, te.exchange_time
    FROM terr JOIN territory_exchanges te USING (territory), b
   WHERE te.exchange_time >= b.s AND te.exchange_time < b.e
  UNION ALL
  SELECT terr.territory, x.attacker_name, x.defender_name, x.exchange_time
    FROM terr, b, LATERAL (
      SELECT attacker_name, defender_name, exchange_time FROM territory_exchanges te
       WHERE te.territory = terr.territory AND te.exchange_time < b.s
       ORDER BY te.exchange_time DESC LIMIT 1) x
),
ord AS (
  SELECT territory, attacker_name, exchange_time,
         (defender_name = ANY(array_agg(attacker_name)
            OVER (PARTITION BY territory, exchange_time)))::int AS seq
    FROM rel
),
sp AS (
  SELECT attacker_name AS holder,
         greatest(exchange_time, (SELECT s FROM b)) AS t0,
         coalesce(lead(exchange_time) OVER (PARTITION BY territory ORDER BY exchange_time, seq),
                  (SELECT e FROM b)) AS t1
    FROM ord
),
w AS (
  SELECT i,
         (SELECT s FROM b) + (i * interval '7 days') AS ws,
         least((SELECT s FROM b) + ((i+1) * interval '7 days'), (SELECT e FROM b)) AS we
    FROM generate_series(0, ceil(extract(epoch FROM (SELECT e-s FROM b))/604800)::int - 1) AS i
)
SELECT to_char(w.ws AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS week,
       coalesce(sum(EXTRACT(epoch FROM least(sp.t1,w.we) - greatest(sp.t0,w.ws)))
         FILTER (WHERE sp.holder = $1), 0) / EXTRACT(epoch FROM w.we - w.ws) AS a_held,
       coalesce(sum(EXTRACT(epoch FROM least(sp.t1,w.we) - greatest(sp.t0,w.ws)))
         FILTER (WHERE sp.holder = $2), 0) / EXTRACT(epoch FROM w.we - w.ws) AS b_held
  FROM w LEFT JOIN sp ON sp.t0 < w.we AND sp.t1 > w.ws AND sp.holder IN ($1,$2)
 GROUP BY w.i, w.ws, w.we ORDER BY w.i`;

/**
 * Days inside the window with nothing in the log at all, grouped into runs of
 * two or more. A holdings chart has to say when it is guessing: where a capture
 * chart draws an honest zero across a hole in the record, this one carries the
 * last known holder forward and draws a calm, stable front. Twenty such runs
 * exist since 2018, the longest 28 days.
 */
const GAPS_SQL = `
WITH d AS (
  SELECT DISTINCT date_trunc('day', exchange_time)::date AS day
    FROM territory_exchanges
   WHERE exchange_time >= $1::timestamptz AND exchange_time < $2::timestamptz
),
all_days AS (
  SELECT generate_series($1::timestamptz, $2::timestamptz - interval '1 day', interval '1 day')::date AS day
),
missing AS (
  SELECT a.day, a.day - (row_number() OVER (ORDER BY a.day))::int AS grp
    FROM all_days a LEFT JOIN d USING (day) WHERE d.day IS NULL
)
SELECT to_char(min(day), 'YYYY-MM-DD') AS "from", to_char(max(day), 'YYYY-MM-DD') AS "to",
       count(*)::int AS days
  FROM missing GROUP BY grp HAVING count(*) >= 2 ORDER BY min(day)`;

/**
 * The holdings query walks every exchange in the window, which runs to seconds
 * on a year-long war, and wiki pages are force-dynamic. The windows are closed
 * historical spans whose answer cannot change, so they are cached for a day;
 * a window still running gets five minutes so the live edge stays honest.
 */
type CacheEntry = { at: number; ttl: number; value: WikiEmbedData };
const warChartCache = new Map<string, CacheEntry>();
const WAR_CHART_TTL_CLOSED = 24 * 3600 * 1000;
const WAR_CHART_TTL_LIVE = 5 * 60 * 1000;

async function resolveWarChartEmbed(pool: Pool, args: string[]): Promise<WikiEmbedData> {
  const [guildA, guildB, start, end] = args;
  if (!guildA || !guildB || !start || !end) {
    return { kind: 'error', message: 'war-chart needs: Guild A|Guild B|start date|end date' };
  }
  if (!WIKI_EMBED_DATE_RE.test(start) || !WIKI_EMBED_DATE_RE.test(end)) {
    return { kind: 'error', message: 'war-chart dates must be YYYY-MM-DD' };
  }
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!(endMs > startMs)) return { kind: 'error', message: 'war-chart end date must be after start' };
  if (endMs - startMs > WAR_CHART_MAX_WEEKS * WEEK_MS) {
    return { kind: 'error', message: `war-chart window is capped at ${WAR_CHART_MAX_WEEKS} weeks` };
  }

  const key = args.join('|');
  const hit = warChartCache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value;

  const value = await computeWarChart(pool, guildA, guildB, start, end, startMs, endMs);
  const live = value.kind === 'war-chart' && value.truncatedTo !== null;
  warChartCache.set(key, { at: Date.now(), ttl: live ? WAR_CHART_TTL_LIVE : WAR_CHART_TTL_CLOSED, value });
  return value;
}

async function computeWarChart(
  pool: Pool, guildA: string, guildB: string, start: string, end: string,
  startMs: number, endMs: number,
): Promise<WikiEmbedData> {
  // A directive may name an end date past the last row in the log — the live
  // wars do, because they were written while still being fought. Drawing to it
  // would extend the final holder over days nothing is known about.
  const { rows: last } = await pool.query(
    `SELECT to_char(max(exchange_time) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d FROM territory_exchanges`);
  const lastDay: string | null = last[0]?.d ?? null;
  const { end: effEnd, truncatedTo } = clipWarChartEnd(end, lastDay);
  if (truncatedTo) {
    endMs = Date.parse(`${effEnd}T00:00:00Z`);
    if (!(endMs > startMs)) {
      return { kind: 'error', message: `The capture log ends ${lastDay}, before this window opens` };
    }
  }
  const from = `${start}T00:00:00Z`;
  const to = `${effEnd}T00:00:00Z`;

  const [held, gapRows, exch] = await Promise.all([
    pool.query(HOLDINGS_SQL, [guildA, guildB, from, to]),
    pool.query(GAPS_SQL, [from, to]),
    pool.query(
      `SELECT count(*)::int AS n FROM territory_exchanges
        WHERE exchange_time >= $3::timestamptz AND exchange_time < $4::timestamptz
          AND ((attacker_name = $1 AND defender_name = $2)
            OR (attacker_name = $2 AND defender_name = $1))`,
      [guildA, guildB, from, to]),
  ]);

  const round1 = (v: number) => Math.round(v * 10) / 10;
  const weeks: WarChartEmbedData['weeks'] = held.rows.map(r => ({
    week: r.week as string,
    a: round1(Number(r.a_held)),
    b: round1(Number(r.b_held)),
  }));
  if (weeks.length === 0) {
    return { kind: 'error', message: `No capture log covers ${start} to ${effEnd}` };
  }

  const exchanges = Number(exch.rows[0]?.n ?? 0);
  const peak = Math.max(...weeks.map(w => Math.max(w.a, w.b)));
  if (exchanges === 0 && peak === 0) {
    return {
      kind: 'error',
      message: `Neither “${guildA}” nor “${guildB}” appears in that window — check the full guild names`,
    };
  }

  return {
    kind: 'war-chart',
    guildA, guildB, start, end: effEnd,
    weeks,
    meanA: weightedWeekMean(weeks.map(w => w.a), startMs, endMs),
    meanB: weightedWeekMean(weeks.map(w => w.b), startMs, endMs),
    exchanges,
    gaps: gapRows.rows.map(g => ({ from: g.from as string, to: g.to as string, days: Number(g.days) })),
    truncatedTo,
  };
}

export async function resolveWikiEmbeds(pool: Pool, body: string): Promise<WikiEmbedMap> {
  const directives = extractWikiEmbeds(body);
  if (directives.length === 0) return {};

  // Lazy single load shared by all alliance directives on the page
  let chronicle: ChronicleLoad | null = null;
  const getChronicle = () => (chronicle ??= loadChronicleData(pool));

  const entries = await Promise.all(directives.map(async (d): Promise<[string, WikiEmbedData]> => {
    try {
      if (d.kind === 'alliance') return [d.raw, await resolveAllianceEmbed(pool, getChronicle(), d.args.join('|'))];
      if (d.kind === 'war-chart') return [d.raw, await resolveWarChartEmbed(pool, d.args)];
      // map: link card only — validate the date, no query
      const [date, label] = d.args;
      if (!WIKI_EMBED_DATE_RE.test(date ?? '')) {
        return [d.raw, { kind: 'error', message: 'map date must be YYYY-MM-DD' }];
      }
      return [d.raw, { kind: 'map', date, label: label || '' }];
    } catch (error) {
      console.error('[wiki-embed] resolution failed:', d.raw, error);
      return [d.raw, { kind: 'error', message: 'Embed failed to load' }];
    }
  }));
  return Object.fromEntries(entries);
}
