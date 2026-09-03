"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Map as MapIcon, AlertTriangle, ExternalLink } from "lucide-react";
import {
  AllianceEmbedData,
  MapEmbedData,
  WarChartEmbedData,
  WikiEmbedData,
  WikiEmbedDirective,
} from "@/lib/wiki-embeds";

/**
 * Renderers for the wiki's live-data embeds. The article page resolves
 * directives server-side and passes data down; without data (editor preview)
 * a placeholder card explains that the embed renders on the published page.
 */

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fmtDate = (iso: string | null) => (iso ? DATE_FMT.format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)) : 'present');

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border-color)',
  borderRadius: '0.5rem',
  background: 'var(--bg-card)',
  margin: '0.9rem 0',
  overflow: 'hidden',
};

export default function WikiEmbed({ directive, data }: { directive: WikiEmbedDirective; data?: WikiEmbedData }) {
  if (!data) {
    return (
      <div style={{ ...cardStyle, border: '1px dashed var(--border-color)', padding: '0.6rem 0.9rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Live embed — renders on the article page
        </div>
        <code style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>{directive.raw}</code>
      </div>
    );
  }
  if (data.kind === 'error') {
    return (
      <div style={{ ...cardStyle, padding: '0.6rem 0.9rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0 }} />
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {data.message} — <code style={{ fontSize: '0.75rem' }}>{directive.raw}</code>
        </span>
      </div>
    );
  }
  if (data.kind === 'alliance') return <AllianceCard data={data} />;
  if (data.kind === 'war-chart') return <WarChart data={data} />;
  return <MapCard data={data} />;
}

// ---------------------------------------------------------------------------
// {{alliance:Name}}
// ---------------------------------------------------------------------------

function AllianceCard({ data }: { data: AllianceEmbedData }) {
  const current = data.members.filter(m => m.leftAt === null);
  const former = data.members.filter(m => m.leftAt !== null);
  const mapHref = data.startsAt ? `/map/history/chronicle?t=${data.startsAt.slice(0, 10)}` : '/map/history/chronicle';

  const memberRows = (rows: typeof data.members) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
      <tbody>
        {rows.map((m, i) => (
          <tr key={`${m.guild}-${i}`} style={{ borderTop: '1px solid var(--border-color)' }}>
            <td style={{ padding: '0.25rem 0.9rem', color: 'var(--text-primary)' }}>{m.guild}</td>
            <td style={{ padding: '0.25rem 0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', textAlign: 'right' }}>
              {fmtDate(m.joinedAt)} – {fmtDate(m.leftAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div style={{ ...cardStyle, borderLeft: `4px solid ${data.allianceKind === 'war' ? data.color : 'var(--border-color)'}` }}>
      <div style={{ padding: '0.6rem 0.9rem 0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: data.color, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            {data.wikiSlug
              ? <Link href={`/chronicles/${data.wikiSlug}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{data.name}</Link>
              : data.name}
          </span>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>[{data.tag}]</span>
          <span style={{
            fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
            padding: '0.1rem 0.45rem', borderRadius: '0.75rem',
            border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
          }}>
            {data.allianceKind === 'war' ? 'War alliance' : 'Community alliance'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {fmtDate(data.startsAt)} – {fmtDate(data.endsAt)}
          </span>
        </div>
        {data.description && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: 1.5 }}>
            {data.description}
          </div>
        )}
      </div>

      {current.length > 0 && (
        <div>
          <div style={{ padding: '0.3rem 0.9rem 0.1rem', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
            Members ({current.length})
          </div>
          {memberRows(current)}
        </div>
      )}
      {former.length > 0 && (
        <details>
          <summary style={{ padding: '0.35rem 0.9rem', fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer', borderTop: '1px solid var(--border-color)' }}>
            {current.length > 0 ? `Former members (${former.length})` : `Member history (${former.length})`}
          </summary>
          {memberRows(former)}
        </details>
      )}

      <div style={{ padding: '0.45rem 0.9rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '1rem' }}>
        <Link href={mapHref} style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', textDecoration: 'none' }}>
          <MapIcon size={11} style={{ verticalAlign: '-1px', marginRight: '0.25rem' }} />
          View on the map
        </Link>
        {data.wikiSlug && (
          <Link href={`/chronicles/${data.wikiSlug}`} style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', textDecoration: 'none' }}>
            <ExternalLink size={11} style={{ verticalAlign: '-1px', marginRight: '0.25rem' }} />
            Read article
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// {{war-chart:Guild A|Guild B|start|end}} — weekly territory captures, two
// series. Line marks (2px), recessive grid, legend + line-end labels (text in
// ink tokens, identity carried by the colored chip), crosshair hover tooltip,
// and a table view for accessibility.
// ---------------------------------------------------------------------------

const CHART_W = 640;
const CHART_H = 230;
const PAD = { top: 14, right: 118, bottom: 30, left: 40 };

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (v <= m * mag) return m * mag;
  }
  return 10 * mag;
}

function WarChart({ data }: { data: WarChartEmbedData }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { pts, yMax, monthTicks, labelYA, labelYB } = useMemo(() => {
    const yMax = niceMax(Math.max(...data.weeks.map(w => Math.max(w.a, w.b))));
    const innerW = CHART_W - PAD.left - PAD.right;
    const innerH = CHART_H - PAD.top - PAD.bottom;
    const n = data.weeks.length;
    const x = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
    const pts = data.weeks.map((w, i) => ({ x: x(i), yA: y(w.a), yB: y(w.b), week: w.week, a: w.a, b: w.b }));
    // Month boundaries for x ticks (skip crowding: at most ~8 labels)
    const monthTicks: { x: number; label: string }[] = [];
    let lastMonth = '';
    for (let i = 0; i < n; i++) {
      const month = data.weeks[i].week.slice(0, 7);
      if (month !== lastMonth) {
        lastMonth = month;
        const d = new Date(`${data.weeks[i].week}T00:00:00Z`);
        monthTicks.push({ x: x(i), label: d.toLocaleDateString(undefined, { month: 'short', year: n > 60 ? undefined : '2-digit', timeZone: 'UTC' }) });
      }
    }
    const step = Math.ceil(monthTicks.length / 8);
    // Line-end labels: push apart when the series end close together
    let labelYA = pts.length ? pts[pts.length - 1].yA : 0;
    let labelYB = pts.length ? pts[pts.length - 1].yB : 0;
    if (Math.abs(labelYA - labelYB) < 14) {
      const mid = (labelYA + labelYB) / 2;
      const aOnTop = labelYA <= labelYB;
      labelYA = mid + (aOnTop ? -7 : 7);
      labelYB = mid + (aOnTop ? 7 : -7);
    }
    return { pts, yMax, monthTicks: monthTicks.filter((_, i) => i % step === 0), labelYA, labelYB };
  }, [data.weeks]);

  const path = (key: 'yA' | 'yB') => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p[key].toFixed(1)}`).join('');

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vx = ((e.clientX - rect.left) / rect.width) * CHART_W;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - vx);
      if (d < bestD) { bestD = d; best = i; }
    }
    setHover(best);
  };

  const h = hover !== null ? pts[hover] : null;
  const gridYs = [0.25, 0.5, 0.75, 1].map(f => PAD.top + (CHART_H - PAD.top - PAD.bottom) * (1 - f));
  const baseline = CHART_H - PAD.bottom;

  return (
    <figure className="wiki-warchart" style={{ ...cardStyle, padding: '0.6rem 0.9rem', margin: '0.9rem 0' }}>
      <figcaption style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        Weekly territory captures — {data.guildA} vs {data.guildB}
      </figcaption>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
        {fmtDate(data.start)} – {fmtDate(data.end)} · {data.totalA + data.totalB} exchanges
      </div>

      {/* Legend (identity chips; text in ink tokens) */}
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
        <span><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--wiki-series-a)', marginRight: '0.3rem', verticalAlign: '-1px' }} />{data.guildA} ({data.totalA})</span>
        <span><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--wiki-series-b)', marginRight: '0.3rem', verticalAlign: '-1px' }} />{data.guildB} ({data.totalB})</span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y' }}
        role="img"
        aria-label={`Weekly captures: ${data.guildA} ${data.totalA}, ${data.guildB} ${data.totalB}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* Recessive grid + baseline */}
        {gridYs.map((gy, i) => (
          <line key={i} x1={PAD.left} x2={CHART_W - PAD.right} y1={gy} y2={gy} stroke="var(--chart-grid)" strokeWidth="1" />
        ))}
        <line x1={PAD.left} x2={CHART_W - PAD.right} y1={baseline} y2={baseline} stroke="var(--chart-grid)" strokeWidth="1" />
        {/* y tick labels */}
        {[0.5, 1].map(f => (
          <text key={f} x={PAD.left - 6} y={PAD.top + (CHART_H - PAD.top - PAD.bottom) * (1 - f) + 3}
            textAnchor="end" fontSize="10" fill="var(--text-muted, var(--text-secondary))">
            {Math.round(yMax * f)}
          </text>
        ))}
        {/* x month ticks */}
        {monthTicks.map((t, i) => (
          <text key={i} x={t.x} y={CHART_H - 10} textAnchor="middle" fontSize="10" fill="var(--text-muted, var(--text-secondary))">
            {t.label}
          </text>
        ))}

        {/* Crosshair */}
        {h && <line x1={h.x} x2={h.x} y1={PAD.top} y2={baseline} stroke="var(--chart-grid)" strokeWidth="1" />}

        {/* Series lines, 2px */}
        <path d={path('yA')} fill="none" stroke="var(--wiki-series-a)" strokeWidth="2" strokeLinejoin="round" />
        <path d={path('yB')} fill="none" stroke="var(--wiki-series-b)" strokeWidth="2" strokeLinejoin="round" />

        {/* Hover markers: 8px with a surface ring */}
        {h && (
          <>
            <circle cx={h.x} cy={h.yA} r="4" fill="var(--wiki-series-a)" stroke="var(--bg-card-solid)" strokeWidth="2" />
            <circle cx={h.x} cy={h.yB} r="4" fill="var(--wiki-series-b)" stroke="var(--bg-card-solid)" strokeWidth="2" />
          </>
        )}

        {/* Direct labels at line ends (ink tokens + chip) */}
        {pts.length > 0 && (
          <>
            <circle cx={pts[pts.length - 1].x + 6} cy={labelYA} r="3" fill="var(--wiki-series-a)" />
            <text x={pts[pts.length - 1].x + 12} y={labelYA + 3} fontSize="10" fill="var(--text-secondary)">
              {truncate(data.guildA, 16)}
            </text>
            <circle cx={pts[pts.length - 1].x + 6} cy={labelYB} r="3" fill="var(--wiki-series-b)" />
            <text x={pts[pts.length - 1].x + 12} y={labelYB + 3} fontSize="10" fill="var(--text-secondary)">
              {truncate(data.guildB, 16)}
            </text>
          </>
        )}
      </svg>

      {/* Tooltip (HTML, under the plot to avoid clipping) */}
      <div style={{ minHeight: '1.2rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        {h ? (
          <>
            Week of {fmtDate(h.week)}:{' '}
            <span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--wiki-series-a)', margin: '0 0.25rem 0 0.2rem' }} />
            <strong style={{ color: 'var(--text-primary)' }}>{h.a}</strong>
            <span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--wiki-series-b)', margin: '0 0.25rem 0 0.6rem' }} />
            <strong style={{ color: 'var(--text-primary)' }}>{h.b}</strong>
          </>
        ) : 'Hover for weekly detail'}
      </div>

      {/* Table view */}
      <details style={{ marginTop: '0.25rem' }}>
        <summary style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>Data table</summary>
        <div style={{ maxHeight: '14rem', overflowY: 'auto', marginTop: '0.35rem' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', width: '100%' }}>
            <thead>
              <tr>
                <th style={thStyle}>Week of</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>{data.guildA}</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>{data.guildB}</th>
              </tr>
            </thead>
            <tbody>
              {data.weeks.map(w => (
                <tr key={w.week} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.15rem 0.5rem', color: 'var(--text-secondary)' }}>{w.week}</td>
                  <td style={{ padding: '0.15rem 0.5rem', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{w.a}</td>
                  <td style={{ padding: '0.15rem 0.5rem', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{w.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <style jsx>{`
        .wiki-warchart {
          --wiki-series-a: #2a78d6;
          --wiki-series-b: #eb6834;
        }
        :global([data-theme="dark"]) .wiki-warchart {
          --wiki-series-a: #3987e5;
          --wiki-series-b: #d95926;
        }
      `}</style>
    </figure>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.15rem 0.5rem', textAlign: 'left', fontWeight: 700,
  color: 'var(--text-secondary)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em',
};

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---------------------------------------------------------------------------
// {{map:YYYY-MM-DD|label}}
// ---------------------------------------------------------------------------

function MapCard({ data }: { data: MapEmbedData }) {
  return (
    <Link
      href={`/map/history/chronicle?t=${data.date}`}
      style={{
        ...cardStyle,
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '0.55rem 0.9rem', textDecoration: 'none',
      }}
    >
      <MapIcon size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
        {data.label || `The map on ${fmtDate(data.date)}`}
      </span>
      <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--accent-primary)', whiteSpace: 'nowrap' }}>
        {fmtDate(data.date)} →
      </span>
    </Link>
  );
}
