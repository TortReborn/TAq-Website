/**
 * Render the real chart components to a standalone HTML file for visual review.
 *
 * With no argument it uses fixture data shaped to hit the cases that are easy
 * to get wrong (a sampler outage, an adjusted day, empty slots, no data).
 * Given a JSON file of real query results it renders the whole metric x range
 * matrix instead, which is the only way to eyeball the live shapes: the page
 * itself sits behind exec auth, so a browser cannot reach the API.
 *
 *   npx tsx scripts/_render-charts.tsx [out.html] [render_data.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Next compiles JSX with the automatic runtime; tsx uses the classic one, so
// the components' compiled output references a free `React`. Set before they
// are imported.
(globalThis as { React?: typeof React }).React = React;

const { default: TrendChart } = await import('../components/charts/TrendChart');
const { default: ActivityHeatmap } = await import('../components/charts/ActivityHeatmap');
const { default: StatTile } = await import('../components/charts/StatTile');
const { buildHeatmapGrid } = await import('../lib/activity-trends');

const h = React.createElement;

const sectionTitle = {
  fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)',
  textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '1.4rem 0 0.4rem',
};
const cardStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border-card)',
  borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '0.9rem',
};

interface Series {
  kind: string; metric: string; range: string; bucket?: string;
  averaged?: boolean; unit?: string;
  points?: { t: string; value: number; coverage?: number; approximate?: number; rawTotal?: number }[];
  rows?: [number, number, number][];
  value?: number | string | null;
}

function buildFromRealData(dataPath: string): React.ReactElement {
  const data: Record<string, Series> = JSON.parse(readFileSync(dataPath, 'utf8'));
  const metrics = [...new Set(Object.values(data).map((d) => d.metric))];
  const ranges = ['24h', '7d', '30d', '1y', 'all'];
  const blocks: React.ReactElement[] = [];

  // Headline tiles, real figures and real deltas.
  blocks.push(h('h2', { key: 'th', style: sectionTitle }, 'Headline tiles — 30 days, real data'));
  blocks.push(h('div', {
    key: 'tiles',
    style: {
      display: 'grid', gap: '0.75rem', marginBottom: '0.5rem',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    },
  }, metrics.map((m) => {
    const hl = data[`${m} 30d headline`];
    const prev = data[`${m} 30d previous`];
    const series = data[`${m} 30d series`];
    return h(StatTile, {
      key: m,
      label: m,
      value: Number(hl?.value ?? 0),
      unit: hl?.unit ?? '',
      previous: prev ? Number(prev.value) : null,
      comparisonLabel: 'prev. 30d',
      series: series?.points?.map((p) => p.value),
      active: m === 'playtime',
    });
  })));

  for (const metric of metrics) {
    blocks.push(h('h2', { key: `h-${metric}`, style: sectionTitle }, `${metric} — trend by range`));
    for (const range of ranges) {
      const s = data[`${metric} ${range} series`];
      if (!s?.points) continue;
      const hl = data[`${metric} ${range} headline`];
      blocks.push(h('div', { key: `${metric}-${range}`, style: cardStyle },
        h('div', {
          style: { fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.4rem' },
        }, `range=${range} · bucket=${s.bucket} · ${s.points.length} points · `
         + `${s.points.filter((p) => p.value > 0).length} non-zero`),
        h(TrendChart, {
          points: s.points,
          title: `${metric} (${range})`,
          unit: s.unit ?? '',
          bucket: (s.bucket ?? 'day') as 'hour' | 'day' | 'week',
          tz: 'America/New_York',
          averaged: s.averaged,
          total: hl ? Number(hl.value) : undefined,
          latest: (data[`${metric} latest`]?.value as string) ?? null,
          rawUnit: metric === 'presence' ? 'member-hours online'
                   : metric === 'raids' ? 'raids' : 'hours played',
        })));
    }

    // Heatmaps, built exactly as the API builds them.
    for (const range of ['30d', '1y']) {
      const totals = data[`${metric} ${range} heatmap`];
      const occ = data[`${metric} ${range} occurrences`];
      if (!totals?.rows || !occ?.rows) continue;
      const cells = buildHeatmapGrid(
        totals.rows.map((r) => ({ dow: r[0], hour: r[1], total: r[2] })),
        occ.rows.map((r) => ({ dow: r[0], hour: r[1], occurrences: r[2] })),
      );
      blocks.push(h('div', { key: `${metric}-heat-${range}`, style: cardStyle },
        h('div', {
          style: { fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.4rem' },
        }, `heatmap · range=${range} · ${totals.rows.length} populated slots`),
        h(ActivityHeatmap, {
          cells,
          title: `${metric} by day and hour (${range})`,
          unit: totals.unit ?? '',
          tz: 'America/New_York',
        })));
    }
  }
  return h(React.Fragment, null, ...blocks);
}

function buildFixtures(): React.ReactElement {
  const playtime = Array.from({ length: 31 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 6, 12 + i));
    const weekend = [0, 6].includes(d.getUTCDay());
    const hours = (weekend ? 320 : 210) + Math.round(Math.sin(i) * 45);
    const adjusted = i === 13;
    return {
      t: d.toISOString(),
      value: Math.round(((adjusted ? 120 : hours) / 24) * 10) / 10,
      rawTotal: adjusted ? 120 : hours,
      approximate: adjusted ? 0.66 : 0.05,
    };
  });
  const presence = Array.from({ length: 48 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 7, 10, i));
    const shape = Math.max(0, Math.sin(((d.getUTCHours() - 4) / 24) * Math.PI * 2) * 12 + 9);
    const outage = i >= 20 && i <= 24;
    return {
      t: d.toISOString(),
      value: outage ? 0 : Math.round(shape * 10) / 10,
      coverage: outage ? 0 : 1,
    };
  });
  const cells: { dow: number; hour: number; total: number; occurrences: number; average: number }[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const evening = Math.max(0, Math.cos(((hour - 21) / 24) * Math.PI * 2)) ** 3;
      const quiet = hour >= 8 && hour <= 12 ? 0.15 : 1;
      const total = Math.round(evening * quiet * 40 * 10) / 10;
      cells.push({ dow, hour, total, occurrences: 52, average: Math.round((total / 52) * 100) / 100 });
    }
  }
  return h(React.Fragment, null,
    h('h2', { style: sectionTitle }, 'Playtime — 31 daily buckets, one adjusted day'),
    h('div', { style: cardStyle }, h(TrendChart, {
      points: playtime, title: 'Players online', unit: 'avg online',
      bucket: 'day' as const, tz: 'UTC', averaged: true, total: 9.1,
    })),
    h('h2', { style: sectionTitle }, 'Presence — 48 hours with a 5-hour outage'),
    h('div', { style: cardStyle }, h(TrendChart, {
      points: presence, title: 'Players online (by hour)', unit: 'avg online',
      bucket: 'hour' as const, tz: 'UTC', averaged: true, total: 14.2,
    })),
    h('h2', { style: sectionTitle }, 'Heatmap'),
    h('div', { style: cardStyle }, h(ActivityHeatmap, {
      cells, title: 'Captures by day and hour', unit: 'captures', tz: 'America/New_York',
    })),
    h('h2', { style: sectionTitle }, 'Empty state'),
    h('div', { style: cardStyle }, h(TrendChart, {
      points: [], title: 'Players online', unit: 'avg online',
      bucket: 'hour' as const, tz: 'UTC',
    })),
  );
}

const out = process.argv[2] || path.join(process.cwd(), 'charts.html');
const dataPath = process.argv[3];
const page = dataPath ? buildFromRealData(dataPath) : buildFixtures();

// Mirrors the chart tokens in app/globals.css; keep in sync when those change.
const RAMP = `
  --color-ocean-100:#d7f4fb; --color-ocean-300:#82d8f1; --color-ocean-400:#54c3e7;
  --color-ocean-500:#38a9cf; --color-ocean-600:#2a86aa; --color-ocean-700:#246c8b;
  --color-ocean-900:#204a5f;
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Chart preview</title><style>
:root{${RAMP}
  --text-primary:#204a5f; --text-secondary:rgba(32,74,95,.9); --text-muted:rgba(32,74,95,.7);
  --bg-card:rgba(255,255,255,.75); --bg-card-solid:#fff; --border-card:rgba(0,0,0,.12);
  --chart-line:var(--color-ocean-600); --chart-area:rgba(42,134,170,.10);
  --chart-grid:rgba(32,74,95,.14); --chart-gap:#64748b;
  --chart-seq-1:var(--color-ocean-400); --chart-seq-2:var(--color-ocean-500);
  --chart-seq-3:var(--color-ocean-600); --chart-seq-4:var(--color-ocean-700);
  --chart-seq-5:var(--color-ocean-900); --chart-empty:rgba(32,74,95,.06);
  --chart-spark:rgba(32,74,95,.35);
  --chart-tile-active:color-mix(in srgb, var(--color-ocean-100) 55%, var(--bg-card-solid));
  --page-bg:#e8fbff;
}
.dark{${RAMP}
  --text-primary:#e2e8f0; --text-secondary:rgba(226,232,240,.9); --text-muted:rgba(226,232,240,.7);
  --bg-card:rgba(30,41,59,.8); --bg-card-solid:#1e293b; --border-card:rgba(71,85,105,.4);
  --chart-line:var(--color-ocean-400); --chart-area:rgba(84,195,231,.10);
  --chart-grid:rgba(226,232,240,.14); --chart-gap:#94a3b8;
  --chart-seq-1:var(--color-ocean-700); --chart-seq-2:var(--color-ocean-600);
  --chart-seq-3:var(--color-ocean-500); --chart-seq-4:var(--color-ocean-400);
  --chart-seq-5:var(--color-ocean-300); --chart-empty:rgba(226,232,240,.07);
  --chart-spark:rgba(226,232,240,.35);
  --chart-tile-active:color-mix(in srgb, var(--color-ocean-700) 35%, var(--bg-card-solid));
  --page-bg:#0f1629;
}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,sans-serif;background:var(--page-bg);padding:1.5rem}
button{font:inherit}
</style></head><body>${renderToStaticMarkup(page)}</body></html>`;

writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes)${dataPath ? ' from real data' : ' from fixtures'}`);
