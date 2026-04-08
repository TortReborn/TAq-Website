"use client";

import { useState } from 'react';
import { useExecGraidLogStats } from '@/hooks/useExecGraidLogs';
import { RAID_TYPE_COLORS, getRaidShort } from '@/lib/graid-log-constants';

interface Props {
  meta: { igns: string[] };
  initialIgn: string | null;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.4rem 0.6rem',
  color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1rem',
};

const statBoxStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center',
};

export default function GraidLogStats({ meta, initialIgn }: Props) {
  const [searchIgn, setSearchIgn] = useState(initialIgn || '');
  const [activeIgn, setActiveIgn] = useState<string | null>(initialIgn);

  const { stats, loading, error } = useExecGraidLogStats(activeIgn);

  const handleSearch = () => {
    if (searchIgn.trim()) setActiveIgn(searchIgn.trim());
  };

  return (
    <div>
      {/* Search */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          list="graid-stats-ign-list"
          placeholder="Search player..."
          value={searchIgn}
          onChange={e => setSearchIgn(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <datalist id="graid-stats-ign-list">{meta.igns.map(n => <option key={n} value={n} />)}</datalist>
        <button onClick={handleSearch} style={{
          background: 'var(--color-ocean-400)', border: 'none', borderRadius: '0.375rem',
          padding: '0.4rem 0.75rem', color: '#fff', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '600',
        }}>Search</button>
      </div>

      {!activeIgn && (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>
          Search for a player to view their graid statistics
        </div>
      )}

      {activeIgn && loading && <div style={{ ...cardStyle, height: '300px', animation: 'pulse 1.5s ease-in-out infinite' }} />}
      {activeIgn && error && <div style={{ ...cardStyle, textAlign: 'center', color: '#ef4444' }}>{error.message || 'Failed to load stats'}</div>}
      {activeIgn && !loading && !error && !stats && (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>No graid logs found for &quot;{activeIgn}&quot;</div>
      )}

      {stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Header card */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>{stats.ign}</h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Rank #{stats.ranking}</span>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--color-ocean-400)' }}>
                {stats.total}<span style={{ fontSize: '0.8rem', fontWeight: '500', color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>raids</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.5rem' }}>
              <div style={statBoxStyle}>
                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.bestStreak}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Best Streak</div>
              </div>
              <div style={statBoxStyle}>
                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: stats.currentStreak > 0 ? '#22c55e' : 'var(--text-primary)' }}>{stats.currentStreak}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Current Streak</div>
              </div>
              <div style={statBoxStyle}>
                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.bestDay.count}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Best Day ({stats.bestDay.date})</div>
              </div>
            </div>
          </div>

          {/* Raid Type Breakdown */}
          <div style={cardStyle}>
            <h3 style={sectionTitle}>Raid Type Breakdown</h3>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {Object.entries(stats.raidTypeCounts).filter(([, c]) => c > 0).map(([type, count]) => (
                <div key={type} style={{ ...statBoxStyle, minWidth: '80px', flex: '1 1 80px' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: '800', color: RAID_TYPE_COLORS[type] || 'var(--text-primary)' }}>{count}</div>
                  <div style={{ fontSize: '0.65rem', color: RAID_TYPE_COLORS[type] || 'var(--text-secondary)', fontWeight: '600' }}>{type}</div>
                </div>
              ))}
            </div>
            {stats.total > 0 && (
              <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', marginTop: '0.75rem' }}>
                {Object.entries(stats.raidTypeCounts).filter(([, c]) => c > 0).map(([type, count]) => (
                  <div key={type} style={{ width: `${(count / stats.total) * 100}%`, background: RAID_TYPE_COLORS[type] || '#6b7280' }} />
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Top Teammates */}
            <div style={cardStyle}>
              <h3 style={sectionTitle}>Top Teammates</h3>
              {stats.topTeammates.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No data</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {stats.topTeammates.slice(0, 8).map((tm, i) => (
                    <div key={tm.ign} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--text-primary)' }}>{i + 1}. {tm.ign}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{tm.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity by Day */}
            <div style={cardStyle}>
              <h3 style={sectionTitle}>Activity by Day</h3>
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'end', height: '80px' }}>
                {Object.entries(stats.activityByDay).map(([day, count]) => {
                  const max = Math.max(...Object.values(stats.activityByDay), 1);
                  const pct = (count / max) * 100;
                  return (
                    <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                      <div style={{
                        width: '100%', maxWidth: '24px', borderRadius: '3px',
                        height: `${Math.max(pct, 4)}%`,
                        background: count > 0 ? 'var(--color-ocean-400)' : 'var(--border-card)',
                      }} />
                      <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)' }}>{day}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Duo Partners */}
          {stats.duoPartners.length > 0 && (
            <div style={cardStyle}>
              <h3 style={sectionTitle}>Duo Partners</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {stats.duoPartners.slice(0, 5).map((dp, i) => (
                  <div key={dp.ign} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-primary)' }}>{i + 1}. {dp.ign}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{dp.count} shared</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Raids */}
          <div style={cardStyle}>
            <h3 style={sectionTitle}>Recent Raids</h3>
            {stats.recentRaids.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No recent raids</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {stats.recentRaids.map(raid => {
                  const short = getRaidShort(raid.raidType);
                  const color = RAID_TYPE_COLORS[short] || RAID_TYPE_COLORS.Unknown;
                  return (
                    <div key={raid.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: '0.8rem', padding: '0.4rem 0.5rem', borderRadius: '0.375rem', background: 'var(--bg-primary)',
                    }}>
                      <div>
                        <span style={{ color, fontWeight: '700', marginRight: '0.5rem' }}>{short}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                          with {raid.participants.filter(p => p.ign !== stats.ign).map(p => p.ign).join(', ') || 'solo'}
                        </span>
                      </div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                        {new Date(raid.completedAt).toLocaleDateString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            First raid: {new Date(stats.firstRaid).toLocaleDateString()} — Latest: {new Date(stats.latestRaid).toLocaleDateString()}
          </div>
        </div>
      )}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}

const sectionTitle: React.CSSProperties = { fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' };
