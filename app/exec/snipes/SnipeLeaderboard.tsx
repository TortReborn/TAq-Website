"use client";

import { useState } from 'react';
import { useExecSnipeLeaderboard } from '@/hooks/useExecSnipes';
import { getDifficultyColor } from '@/lib/snipe-constants';

interface Props {
  meta: {
    currentSeason: number;
    seasonsWithData: number[];
  };
  onViewStats: (ign: string) => void;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.4rem 0.6rem',
  color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
};

type SortCol = 'total' | 'bestDifficulty' | 'bestStreak' | 'currentStreak' | 'ign';
type SortDir = 'asc' | 'desc';

export default function SnipeLeaderboard({ meta, onViewStats }: Props) {
  const [season, setSeason] = useState<number | null>(null); // null = current
  const [colSort, setColSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'total', dir: 'desc' });
  const { players, loading, error } = useExecSnipeLeaderboard('Total Snipes', season);

  const seasonValue = season ?? meta.currentSeason;

  const toggleColSort = (col: SortCol) => {
    setColSort(prev => prev.col === col && prev.dir === 'desc' ? { col, dir: 'asc' } : { col, dir: 'desc' });
  };
  const colArrow = (col: SortCol) => colSort.col === col ? (colSort.dir === 'desc' ? ' ▼' : ' ▲') : '';

  const sortedPlayers = [...players].sort((a, b) => {
    const mul = colSort.dir === 'desc' ? -1 : 1;
    if (colSort.col === 'ign') return mul * a.ign.localeCompare(b.ign);
    return mul * ((a[colSort.col] as number) - (b[colSort.col] as number));
  });

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.15rem' }}>Season</label>
          <select style={inputStyle} value={season ?? ''} onChange={e => setSeason(e.target.value === '' ? null : parseInt(e.target.value, 10))}>
            <option value="">Current (S{meta.currentSeason})</option>
            <option value={0}>All Time</option>
            {[...meta.seasonsWithData].sort((a, b) => b - a).map(s => (
              <option key={s} value={s}>Season {s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
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
                  <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleColSort('bestDifficulty')}>Best Diff{colArrow('bestDifficulty')}</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Best HQ</th>
                  <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleColSort('bestStreak')}>Best Streak{colArrow('bestStreak')}</th>
                  <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleColSort('currentStreak')}>Current Streak{colArrow('currentStreak')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((p, idx) => (
                  <tr key={p.ign} style={{ borderBottom: '1px solid var(--border-card)', cursor: 'pointer' }} onClick={() => onViewStats(p.ign)}>
                    <td style={{ ...tdStyle, textAlign: 'center', color: idx < 3 ? '#f59e0b' : 'var(--text-secondary)', fontWeight: idx < 3 ? '700' : '400' }}>
                      {idx + 1}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: '600', color: 'var(--text-primary)' }}>{p.ign}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '700', color: 'var(--text-primary)' }}>{p.total}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: getDifficultyColor(p.bestDifficulty), fontWeight: '700' }}>{p.bestDifficulty}k</td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{p.bestHq}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-primary)' }}>{p.bestStreak}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: p.currentStreak > 0 ? '#22c55e' : 'var(--text-secondary)' }}>{p.currentStreak}</td>
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

const thStyle: React.CSSProperties = {
  padding: '0.6rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.7rem',
};
const tdStyle: React.CSSProperties = {
  padding: '0.5rem',
};
