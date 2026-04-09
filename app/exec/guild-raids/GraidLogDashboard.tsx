"use client";

import { useState, useMemo, useRef } from 'react';
import { useExecGraidLogDashboard, useExecGraidEventDistribution } from '@/hooks/useExecGraidLogs';
import { RAID_TYPE_COLORS } from '@/lib/graid-log-constants';

const RAID_TYPE_ORDER = ['NOTG', 'TCC', 'TNA', 'NOL', 'Unknown'] as const;
type RaidTypeKey = (typeof RAID_TYPE_ORDER)[number];

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.4rem 0.6rem',
  color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card-solid)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1rem',
};

interface HoverState {
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: number; color: string }[];
  total: number;
}

export default function GraidLogDashboard() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, loading, error } = useExecGraidLogDashboard(dateFrom || undefined, dateTo || undefined);
  const { data: eventDist, loading: eventLoading } = useExecGraidEventDistribution(selectedEventId);

  if (loading) {
    return (
      <div style={{ ...cardStyle, height: '400px', animation: 'pulse 1.5s ease-in-out infinite' }}>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error) return <div style={{ ...cardStyle, textAlign: 'center', color: '#ef4444' }}>Failed to load dashboard</div>;
  if (!data) return <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>No data available</div>;

  const maxType = Math.max(...data.raidTypeDistribution.map(t => t.count), 1);

  const weeks = data.raidsOverTime;
  const maxWeekly = Math.max(...weeks.map(w => w.total), 1);

  // Larger SVG dimensions for the chart
  const svgW = 1000;
  const svgH = 360;
  const margin = { top: 20, right: 20, bottom: 40, left: 50 };
  const plotW = svgW - margin.left - margin.right;
  const plotH = svgH - margin.top - margin.bottom;

  // Determine the time range covered by the chart
  const weekStarts = weeks.map(w => new Date(w.week).getTime());
  const minTime = weekStarts.length > 0 ? Math.min(...weekStarts) : Date.now();
  const maxTime = weekStarts.length > 0 ? Math.max(...weekStarts) : Date.now();
  const timeSpan = Math.max(1, maxTime - minTime);

  const xForTime = (t: number) => {
    if (weeks.length <= 1) return margin.left + plotW / 2;
    return margin.left + ((t - minTime) / timeSpan) * plotW;
  };

  // Bar geometry
  const barSlot = weeks.length > 0 ? plotW / Math.max(1, weeks.length) : 0;
  const barWidth = Math.max(6, Math.min(60, barSlot * 0.7));

  const barPoints = weeks.map((w, i) => {
    const t = new Date(w.week).getTime();
    const cx = weeks.length === 1 ? margin.left + plotW / 2 : xForTime(t);
    return { x: cx - barWidth / 2, cx, ...w };
  });

  // Y axis labels (~5 ticks)
  const yTickCount = 5;
  const yStep = Math.max(1, Math.ceil(maxWeekly / yTickCount));
  const yLabels: { y: number; label: string }[] = [];
  for (let v = 0; v <= maxWeekly; v += yStep) {
    yLabels.push({ y: margin.top + plotH - (v / maxWeekly) * plotH, label: String(v) });
  }
  if (yLabels[yLabels.length - 1]?.label !== String(maxWeekly)) {
    // ensure top tick
  }

  // X axis labels — try to evenly sample week labels
  const desiredXLabels = Math.min(8, weeks.length);
  const xLabels = weeks.length === 0 ? [] : weeks.length <= desiredXLabels
    ? barPoints.map(p => ({ x: p.cx, label: p.week.slice(5) }))
    : Array.from({ length: desiredXLabels }, (_, i) => {
        const idx = Math.round((i / (desiredXLabels - 1)) * (weeks.length - 1));
        return { x: barPoints[idx].cx, label: barPoints[idx].week.slice(5) };
      });

  const handleBarHover = (p: typeof barPoints[number], e: React.MouseEvent) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const rows = RAID_TYPE_ORDER
      .map(t => ({ label: t, value: p.types[t] || 0, color: RAID_TYPE_COLORS[t] }))
      .filter(r => r.value > 0);
    setHover({
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
      title: `Week of ${p.week}`,
      rows,
      total: p.total,
    });
  };

  // Event bars geometry — render below the chart, mapped to the same time axis
  const eventBarHeight = 18;
  const eventBarGap = 4;
  const eventBarsTop = margin.top + plotH + 14;

  const eventsInRange = data.events.filter(ev => {
    if (weeks.length === 0) return true;
    const start = new Date(ev.startTs).getTime();
    const end = ev.endTs ? new Date(ev.endTs).getTime() : Date.now();
    // include if any overlap with [minTime, maxTime + 1 week]
    const upperBound = maxTime + 7 * 86400000;
    return end >= minTime && start <= upperBound;
  });

  const eventLayout = eventsInRange.map(ev => {
    const start = new Date(ev.startTs).getTime();
    const end = ev.endTs ? new Date(ev.endTs).getTime() : Date.now();
    const x1 = Math.max(margin.left, xForTime(Math.max(start, minTime)));
    const x2 = Math.min(margin.left + plotW, xForTime(Math.min(end, maxTime + 7 * 86400000)));
    return { ev, x1, x2: Math.max(x1 + 6, x2) };
  });

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
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
        {/* Raids per week — Stacked Bar Graph with hover tooltips and event bars */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Raids Per Week</h3>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Hover bars for breakdown · Click event bars below chart for per-day details
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
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

          {weeks.length > 0 ? (
            <svg
              viewBox={`0 0 ${svgW} ${svgH + eventBarsTop - margin.top - plotH + (eventLayout.length > 0 ? eventBarHeight + 18 : 0)}`}
              style={{ width: '100%', height: 'auto', maxHeight: '520px', display: 'block' }}
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

              {/* X axis labels */}
              {xLabels.map(({ x, label }, i) => (
                <text key={`x-${i}`} x={x} y={margin.top + plotH + 16} fill="var(--text-secondary)" fontSize="10" textAnchor="middle">{label}</text>
              ))}

              {/* Stacked bars */}
              {barPoints.map((p, i) => {
                let yOffset = margin.top + plotH;
                const segments: React.ReactNode[] = [];
                for (const t of RAID_TYPE_ORDER) {
                  const v = p.types[t] || 0;
                  if (v <= 0) continue;
                  const segH = (v / maxWeekly) * plotH;
                  yOffset -= segH;
                  segments.push(
                    <rect
                      key={`${i}-${t}`}
                      x={p.x}
                      y={yOffset}
                      width={barWidth}
                      height={segH}
                      fill={RAID_TYPE_COLORS[t]}
                      opacity={0.9}
                    />
                  );
                }
                const totalH = (p.total / maxWeekly) * plotH;
                return (
                  <g key={`bar-${i}`}>
                    {segments}
                    {/* invisible hover capture */}
                    <rect
                      x={p.x}
                      y={margin.top + plotH - totalH}
                      width={barWidth}
                      height={Math.max(totalH, 4)}
                      fill="transparent"
                      onMouseMove={(e) => handleBarHover(p, e)}
                      onMouseEnter={(e) => handleBarHover(p, e)}
                      style={{ cursor: 'pointer' }}
                    />
                  </g>
                );
              })}

              {/* Event bars below chart */}
              {eventLayout.length > 0 && (
                <>
                  <text
                    x={margin.left}
                    y={eventBarsTop - 4}
                    fill="var(--text-secondary)"
                    fontSize="10"
                    fontWeight="600"
                  >
                    Guild Raid Events (click for per-day breakdown)
                  </text>
                  {eventLayout.map(({ ev, x1, x2 }, i) => {
                    const isSelected = selectedEventId === ev.id;
                    return (
                      <g key={`evt-${ev.id}`}>
                        <rect
                          x={x1}
                          y={eventBarsTop}
                          width={x2 - x1}
                          height={eventBarHeight}
                          fill={isSelected ? 'var(--color-ocean-400)' : 'var(--color-ocean-600, #1e3a8a)'}
                          stroke={isSelected ? '#fff' : 'var(--color-ocean-400)'}
                          strokeWidth={isSelected ? 2 : 1}
                          rx={3}
                          style={{ cursor: 'pointer' }}
                          opacity={ev.active ? 1 : 0.75}
                          onClick={() => setSelectedEventId(isSelected ? null : ev.id)}
                          onMouseMove={(e) => {
                            const containerRect = containerRef.current?.getBoundingClientRect();
                            if (!containerRect) return;
                            setHover({
                              x: e.clientX - containerRect.left,
                              y: e.clientY - containerRect.top,
                              title: ev.title,
                              rows: [
                                { label: 'Total Raids', value: ev.totalRaids, color: 'var(--color-ocean-400)' },
                              ],
                              total: ev.totalRaids,
                            });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />
                        {x2 - x1 > 60 && (
                          <text
                            x={(x1 + x2) / 2}
                            y={eventBarsTop + eventBarHeight / 2 + 4}
                            fill="#fff"
                            fontSize="10"
                            fontWeight="700"
                            textAnchor="middle"
                            pointerEvents="none"
                          >
                            {ev.title.length > Math.floor((x2 - x1) / 7) ? ev.title.slice(0, Math.floor((x2 - x1) / 7) - 1) + '…' : ev.title}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </>
              )}
            </svg>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No data for this range</div>
          )}

          {/* Hover tooltip */}
          {hover && (
            <div
              style={{
                position: 'absolute',
                left: hover.x + 12,
                top: hover.y + 12,
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
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.3rem' }}>{hover.title}</div>
              {hover.rows.map(r => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem' }}>
                  <span style={{ width: '8px', height: '8px', background: r.color, borderRadius: '2px', display: 'inline-block' }} />
                  <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{r.label}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{r.value}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border-card)', marginTop: '0.3rem', paddingTop: '0.25rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Total</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>{hover.total}</span>
              </div>
            </div>
          )}
        </div>

        {/* Per-event drilldown panel */}
        {selectedEventId != null && (
          <EventDrilldownPanel
            data={eventDist}
            loading={eventLoading}
            onClose={() => setSelectedEventId(null)}
          />
        )}

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

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
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

// --- Per-event Drilldown Panel ---

function EventDrilldownPanel({
  data,
  loading,
  onClose,
}: {
  data: { event: { id: number; title: string; startTs: string; endTs: string | null }; total: number; totalsByType: Record<string, number>; days: { date: string; total: number; types: Record<string, number> }[] } | null;
  loading: boolean;
  onClose: () => void;
}) {
  const [hover, setHover] = useState<{ x: number; y: number; day: { date: string; total: number; types: Record<string, number> } } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (loading) {
    return (
      <div style={{ ...cardStyle, height: '300px', animation: 'pulse 1.5s ease-in-out infinite' }} />
    );
  }
  if (!data) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={sectionTitle}>Event Drilldown</h3>
          <button onClick={onClose} style={closeBtn}>Close</button>
        </div>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '1rem' }}>
          No data for this event
        </div>
      </div>
    );
  }

  const maxDayTotal = Math.max(...data.days.map(d => d.total), 1);
  const days = data.days;

  // Per-day stacked bar chart
  const svgW = 1000;
  const svgH = 240;
  const margin = { top: 16, right: 16, bottom: 30, left: 40 };
  const plotW = svgW - margin.left - margin.right;
  const plotH = svgH - margin.top - margin.bottom;

  const barSlot = days.length > 0 ? plotW / Math.max(1, days.length) : 0;
  const barWidth = Math.max(8, Math.min(40, barSlot * 0.7));

  const yTickCount = 4;
  const yStep = Math.max(1, Math.ceil(maxDayTotal / yTickCount));
  const yLabels: { y: number; label: string }[] = [];
  for (let v = 0; v <= maxDayTotal; v += yStep) {
    yLabels.push({ y: margin.top + plotH - (v / maxDayTotal) * plotH, label: String(v) });
  }

  return (
    <div ref={containerRef} style={{ ...cardStyle, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ ...sectionTitle, margin: 0 }}>{data.event.title} — Per-Day Distribution</h3>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {new Date(data.event.startTs).toLocaleDateString()}
            {data.event.endTs && ` — ${new Date(data.event.endTs).toLocaleDateString()}`}
            {' · '}{data.total} total raids
          </div>
        </div>
        <button onClick={onClose} style={closeBtn}>Close</button>
      </div>

      {/* Totals by type chips */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {RAID_TYPE_ORDER.map(t => {
          const count = data.totalsByType[t] || 0;
          if (count === 0) return null;
          const pct = data.total > 0 ? (count / data.total * 100).toFixed(0) : '0';
          return (
            <div key={t} style={{
              background: 'var(--bg-primary)',
              border: `1px solid ${RAID_TYPE_COLORS[t]}40`,
              borderRadius: '0.375rem',
              padding: '0.3rem 0.6rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}>
              <span style={{ width: '10px', height: '10px', background: RAID_TYPE_COLORS[t], borderRadius: '2px' }} />
              <span style={{ fontSize: '0.7rem', fontWeight: '700', color: RAID_TYPE_COLORS[t] }}>{t}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)' }}>{count}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>({pct}%)</span>
            </div>
          );
        })}
      </div>

      {days.length > 0 ? (
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ width: '100%', height: 'auto', maxHeight: '320px', display: 'block' }}
          onMouseLeave={() => setHover(null)}
        >
          {yLabels.map(({ y, label }) => (
            <g key={`y-${label}`}>
              <line x1={margin.left} y1={y} x2={margin.left + plotW} y2={y} stroke="var(--border-card)" strokeWidth="0.5" strokeDasharray="4,4" />
              <text x={margin.left - 6} y={y + 3} fill="var(--text-secondary)" fontSize="10" textAnchor="end">{label}</text>
            </g>
          ))}
          <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotH} stroke="var(--border-card)" strokeWidth="1" />
          <line x1={margin.left} y1={margin.top + plotH} x2={margin.left + plotW} y2={margin.top + plotH} stroke="var(--border-card)" strokeWidth="1" />

          {days.map((d, i) => {
            const cx = days.length === 1
              ? margin.left + plotW / 2
              : margin.left + (i / (days.length - 1)) * plotW;
            const x = cx - barWidth / 2;
            let yOff = margin.top + plotH;
            const segs: React.ReactNode[] = [];
            for (const t of RAID_TYPE_ORDER) {
              const v = d.types[t] || 0;
              if (v <= 0) continue;
              const segH = (v / maxDayTotal) * plotH;
              yOff -= segH;
              segs.push(
                <rect key={t} x={x} y={yOff} width={barWidth} height={segH} fill={RAID_TYPE_COLORS[t]} opacity={0.9} />
              );
            }
            const totalH = (d.total / maxDayTotal) * plotH;
            return (
              <g key={i}>
                {segs}
                <rect
                  x={x}
                  y={margin.top + plotH - totalH}
                  width={barWidth}
                  height={Math.max(totalH, 4)}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseMove={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, day: d });
                  }}
                />
                {/* X label every nth bar */}
                {(days.length <= 8 || i % Math.ceil(days.length / 8) === 0) && (
                  <text x={cx} y={margin.top + plotH + 16} fill="var(--text-secondary)" fontSize="9" textAnchor="middle">
                    {d.date.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      ) : (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          No raids logged during this event
        </div>
      )}

      {hover && (
        <div
          style={{
            position: 'absolute',
            left: hover.x + 12,
            top: hover.y + 12,
            background: 'var(--bg-card-solid)',
            border: '1px solid var(--border-card)',
            borderRadius: '0.5rem',
            padding: '0.5rem 0.75rem',
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 50,
            minWidth: '150px',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.3rem' }}>{hover.day.date}</div>
          {RAID_TYPE_ORDER.map(t => {
            const v = hover.day.types[t] || 0;
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
            <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>{hover.day.total}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.15rem' };
const sectionTitle: React.CSSProperties = { fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' };
const closeBtn: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-card)',
  borderRadius: '0.375rem',
  padding: '0.3rem 0.7rem',
  color: 'var(--text-secondary)',
  fontSize: '0.7rem',
  cursor: 'pointer',
};
