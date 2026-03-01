"use client";

import { useState } from 'react';
import { useExecActivity } from '@/hooks/useExecActivity';
import { useKickList } from '@/hooks/useKickList';
import ExecActivityTable from '@/components/ExecActivityTable';
import KickListPanel from '@/components/KickListPanel';

export default function ExecActivityPage() {
  const { data, loading, error, refresh } = useExecActivity();
  const kickList = useKickList();
  const [timeFrame, setTimeFrame] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('exec_activity_timeframe') || '7';
    return '7';
  });
  const [sortMode, setSortMode] = useState<'activity' | 'kick'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('exec_activity_sortmode');
      if (saved === 'activity' || saved === 'kick') return saved;
    }
    return 'kick';
  });
  const [searchTerm, setSearchTerm] = useState('');

  const handleTimeFrame = (value: string) => {
    setTimeFrame(value);
    localStorage.setItem('exec_activity_timeframe', value);
  };

  const handleSortMode = (value: 'activity' | 'kick') => {
    setSortMode(value);
    localStorage.setItem('exec_activity_sortmode', value);
  };

  if (loading && !data) {
    return (
      <div>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: '800',
          color: 'var(--text-primary)',
          marginBottom: '2rem',
        }}>
          Player Activity
        </h1>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '0.75rem',
          border: '1px solid var(--border-card)',
          height: '400px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: '800',
          color: 'var(--text-primary)',
          marginBottom: '2rem',
        }}>
          Player Activity
        </h1>
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '0.5rem',
          padding: '1rem',
          color: '#ef4444',
        }}>
          Failed to load activity data: {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const timeFrames = [
    { value: '7', label: '7 Days' },
    { value: '14', label: '14 Days' },
    { value: '30', label: '30 Days' },
  ];

  const threshold = Number(timeFrame) * 5 / 7;
  const belowCount = data.members.filter(m => {
    if (m.isNewMember) return false;
    const tf = m.timeFrames[timeFrame];
    return tf?.hasCompleteData && tf.playtime < threshold;
  }).length;
  const newCount = data.members.filter(m => m.isNewMember).length;

  return (
    <div>
      <h1 style={{
        fontSize: '1.75rem',
        fontWeight: '800',
        color: 'var(--text-primary)',
        marginBottom: '0.5rem',
      }}>
        Player Activity
      </h1>
      <p style={{
        color: 'var(--text-secondary)',
        fontSize: '0.85rem',
        marginBottom: '1.5rem',
      }}>
        {data.members.length} members &middot; {belowCount} below threshold &middot; {newCount} new (&lt;7d)
        &middot; Threshold: {threshold.toFixed(1)}h/{timeFrame}d (5h/week)
      </p>

      <div style={{
        display: 'flex',
        gap: '1.25rem',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}>
        {/* Left panel — Activity */}
        <div style={{ flex: '1 1 650px', minWidth: 0 }}>
          {/* Controls */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          marginBottom: '1rem',
          background: 'var(--bg-card)',
          padding: '1rem',
          borderRadius: '0.75rem',
          border: '1px solid var(--border-card)',
        }}>
          {/* Time frame */}
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            {timeFrames.map(tf => (
              <button
                key={tf.value}
                onClick={() => handleTimeFrame(tf.value)}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid',
                  borderColor: timeFrame === tf.value ? 'var(--color-ocean-500)' : 'var(--border-card)',
                  background: timeFrame === tf.value ? 'var(--color-ocean-500)' : 'transparent',
                  color: timeFrame === tf.value ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                }}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Sort mode */}
          <div style={{
            display: 'flex',
            gap: '0.375rem',
            borderLeft: '1px solid var(--border-card)',
            paddingLeft: '1rem',
          }}>
            <button
              onClick={() => handleSortMode('activity')}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid',
                borderColor: sortMode === 'activity' ? '#22c55e' : 'var(--border-card)',
                background: sortMode === 'activity' ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
                color: sortMode === 'activity' ? '#22c55e' : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '600',
              }}
            >
              Activity
            </button>
            <button
              onClick={() => handleSortMode('kick')}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid',
                borderColor: sortMode === 'kick' ? '#ef4444' : 'var(--border-card)',
                background: sortMode === 'kick' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                color: sortMode === 'kick' ? '#ef4444' : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '600',
              }}
            >
              Kick Suitability
            </button>
          </div>

          {/* Search + Refresh */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            marginLeft: 'auto',
          }}>
            <input
              type="text"
              placeholder="Search player..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                width: '160px',
              }}
            />
            <button
              onClick={refresh}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-card)',
                background: 'transparent',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '600',
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        <ExecActivityTable
          members={data.members}
          timeFrame={timeFrame}
          searchTerm={searchTerm}
          sortMode={sortMode}
          onAddToKickList={kickList.addToKickList}
          kickListUuids={new Set(kickList.entries.map(e => e.uuid))}
        />
      </div>

        {/* Right panel — Kick List */}
        <div style={{ flex: '0 0 320px', minWidth: '280px' }}>
          <KickListPanel
            entries={kickList.entries}
            lastUpdated={kickList.lastUpdated}
            lastUpdatedBy={kickList.lastUpdatedBy}
            loading={kickList.loading}
            members={data.members}
            onAdd={kickList.addToKickList}
            onRemove={kickList.removeFromKickList}
            onChangeTier={kickList.changeTier}
          />
        </div>
      </div>
    </div>
  );
}
