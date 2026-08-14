"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useExecActivity } from '@/hooks/useExecActivity';
import TrendChart from '@/components/charts/TrendChart';
import ActivityHeatmap from '@/components/charts/ActivityHeatmap';
import StatTile from '@/components/charts/StatTile';
import {
  useActivityTrend, useActivityHeatmap,
  type TrendMetric, type TrendRange,
} from '@/hooks/useActivityTrends';

const RANGES: { key: TrendRange; label: string; comparison: string }[] = [
  // Comparison strings stay short: they sit inside a narrow tile and wrapping
  // to a second line pushes that tile's value out of line with its neighbours.
  { key: '24h', label: '24 hours', comparison: 'prev. 24h' },
  { key: '7d', label: '7 days', comparison: 'prev. 7d' },
  { key: '30d', label: '30 days', comparison: 'prev. 30d' },
  { key: '90d', label: '90 days', comparison: 'prev. 90d' },
  { key: '1y', label: '1 year', comparison: 'prev. year' },
  { key: 'all', label: 'All time', comparison: '' },
];

interface MetricDef {
  key: TrendMetric;
  label: string;
  /** Tile label, when the full one is too long to fit on one line. */
  short?: string;
  unit: string;
  /** One line: what the number is, and the single caveat that matters. */
  note: string;
  /** Whether it can be placed on an hour-of-day grid. */
  hourly: boolean;
  /** Whether it appears in the trend metric picker. Default true. */
  trendPill?: boolean;
}

const METRICS: MetricDef[] = [
  {
    key: 'playtime', label: 'Players online', short: 'Players', unit: 'avg online', hourly: false,
    note: 'Average number of players online at any given moment. Short ranges come from presence sampling every 3 minutes, so they are hour-by-hour and follow the timezone picker; longer ranges come from Wynncraft’s daily counter, which reaches back years but resolves only to whole UTC days.',
  },
  {
    // Not offered as its own trend: "Players online" already serves short
    // ranges from this exact data. It stays defined because it is the metric
    // behind the hour-of-day grid, where it is the only source with real hours.
    key: 'presence', label: 'Players online', short: 'Players', unit: 'avg online',
    hourly: true, trendPill: false,
    note: 'Sampled every 3 minutes, so this is the one measure with a real hour-of-day. Covers time since sampling was switched on.',
  },
  {
    key: 'wars', label: 'Wars', unit: 'wars', hourly: false,
    note: 'Wars fought by members, from the daily counter. Whole UTC days — Wynncraft’s counters cannot place activity within a day. “Territory captures” is the closest thing with real timestamps.',
  },
  {
    key: 'raid_clears', label: 'Raid clears', unit: 'player-raids', hourly: false,
    note: 'Raids completed, counted per person — a 4-player raid counts 4. From the bot’s daily counter, so whole UTC days; “Guild raids” covers the same activity with exact times.',
  },
  {
    key: 'captures', label: 'Territory captures', short: 'Captures', unit: 'captures', hourly: true,
    note: 'Territories taken by TAq, timestamped to the second. Captures only — losing land is a different question.',
  },
  {
    key: 'raids', label: 'Guild raids', unit: 'player-raids', hourly: true,
    note: 'Logged guild raids, weighted by party size — a 4-player raid counts 4, a solo clear counts 1. Average party is about 3.4, and 13% of raids are solo, so counting raids as events would understate group activity. Hover a point for the raw raid count.',
  },
  {
    key: 'snipes', label: 'Snipes', unit: 'snipes', hourly: true,
    note: 'Logged snipe attempts against enemy HQs, timestamped.',
  },
];

/** The four the page leads with; the rest are still selectable in the chart. */
const HEADLINE: TrendMetric[] = ['playtime', 'wars', 'raid_clears', 'captures'];

/** Remembered timezone choice, so it survives reloads and tab switches. */
const TZ_STORAGE_KEY = 'exec_trends_tz';

/**
 * Whole-hour UTC offsets, UTC-12 through UTC+14.
 *
 * The full IANA list is 429 entries, which is a scroll rather than a picker.
 * Offsets are what the charts actually need: the question is "what do these
 * hours look like where I am", not which municipality's rules apply.
 *
 * The Etc/GMT names invert the sign — Etc/GMT+5 is UTC-5 — so the mapping is
 * built once here and verified against Postgres rather than reasoned about at
 * each call site.
 *
 * Consequence worth knowing: a fixed offset does not observe daylight saving.
 * A region that shifts will read an hour off for part of the year, which is
 * the trade for a list you can take in at a glance.
 */
const UTC_OFFSETS = Array.from({ length: 27 }, (_, i) => {
  const offset = i - 12;
  return {
    tz: offset === 0 ? 'UTC' : `Etc/GMT${offset < 0 ? '+' : '-'}${Math.abs(offset)}`,
    label: offset === 0 ? 'UTC' : `UTC${offset > 0 ? '+' : '−'}${Math.abs(offset)}`,
    offset,
  };
});

/**
 * Well-known places used to describe each offset. Which one lands on which
 * offset is not fixed — half of these shift with daylight saving — so the
 * mapping is worked out from the current date rather than written down.
 */
const LANDMARK_ZONES = [
  'Pacific/Midway', 'Pacific/Honolulu', 'Pacific/Gambier', 'America/Anchorage',
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Halifax', 'America/Sao_Paulo', 'Atlantic/South_Georgia',
  'Atlantic/Cape_Verde', 'Atlantic/Azores', 'Europe/London', 'Europe/Berlin',
  'Europe/Athens', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Dhaka',
  'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
  'Pacific/Guadalcanal', 'Pacific/Auckland', 'Pacific/Apia', 'Pacific/Kiritimati',
];

/** A zone's offset from UTC in hours, right now. */
function currentOffsetHours(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  // Read the wall clock there, then treat it as UTC: the difference is the offset.
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 3_600_000);
}

/** "PDT", or null where the zone has no abbreviation of its own. */
function zoneAbbreviation(tz: string, at: Date): string | null {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(at).find((p) => p.type === 'timeZoneName')?.value;
  // Zones without a real abbreviation report "GMT+7", which says nothing the
  // offset has not already said.
  return name && !/^(GMT|UTC)[+-]?\d*$/.test(name) ? name : null;
}

/** "UTC−7 · PDT Los Angeles" — the offset, plus whose offset it is. */
function describeOffsets(at: Date): Map<number, string> {
  const byOffset = new Map<number, string>();
  for (const tz of LANDMARK_ZONES) {
    let offset: number;
    try {
      offset = currentOffsetHours(tz, at);
    } catch {
      continue; // an unknown zone should not take the picker down
    }
    if (byOffset.has(offset)) continue;
    const abbr = zoneAbbreviation(tz, at);
    const city = tz.split('/').pop()!.replace(/_/g, ' ');
    byOffset.set(offset, abbr ? `${abbr} ${city}` : city);
  }
  return byOffset;
}

/** The viewer's current offset, rounded to the nearest hour. */
function detectOffsetZone(): string {
  const hours = Math.round(-new Date().getTimezoneOffset() / 60);
  return (UTC_OFFSETS.find((z) => z.offset === hours) ?? UTC_OFFSETS[12]).tz;
}

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: '0.75rem',
  border: '1px solid var(--border-card)',
  padding: '1.25rem',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.15rem',
};

function pill(active: boolean): React.CSSProperties {
  return {
    fontSize: '0.75rem',
    padding: '0.3rem 0.7rem',
    borderRadius: '9999px',
    border: `1px solid ${active ? 'var(--color-ocean-400)' : 'var(--border-card)'}`,
    background: active ? 'var(--color-ocean-600)' : 'transparent',
    color: active ? '#ffffff' : 'var(--text-secondary)',
    cursor: 'pointer',
    fontWeight: active ? 700 : 500,
  };
}

/** Metrics that can be narrowed to a member or rank. Captures, guild raids and
 *  snipes are guild-wide events with no such breakdown. */
const MEMBER_METRICS: TrendMetric[] = ['playtime', 'presence', 'wars', 'raid_clears'];

/** Display order for ranks; anything unlisted sorts to the end alphabetically. */
const RANK_ORDER = [
  'Hydra', 'Narwhal', 'Dolphin', 'Sailfish', 'Hammerhead',
  'Swordfish', 'Angler', 'Barracuda', 'Piranha', 'Manatee', 'Starfish',
];

export default function ExecTrendsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const uuid = params.get('uuid') ?? undefined;
  const cohort = params.get('cohort') ?? undefined;
  const memberName = params.get('name') ?? undefined;
  // One selection, three shapes: nothing, a rank cohort, or one member.
  const scoped = Boolean(uuid || cohort);
  const scopeParams = uuid ? `uuid=${uuid}` : cohort ? `cohort=${encodeURIComponent(cohort)}` : '';
  const scopeLabel = uuid
    ? (memberName ?? 'Member')
    : cohort === 'exec' ? 'Executives'
    : cohort === 'non-exec' ? 'Non-executives'
    : cohort?.startsWith('rank:') ? `${cohort.slice(5)} rank`
    : 'Whole guild';

  // Which places sit at each offset today. Computed after mount because it
  // depends on the current date, which the server and client can disagree on
  // mid-request; before then the picker shows bare offsets.
  const [offsetNames, setOffsetNames] = useState<Map<number, string>>(new Map());
  useEffect(() => setOffsetNames(describeOffsets(new Date())), []);

  // Roster, purely for the member picker. SWR shares the cache with the
  // Members tab, so switching tabs costs nothing after the first load.
  const roster = useExecActivity();
  const memberOptions = useMemo(
    () => (roster.data?.members ?? [])
      .map((m) => ({ uuid: m.uuid, name: m.username }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [roster.data],
  );

  // Ranks come from the roster, not a constant: the hardcoded hierarchy was
  // missing Barracuda, which 45 members hold, so it appeared in no cohort.
  const rankOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of roster.data?.members ?? []) {
      const rank = m.discordRank?.trim();
      if (rank) counts.set(rank, (counts.get(rank) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => {
      const ia = RANK_ORDER.indexOf(a);
      const ib = RANK_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [roster.data]);

  // Select values are either "cohort:<token>" or a bare uuid, so one handler
  // covers ranks and individuals without a second control.
  const selectScope = (value: string) => {
    if (!value) {
      router.push('/exec/activity/trends');
      return;
    }
    if (value.startsWith('cohort:')) {
      router.push(`/exec/activity/trends?cohort=${encodeURIComponent(value.slice(7))}`);
      return;
    }
    const name = memberOptions.find((m) => m.uuid === value)?.name ?? '';
    router.push(`/exec/activity/trends?uuid=${value}&name=${encodeURIComponent(name)}`);
  };

  const [range, setRange] = useState<TrendRange>('30d');
  const [chartMetric, setChartMetric] = useState<TrendMetric>('playtime');
  const [heatMetric, setHeatMetric] = useState<TrendMetric>('captures');
  const [tz, setTz] = useState('UTC');
  const [showNotes, setShowNotes] = useState(false);

  // Resolved after mount: the server cannot know the viewer's zone, and
  // guessing during render would desync hydration. A remembered choice wins
  // over detection — someone scheduling for another region should not have to
  // re-pick it on every visit.
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(TZ_STORAGE_KEY) : null;
    // A saved value from before the picker used offsets would no longer be in
    // the list, leaving the select blank; fall back to the detected offset.
    const known = saved && UTC_OFFSETS.some((z) => z.tz === saved);
    setTz(known ? saved! : detectOffsetZone());
  }, []);

  const chooseTz = (next: string) => {
    setTz(next);
    try {
      localStorage.setItem(TZ_STORAGE_KEY, next);
    } catch {
      /* private mode: the picker still works for this session */
    }
  };

  // A guild-wide selection carried into member view would 400 on the API, so
  // fall back to something a member actually has.
  const effectiveChart = scoped && !MEMBER_METRICS.includes(chartMetric) ? 'playtime' : chartMetric;
  const effectiveHeat = scoped && heatMetric !== 'presence' ? 'presence' : heatMetric;

  const rangeDef = RANGES.find((r) => r.key === range)!;
  const chartDef = METRICS.find((m) => m.key === effectiveChart)!;
  const heatDef = METRICS.find((m) => m.key === effectiveHeat)!;
  const headline = scoped ? MEMBER_METRICS.filter((m) => m !== 'presence') : HEADLINE;

  // One request per headline tile, plus the charted metric if it is not one.
  const playtime = useActivityTrend('playtime', range, tz, scopeParams);
  const wars = useActivityTrend('wars', range, tz, scopeParams);
  const raidClears = useActivityTrend('raid_clears', range, tz, scopeParams);
  // Captures are guild-wide; in member view its tile is replaced by presence.
  const captures = useActivityTrend(scoped ? 'presence' : 'captures', range, tz, scopeParams);
  const charted = useActivityTrend(effectiveChart, range, tz, scopeParams);
  const heatmap = useActivityHeatmap(effectiveHeat, range === '24h' ? '7d' : range, tz, scopeParams);

  const byMetric: Record<string, ReturnType<typeof useActivityTrend>> = {
    playtime, wars, raid_clears: raidClears, captures, presence: captures,
  };


  return (
    <div>
      {scoped ? (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {scopeLabel}
            </h2>
            <Link href="/exec/activity/trends" style={{
              fontSize: '0.75rem', color: 'var(--text-secondary)', textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}>
              back to whole guild
            </Link>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0', maxWidth: '62ch' }}>
            {uuid
              ? 'This member’s own history.'
              : 'Only members whose Discord account is linked at this rank — former '
                + 'members keep their history but hold no rank, so cohorts will not sum '
                + 'to the guild total.'}
            {' '}Territory captures, guild raids and snipes are guild-wide and have no such
            breakdown, so they are not shown here. Playtime and wars come from
            Wynncraft&apos;s daily counter and are complete; anyone who hides their online
            status is missing from the hour-by-hour view, because Wynncraft will not say
            {' '}<em>which</em> members are online.
          </p>
        </div>
      ) : (
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: '0 0 1.25rem', maxWidth: '62ch' }}>
          How much the guild is playing, and when — for spotting trends and finding the hours
          we actually have people online.
        </p>
      )}

      {/* One control bar. Everything below reads from it. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center',
        padding: '0.75rem 1rem', marginBottom: '1rem',
        background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.75rem',
      }}>
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '0.15rem' }}>Period</span>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} style={pill(range === r.key)}>{r.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Times shown in</span>
          <select
            value={tz}
            onChange={(e) => chooseTz(e.target.value)}
            style={{
              fontSize: '0.75rem', padding: '0.3rem 0.5rem', borderRadius: '0.375rem',
              border: '1px solid var(--border-card)', background: 'var(--bg-card-solid)',
              color: 'var(--text-primary)', maxWidth: '200px',
            }}
          >
            {UTC_OFFSETS.map((z) => {
              const where = offsetNames.get(z.offset);
              return (
                <option key={z.tz} value={z.tz}>
                  {where ? `${z.label} · ${where}` : z.label}
                </option>
              );
            })}
          </select>
        </div>

        {/* The other way into a member's history; the roster's name links are
            the first, but nothing here pointed at them. */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Showing</span>
          <select
            value={uuid ?? (cohort ? `cohort:${cohort}` : '')}
            onChange={(e) => selectScope(e.target.value)}
            disabled={roster.loading && !roster.data}
            style={{
              fontSize: '0.75rem', padding: '0.3rem 0.5rem', borderRadius: '0.375rem',
              border: '1px solid var(--border-card)', background: 'var(--bg-card-solid)',
              color: 'var(--text-primary)', maxWidth: '190px',
            }}
          >
            <option value="">Whole guild</option>
            <optgroup label="Groups">
              <option value="cohort:exec">Executives</option>
              <option value="cohort:non-exec">Non-executives</option>
            </optgroup>
            <optgroup label="Ranks">
              {rankOptions.map(([rank, count]) => (
                <option key={rank} value={`cohort:rank:${rank}`}>{rank} ({count})</option>
              ))}
            </optgroup>
            <optgroup label="Members">
              {memberOptions.map((m) => (
                <option key={m.uuid} value={m.uuid}>{m.name}</option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      {/* ── Headline numbers, doubling as the chart selector ───────────────── */}
      <h2 style={sectionTitle}>In the last {rangeDef.label.toLowerCase()}</h2>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.6rem' }}>
        Pick one to chart it below.
      </p>
      <div style={{
        display: 'grid', gap: '0.75rem', marginBottom: '1.75rem',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      }}>
        {headline.map((key) => {
          const def = METRICS.find((m) => m.key === key)!;
          const res = byMetric[key];
          return (
            <StatTile
              key={key}
              label={def.short ?? def.label}
              value={res.data?.total ?? 0}
              unit={res.data?.unit ?? def.unit}
              previous={res.data?.previousTotal}
              comparisonLabel={rangeDef.comparison}
              series={res.data?.points.map((p) => p.value)}
              loading={res.loading}
              active={effectiveChart === key}
              onClick={() => setChartMetric(key)}
            />
          );
        })}
      </div>

      {/* ── One chart, one selector ────────────────────────────────────────── */}
      <h2 style={sectionTitle}>Over time</h2>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.6rem' }}>
        {/* The guild note describes average concurrency, which is not what a
            single member's chart shows — it would contradict the tile. */}
        {uuid && effectiveChart === 'playtime'
          ? 'Hours this member played, from Wynncraft’s daily counter. Whole UTC days, '
            + 'so the timezone picker does not apply.'
          : chartDef.note}
        {/* Say which source answered, since the grain and timezone depend on it. */}
        {charted.data?.source === 'daily-snapshot' && (
          <> Over this range a day is the finest grain available, so buckets are whole
            UTC days and the timezone picker does not apply.</>
        )}
        {charted.data?.source === 'presence-samples' && effectiveChart === 'playtime' && (
          <> Served from presence sampling here, so these are real hours in {tz}.</>
        )}
        {/* Only the presence request carries this, and it only matters here. */}
        {effectiveChart === 'presence' && charted.data?.attributedShare !== undefined
          && charted.data.attributedShare < 0.999 && (
          <> About {Math.round((1 - charted.data.attributedShare) * 100)}% of online members hide
            their status — counted in this total, but absent from any per-member breakdown.</>
        )}
      </p>
      <div style={{ ...card, marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
          {METRICS.filter((m) => m.trendPill !== false)
                  .filter((m) => !scoped || MEMBER_METRICS.includes(m.key)).map((m) => (
            <button key={m.key} onClick={() => setChartMetric(m.key)} style={pill(effectiveChart === m.key)}>
              {m.label}
            </button>
          ))}
        </div>
        <TrendChart
          points={charted.data?.points ?? []}
          title={chartDef.label}
          unit={charted.data?.unit ?? chartDef.unit}
          bucket={charted.data?.bucket ?? 'day'}
          tz={charted.data?.source === 'daily-snapshot' ? 'UTC' : tz}
          loading={charted.loading}
          latest={charted.data?.latest}
          averaged={charted.data?.averaged}
          // Names the figure behind the average, so it has to follow the source
          // that answered: playtime served from presence samples is time
          // observed online, not the playtime counter.
          rawUnit={effectiveChart === 'presence' || charted.data?.source === 'presence-samples'
                   ? (uuid ? 'hours online' : 'member-hours online')
                   : effectiveChart === 'raids' ? 'raids'
                   : 'hours played'}
          total={charted.data?.total}
        />
      </div>

      {/* ── The scheduling answer ──────────────────────────────────────────── */}
      <h2 style={sectionTitle}>When we are active</h2>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.6rem' }}>
        {heatDef.note}
        {/* The substitution below is real; say so rather than quietly showing a
            different period than the one selected. */}
        {range === '24h' && (
          <> Showing 7 days here — one day gives each slot a single occurrence,
            which is too little to average.</>
        )}
      </p>
      <div style={card}>
        <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
          {METRICS.filter((m) => m.hourly && (!scoped || m.key === 'presence')).map((m) => (
            <button key={m.key} onClick={() => setHeatMetric(m.key)} style={pill(effectiveHeat === m.key)}>
              {m.label}
            </button>
          ))}
        </div>

        <ActivityHeatmap
          cells={heatmap.data?.cells ?? []}
          title={`${heatDef.label} by day and hour`}
          unit={heatmap.data?.unit ?? ''}
          tz={tz}
          loading={heatmap.loading}
        />
      </div>

      {/* ── Caveats, folded away until asked for ───────────────────────────── */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        style={{
          marginTop: '1.25rem', fontSize: '0.75rem', padding: '0.4rem 0.75rem',
          borderRadius: '0.375rem', border: '1px solid var(--border-card)',
          background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
        }}
      >
        {showNotes ? 'Hide' : 'How these numbers are made'}
      </button>

      {showNotes && (
        <div style={{ ...card, marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 0.75rem' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Two different clocks.</strong>{' '}
            Playtime, wars and raid clears come from a snapshot taken once a day at 00:01 UTC, so
            they are whole UTC days with no time-of-day and the timezone picker does not apply to
            them. Captures, guild raids, snipes and members-online carry real timestamps and do
            follow the picker.
          </p>
          <p style={{ margin: '0 0 0.75rem' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Gaps are drawn as gaps.</strong>{' '}
            Members-online is sampled every 3 minutes; hatched bands mark spans where the sampler
            was not running. Those are missing data, not quiet hours.
          </p>
          <p style={{ margin: '0 0 0.75rem' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Hidden members are counted, but not named.</strong>{' '}
            Wynncraft lets players hide their online status. They are included in the guild-wide
            online count, but cannot be attributed to a specific member, so any per-member
            breakdown omits them.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Some days are adjusted.</strong>{' '}
            Where a snapshot was missed, a day&apos;s value is spread evenly across the gap. Where
            the counter moved backwards or implied more than 24 hours in a day, it was clamped.
            Switch any chart to its table view to see what share of each bucket was adjusted.
          </p>
        </div>
      )}
    </div>
  );
}
