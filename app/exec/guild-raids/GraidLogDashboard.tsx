"use client";

import { useState } from 'react';
import { useExecGraidLogDashboard } from '@/hooks/useExecGraidLogs';
import { RAID_TYPE_COLORS } from '@/lib/graid-log-constants';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.4rem 0.6rem',
  color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1rem',
};

export default function GraidLogDashboard() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data, loading, error } = useExecGraidLogDashboard(dateFrom || undefined, dateTo || undefined);

  if (loading) {
    return (
      <div style={{ ...cardStyle, height: '400px', animation: 'pulse 1.5s ease-in-out infinite' }}>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error) return <div style={{ ...cardStyle, textAlign: 'center', color: '#ef4444' }}>Failed to load dashboard</div>;
  if (!data) return <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>No data available</div>;

  const maxPlayer = Math.max(...data.topPlayers.map(p => p.count), 1);
  const maxType = Math.max(...data.raidTypeDistribution.map(t => t.count), 1);

  // Line graph data
  const weeks = data.raidsOverTime;
  const maxWeekly = Math.max(...weeks.map(w => w.count), 1);

  const svgW = 800, svgH = 200;
  const margin = { top: 15, right: 15, bottom: 30, left: 40 };
  const plotW = svgW - margin.left - margin.right;
  const plotH = svgH - margin.top - margin.bottom;

  const linePoints = weeks.map((w, i) => {
    const x = margin.left + (weeks.length > 1 ? (i / (weeks.length - 1)) * plotW : plotW / 2);
    const y = margin.top + plotH - (w.count / maxWeekly) * plotH;
    return { x, y, ...w };
  });
  const linePath = linePoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = linePath + ` L${linePoints[linePoints.length - 1]?.x ?? margin.left},${margin.top + plotH} L${margin.left},${margin.top + plotH} Z`;

  const yStep = Math.max(1, Math.ceil(maxWeekly / 4));
  const yLabels: { y: number; label: string }[] = [];
  for (let v = 0; v <= maxWeekly; v += yStep) {
    yLabels.push({ y: margin.top + plotH - (v / maxWeekly) * plotH, label: String(v) });
  }

  const xLabelCount = Math.min(6, weeks.length);
  const xLabels = weeks.length <= xLabelCount
    ? linePoints.map(p => ({ x: p.x, label: p.week.slice(5) }))
    : Array.from({ length: xLabelCount }, (_, i) => {
        const idx = Math.round((i / (xLabelCount - 1)) * (weeks.length - 1));
        return { x: linePoints[idx].x, label: linePoints[idx].week.slice(5) };
      });

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
        {/* Raids per week — Line Graph with date range */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Raids Per Week</h3>
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

          {weeks.length > 0 ? (
            <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto', maxHeight: '250px' }}>
              {yLabels.map(({ y, label }) => (
                <g key={label}>
                  <line x1={margin.left} y1={y} x2={margin.left + plotW} y2={y} stroke="var(--border-card)" strokeWidth="0.5" strokeDasharray="4,4" />
                  <text x={margin.left - 6} y={y + 3} fill="var(--text-secondary)" fontSize="10" textAnchor="end">{label}</text>
                </g>
              ))}
              <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotH} stroke="var(--border-card)" strokeWidth="1" />
              <line x1={margin.left} y1={margin.top + plotH} x2={margin.left + plotW} y2={margin.top + plotH} stroke="var(--border-card)" strokeWidth="1" />
              {xLabels.map(({ x, label }) => (
                <text key={label} x={x} y={svgH - 6} fill="var(--text-secondary)" fontSize="9" textAnchor="middle">{label}</text>
              ))}
              {linePoints.length > 1 && <path d={areaPath} fill="var(--color-ocean-400)" opacity="0.15" />}
              {linePoints.length > 1 && <path d={linePath} fill="none" stroke="var(--color-ocean-400)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
              {linePoints.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r="3" fill="var(--color-ocean-400)" />
                  <title>{p.week}: {p.count} raids</title>
                </g>
              ))}
            </svg>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No data for this range</div>
          )}
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

          {/* Top Players */}
          <div style={cardStyle}>
            <h3 style={sectionTitle}>Top Players</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {data.topPlayers.map((p, i) => (
                <div key={p.ign} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '16px', textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', width: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.ign}</span>
                  <div style={{ flex: 1, height: '14px', background: 'var(--bg-primary)', borderRadius: '7px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(p.count / maxPlayer) * 100}%`, background: 'var(--color-ocean-400)', borderRadius: '7px' }} />
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '30px', textAlign: 'right' }}>{p.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.15rem' };
const sectionTitle: React.CSSProperties = { fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' };
