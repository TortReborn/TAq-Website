"use client";

import { useState } from 'react';
import { useExecGraidLogLeaderboard } from '@/hooks/useExecGraidLogs';
import { RAID_TYPE_COLORS } from '@/lib/graid-log-constants';

interface Props {
  onViewStats: (ign: string) => void;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.4rem 0.6rem',
  color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
};

type SortCol = 'total' | 'notg' | 'tcc' | 'tna' | 'nol' | 'ign';
type SortDir = 'asc' | 'desc';

export default function GraidLogLeaderboard({ onViewStats }: Props) {
  const [colSort, setColSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'total', dir: 'desc' });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { players, loading, error } = useExecGraidLogLeaderboard('Total Raids', dateFrom || undefined, dateTo || undefined);

  const toggleColSort = (col: SortCol) => {
    setColSort(prev => prev.col === col && prev.dir === 'desc' ? { col, dir: 'asc' } : { col, dir: 'desc' });
  };
  const colArrow = (col: SortCol) => colSort.col === col ? (colSort.dir === 'desc' ? ' \u25BC' : ' \u25B2') : '';

  const sortedPlayers = [...players].sort((a, b) => {
    const mul = colSort.dir === 'desc' ? -1 : 1;
    if (colSort.col === 'ign') return mul * a.ign.localeCompare(b.ign);
    return mul * ((a[colSort.col] as number) - (b[colSort.col] as number));
  });

  return (
    <div>
      {/* Date range */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
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
            background: 'var(--bg-card-solid)', border: '1px solid var(--border-card)', borderRadius: '0.375rem',
            padding: '0.4rem 0.6rem', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer',
          }}>Clear</button>
        )}
      </div>

      <div style={{ background: 'var(--bg-card-solid)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ height: '300px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        ) : error ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#ef4444', fontSize: '0.85rem' }}>Failed to load leaderboard</div>
        ) : players.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No data available.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                  <th style={thStyle}>#</th>
                  <th style={{ ...thStyle, textAlign: 'left', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleColSort('ign')}>IGN{colArrow('ign')}</th>
                  <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleColSort('total')}>Total{colArrow('total')}</th>
                  <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none', color: RAID_TYPE_COLORS.NOTG }} onClick={() => toggleColSort('notg')}>NOTG{colArrow('notg')}</th>
                  <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none', color: RAID_TYPE_COLORS.TCC }} onClick={() => toggleColSort('tcc')}>TCC{colArrow('tcc')}</th>
                  <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none', color: RAID_TYPE_COLORS.TNA }} onClick={() => toggleColSort('tna')}>TNA{colArrow('tna')}</th>
                  <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none', color: RAID_TYPE_COLORS.NOL }} onClick={() => toggleColSort('nol')}>NOL{colArrow('nol')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((p, idx) => (
                  <tr key={p.ign} style={{ borderBottom: '1px solid var(--border-card)', cursor: 'pointer' }} onClick={() => onViewStats(p.ign)}>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: '600', color: 'var(--text-primary)' }}>{p.ign}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '700', color: 'var(--text-primary)' }}>{p.total}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: RAID_TYPE_COLORS.NOTG }}>{p.notg || '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: RAID_TYPE_COLORS.TCC }}>{p.tcc || '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: RAID_TYPE_COLORS.TNA }}>{p.tna || '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: RAID_TYPE_COLORS.NOL }}>{p.nol || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.15rem' };
const thStyle: React.CSSProperties = { padding: '0.6rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.7rem' };
const tdStyle: React.CSSProperties = { padding: '0.5rem' };
