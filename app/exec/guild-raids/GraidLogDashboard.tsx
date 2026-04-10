"use client";

import { useState, useMemo, useRef, useEffect } from 'react';
import { useExecGraidLogDashboard, useExecGraidEventDistribution } from '@/hooks/useExecGraidLogs';
import type { GraidDashboardEvent } from '@/hooks/useExecGraidLogs';
import { RAID_TYPE_COLORS } from '@/lib/graid-log-constants';
import PlayerRaceChart from './PlayerRaceChart';

const RAID_TYPE_ORDER = ['NOTG', 'TCC', 'TNA', 'NOL', 'TWP', 'Unknown'] as const;
type RaidTypeKey = (typeof RAID_TYPE_ORDER)[number];

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.4rem 0.6rem',
  color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card-solid)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1rem',
};

interface Bucket {
  key: string;        // e.g. week start or day
  label: string;      // x-axis short label
  total: number;
  types: Record<string, number>;
}

interface HoverState {
  x: number;
  y: number;
  bucket: Bucket;
  titlePrefix: string;
}

export default function GraidLogDashboard() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  const { data, loading, error } = useExecGraidLogDashboard(dateFrom || undefined, dateTo || undefined);
  const { data: eventDist, loading: eventLoading } = useExecGraidEventDistribution(selectedEventId);

  // Auto-scroll the event chips strip to the most recent (rightmost) entry on first non-empty load.
  const eventChipsRef = useRef<HTMLDivElement>(null);
  const hasScrolledEventsRef = useRef(false);
  const eventCount = data?.events?.length ?? 0;
  useEffect(() => {
    if (!hasScrolledEventsRef.current && eventCount > 0 && eventChipsRef.current) {
      eventChipsRef.current.scrollLeft = eventChipsRef.current.scrollWidth;
      hasScrolledEventsRef.current = true;
    }
  }, [eventCount]);

  if (loading) {
    return (
      <div style={{ ...cardStyle, height: '320px', animation: 'pulse 1.5s ease-in-out infinite' }}>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error) return <div style={{ ...cardStyle, textAlign: 'center', color: '#ef4444' }}>Failed to load dashboard</div>;
  if (!data) return <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>No data available</div>;

  const maxType = Math.max(...data.raidTypeDistribution.map(t => t.count), 1);

  const weeklyBuckets: Bucket[] = data.raidsOverTime.map(w => ({
    key: w.week,
    label: shortAxisLabel(w.week),
    total: w.total,
    types: w.types,
  }));

  const drilldownBuckets: Bucket[] = (eventDist?.days || []).map(d => ({
    key: d.date,
    label: shortAxisLabel(d.date),
    total: d.total,
    types: d.types,
  }));

  const selectedEvent: GraidDashboardEvent | undefined = data.events.find(e => e.id === selectedEventId);
  const inDrilldown = selectedEventId != null;

  // API returns events newest-first; flip for display so oldest is on the left.
  const eventsOrdered = [...data.events].reverse();

  const fmtDate = (s: string) => {
    const d = new Date(s);
    const month = d.toLocaleString('default', { month: 'short' });
    const yr = d.getFullYear().toString().slice(-2);
    return `${month} ${d.getDate()}, '${yr}`;
  };

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--color-ocean-400)' }}>{data.totalRaids}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Total Raids</div>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--text-primary)' }}>{data.uniqueParticipants}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Unique Players</div>
        </div>
        {data.mostActivePlayer && (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-primary)' }}>{data.mostActivePlayer.ign}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Most Active ({data.mostActivePlayer.count})</div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Top row: weekly chart (left) + player race (right, narrow), same height */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 375px', gap: '1rem', alignItems: 'stretch' }}>
        {/* Chart card */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                {inDrilldown && selectedEvent
                  ? `${selectedEvent.title} — Per-Day Distribution`
                  : 'Raids Per Week'}
              </h3>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                {inDrilldown && selectedEvent ? (
                  <>
                    {fmtDate(selectedEvent.startTs)}
                    {selectedEvent.endTs ? ` – ${fmtDate(selectedEvent.endTs)}` : ' – ongoing'}
                    {eventDist ? ` · ${eventDist.total} total raids` : ''}
                  </>
                ) : (
                  'Hover the chart for per-week breakdown'
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
              {inDrilldown ? (
                <button
                  onClick={() => setSelectedEventId(null)}
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-card)',
                    borderRadius: '0.375rem',
                    padding: '0.45rem 0.75rem',
                    color: 'var(--text-primary)',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  ← Back to Weekly
                </button>
              ) : (
                <>
                  <div>
                    <label style={labelStyle}>From</label>
                    <input type="date" style={inputStyle} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>To</label>
                    <input type="date" style={inputStyle} value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                  {(dateFrom || dateTo) && (
                    <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{
                      background: 'var(--bg-primary)', border: '1px solid var(--border-card)', borderRadius: '0.375rem',
                      padding: '0.4rem 0.6rem', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer',
                    }}>Clear</button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {RAID_TYPE_ORDER.map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ width: '10px', height: '10px', background: RAID_TYPE_COLORS[t], borderRadius: '2px', display: 'inline-block' }} />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t}</span>
              </div>
            ))}
          </div>

          {/* Drilldown totals chips */}
          {inDrilldown && eventDist && eventDist.total > 0 && (
            <div
              key={`chips-${selectedEventId}`}
              className="graid-fade-swap"
              style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}
            >
              {RAID_TYPE_ORDER.map(t => {
                const count = eventDist.totalsByType[t] || 0;
                if (count === 0) return null;
                const pct = ((count / eventDist.total) * 100).toFixed(0);
                return (
                  <div key={t} style={{
                    background: 'var(--bg-primary)',
                    border: `1px solid ${RAID_TYPE_COLORS[t]}40`,
                    borderRadius: '0.375rem',
                    padding: '0.25rem 0.55rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}>
                    <span style={{ width: '8px', height: '8px', background: RAID_TYPE_COLORS[t], borderRadius: '2px' }} />
                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: RAID_TYPE_COLORS[t] }}>{t}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)' }}>{count}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>({pct}%)</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Swappable chart slot */}
          <div
            key={inDrilldown ? `event-${selectedEventId}` : 'weekly'}
            className="graid-fade-swap"
          >
            {inDrilldown ? (
              eventLoading ? (
                <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Loading event distribution…
                </div>
              ) : drilldownBuckets.length === 0 ? (
                <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  No raids logged during this event
                </div>
              ) : (
                <StackedAreaChart buckets={drilldownBuckets} titlePrefix="" />
              )
            ) : weeklyBuckets.length === 0 ? (
              <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                No data for this range
              </div>
            ) : (
              <StackedAreaChart buckets={weeklyBuckets} titlePrefix="Week of " />
            )}
          </div>

          {/* Event chips row — always visible, persists across drilldown swap */}
          {eventsOrdered.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Guild Raid Events
              </div>
              <div ref={eventChipsRef} style={{
                display: 'flex',
                gap: '0.5rem',
                overflowX: 'auto',
                paddingBottom: '0.4rem',
                scrollbarWidth: 'thin',
              }}>
                {eventsOrdered.map(ev => {
                  const isSelected = selectedEventId === ev.id;
                  return (
                    <button
                      key={ev.id}
                      onClick={() => setSelectedEventId(isSelected ? null : ev.id)}
                      style={{
                        flexShrink: 0,
                        width: '180px',
                        background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-primary)',
                        border: isSelected ? '2px solid var(--color-ocean-400)' : '1px solid var(--border-card)',
                        borderRadius: '0.5rem',
                        padding: isSelected ? '0.5rem 0.65rem' : '0.55rem 0.7rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        color: 'inherit',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-ocean-400)'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-card)'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                        <span style={{
                          width: '8px', height: '8px',
                          background: ev.active ? '#22c55e' : 'var(--text-muted)',
                          borderRadius: '50%',
                          flexShrink: 0,
                          boxShadow: ev.active ? '0 0 6px #22c55e' : 'none',
                        }} />
                        <span style={{
                          fontSize: '0.78rem',
                          fontWeight: '700',
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>{ev.title}</span>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                        {fmtDate(ev.startTs)}{ev.endTs ? ` – ${fmtDate(ev.endTs)}` : ' – now'}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                        <span style={{ color: 'var(--color-ocean-400)', fontWeight: '700' }}>{ev.totalRaids}</span> raids
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {/* Player race chart (right side of top row) */}
        <PlayerRaceChart dateFrom={dateFrom} dateTo={dateTo} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* Raid Type Distribution */}
          <div style={cardStyle}>
            <h3 style={sectionTitle}>Raid Type Distribution</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {data.raidTypeDistribution.map(t => (
                <div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', color: RAID_TYPE_COLORS[t.type] || '#6b7280', width: '50px' }}>{t.type}</span>
                  <div style={{ flex: 1, height: '14px', background: 'var(--bg-primary)', borderRadius: '7px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(t.count / maxType) * 100}%`, background: RAID_TYPE_COLORS[t.type] || '#6b7280', borderRadius: '7px' }} />
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '30px', textAlign: 'right' }}>{t.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Players (stacked by raid type) */}
          <div style={cardStyle}>
            <h3 style={sectionTitle}>Top Players</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {data.topPlayers.map((p, i) => (
                <TopPlayerRow key={p.ign} player={p} rank={i + 1} maxCount={data.topPlayers[0]?.count || 1} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes graidFadeSwap {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .graid-fade-swap { animation: graidFadeSwap 220ms ease-out; }
      `}</style>
    </div>
  );
}

// --- Stacked Area Chart (line on top + filled stacked layers) ---

function StackedAreaChart({ buckets, titlePrefix }: { buckets: Bucket[]; titlePrefix: string }) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const svgW = 1000;
  const svgH = 260;
  const margin = { top: 18, right: 18, bottom: 32, left: 44 };
  const plotW = svgW - margin.left - margin.right;
  const plotH = svgH - margin.top - margin.bottom;

  const maxTotal = Math.max(...buckets.map(b => b.total), 1);

  const points = useMemo(() => buckets.map((b, i) => {
    const x = buckets.length === 1
      ? margin.left + plotW / 2
      : margin.left + (i / (buckets.length - 1)) * plotW;
    return { ...b, x };
  }), [buckets, plotW]);

  // Build stacked area paths (bottom layer first)
  const layers = RAID_TYPE_ORDER.map((type, layerIdx) => {
    const upper: { x: number; y: number }[] = [];
    const lower: { x: number; y: number }[] = [];
    for (const p of points) {
      let belowSum = 0;
      for (let li = 0; li < layerIdx; li++) belowSum += p.types[RAID_TYPE_ORDER[li]] || 0;
      const aboveSum = belowSum + (p.types[type] || 0);
      upper.push({ x: p.x, y: margin.top + plotH - (aboveSum / maxTotal) * plotH });
      lower.push({ x: p.x, y: margin.top + plotH - (belowSum / maxTotal) * plotH });
    }
    if (points.length === 1) {
      // Degenerate single-point case: render a thin centered rect via path
      const p0 = points[0];
      const w = 20;
      const top = margin.top + plotH - ((points[0].types[type] || 0) / maxTotal) * plotH; // not used, fallback
      // Instead, fall back to no path; the user shouldn't really hit this with weekly data.
      return { type, path: '', single: true };
    }
    const topPath = upper.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x},${q.y}`).join(' ');
    const bottomPath = lower.slice().reverse().map(q => `L${q.x},${q.y}`).join(' ');
    return { type, path: `${topPath} ${bottomPath} Z`, single: false };
  });

  const totalLinePoints = points.map(p => ({ x: p.x, y: margin.top + plotH - (p.total / maxTotal) * plotH }));
  const totalPath = totalLinePoints.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x},${q.y}`).join(' ');

  // Y axis ticks
  const yTickCount = 4;
  const yStep = Math.max(1, Math.ceil(maxTotal / yTickCount));
  const yLabels: { y: number; label: string }[] = [];
  for (let v = 0; v <= maxTotal; v += yStep) {
    yLabels.push({ y: margin.top + plotH - (v / maxTotal) * plotH, label: String(v) });
  }

  // X axis labels
  const desiredXLabels = Math.min(8, points.length);
  const xLabels = points.length === 0 ? [] : points.length <= desiredXLabels
    ? points.map(p => ({ x: p.x, label: p.label }))
    : Array.from({ length: desiredXLabels }, (_, i) => {
        const idx = Math.round((i / (desiredXLabels - 1)) * (points.length - 1));
        return { x: points[idx].x, label: points[idx].label };
      });

  const handleStripHover = (p: typeof points[number], e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      bucket: p,
      titlePrefix,
    });
  };

  const hoveredX = hover ? points.find(p => p.key === hover.bucket.key)?.x : undefined;
  const hoveredY = hover ? margin.top + plotH - (hover.bucket.total / maxTotal) * plotH : undefined;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ width: '100%', height: 'auto', maxHeight: '320px', display: 'block' }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Y grid */}
        {yLabels.map(({ y, label }) => (
          <g key={`y-${label}`}>
            <line x1={margin.left} y1={y} x2={margin.left + plotW} y2={y} stroke="var(--border-card)" strokeWidth="0.5" strokeDasharray="4,4" />
            <text x={margin.left - 8} y={y + 3} fill="var(--text-secondary)" fontSize="11" textAnchor="end">{label}</text>
          </g>
        ))}
        {/* axes */}
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotH} stroke="var(--border-card)" strokeWidth="1" />
        <line x1={margin.left} y1={margin.top + plotH} x2={margin.left + plotW} y2={margin.top + plotH} stroke="var(--border-card)" strokeWidth="1" />

        {/* X labels */}
        {xLabels.map(({ x, label }, i) => (
          <text key={`x-${i}`} x={x} y={margin.top + plotH + 16} fill="var(--text-secondary)" fontSize="10" textAnchor="middle">{label}</text>
        ))}

        {/* Stacked area layers */}
        {points.length > 1 && layers.map(l => (
          <path key={l.type} d={l.path} fill={RAID_TYPE_COLORS[l.type]} opacity={0.55} />
        ))}

        {/* Total line + dots */}
        {points.length > 1 && (
          <path d={totalPath} fill="none" stroke="var(--color-ocean-400)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {totalLinePoints.map((q, i) => (
          <circle key={`dot-${i}`} cx={q.x} cy={q.y} r="3" fill="var(--color-ocean-400)" />
        ))}

        {/* Hover guideline + highlighted dot */}
        {hover && hoveredX !== undefined && hoveredY !== undefined && (
          <g pointerEvents="none">
            <line x1={hoveredX} y1={margin.top} x2={hoveredX} y2={margin.top + plotH} stroke="var(--text-secondary)" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
            <circle cx={hoveredX} cy={hoveredY} r="5" fill="var(--color-ocean-400)" stroke="#fff" strokeWidth="1.5" />
          </g>
        )}

        {/* Invisible hover capture strips */}
        {points.map((p, i) => {
          const prevX = i > 0 ? points[i - 1].x : p.x - (points[1]?.x - p.x || plotW) / 2;
          const nextX = i < points.length - 1 ? points[i + 1].x : p.x + (p.x - points[i - 1]?.x || plotW) / 2;
          const left = (prevX + p.x) / 2;
          const right = (nextX + p.x) / 2;
          return (
            <rect
              key={`hit-${i}`}
              x={left}
              y={margin.top}
              width={Math.max(2, right - left)}
              height={plotH}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseMove={(e) => handleStripHover(p, e)}
              onMouseEnter={(e) => handleStripHover(p, e)}
            />
          );
        })}
      </svg>

      {/* Tooltip */}
      {hover && (
        <div
          style={{
            position: 'absolute',
            left: hover.x + 14,
            top: hover.y + 14,
            background: 'var(--bg-card-solid)',
            border: '1px solid var(--border-card)',
            borderRadius: '0.5rem',
            padding: '0.5rem 0.75rem',
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 50,
            minWidth: '160px',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
            {hover.titlePrefix}{hover.bucket.key}
          </div>
          {RAID_TYPE_ORDER.map(t => {
            const v = hover.bucket.types[t] || 0;
            if (v === 0) return null;
            return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem' }}>
                <span style={{ width: '8px', height: '8px', background: RAID_TYPE_COLORS[t], borderRadius: '2px' }} />
                <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{t}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{v}</span>
              </div>
            );
          })}
          <div style={{ borderTop: '1px solid var(--border-card)', marginTop: '0.3rem', paddingTop: '0.25rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Total</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>{hover.bucket.total}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Top Player Row with hoverable raid type segments ---

function TopPlayerRow({ player, rank, maxCount }: {
  player: { ign: string; count: number; types: Record<string, number> };
  rank: number;
  maxCount: number;
}) {
  const [hover, setHover] = useState<{ x: number; y: number; type: RaidTypeKey } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const widthPct = (player.count / maxCount) * 100;

  const segments = RAID_TYPE_ORDER
    .map(t => ({ type: t, value: player.types[t] || 0 }))
    .filter(s => s.value > 0);

  return (
    <div ref={rowRef} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '16px', textAlign: 'right' }}>{rank}</span>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', width: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.ign}</span>
      <div style={{ flex: 1, height: '16px', background: 'var(--bg-primary)', borderRadius: '7px', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${widthPct}%`, display: 'flex' }}>
          {segments.map(seg => {
            const flex = seg.value / player.count;
            return (
              <div
                key={seg.type}
                style={{
                  flex: flex,
                  background: RAID_TYPE_COLORS[seg.type],
                  height: '100%',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
                onMouseMove={(e) => {
                  const rowRect = rowRef.current?.getBoundingClientRect();
                  if (!rowRect) return;
                  setHover({ x: e.clientX - rowRect.left, y: e.clientY - rowRect.top, type: seg.type });
                }}
                onMouseLeave={() => setHover(null)}
                title={`${seg.type}: ${seg.value}`}
              />
            );
          })}
        </div>
      </div>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '34px', textAlign: 'right' }}>{player.count}</span>
      {hover && (
        <div
          style={{
            position: 'absolute',
            left: hover.x + 10,
            top: hover.y - 36,
            background: 'var(--bg-card-solid)',
            border: '1px solid var(--border-card)',
            borderRadius: '0.375rem',
            padding: '0.4rem 0.6rem',
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 30,
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ fontSize: '0.7rem', fontWeight: '700', color: RAID_TYPE_COLORS[hover.type] }}>{hover.type}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)' }}>
            {player.types[hover.type] || 0} ({((player.types[hover.type] || 0) / player.count * 100).toFixed(0)}%)
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.15rem' };
const sectionTitle: React.CSSProperties = { fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' };

// Compact axis label including year, e.g. "Apr 09 '26"
function shortAxisLabel(isoDate: string): string {
  const d = new Date(isoDate);
  const month = d.toLocaleString('default', { month: 'short' });
  const day = d.getDate().toString().padStart(2, '0');
  const yr = d.getFullYear().toString().slice(-2);
  return `${month} ${day} '${yr}`;
}
