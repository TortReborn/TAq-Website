"use client";

import { useState, useEffect, useMemo } from 'react';
import { useExecSnipeStats } from '@/hooks/useExecSnipes';
import { getDifficultyColor, ROLE_COLORS, isDry } from '@/lib/snipe-constants';

interface Props {
  meta: {
    igns: string[];
    currentSeason: number;
    seasonsWithData: number[];
  };
  initialIgn: string | null;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.5rem 0.75rem',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', width: '100%',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', borderRadius: '0.5rem', border: '1px solid var(--border-card)',
  padding: '0.75rem 1rem', textAlign: 'center',
};

const sectionStyle: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)',
  padding: '1rem', marginBottom: '1rem',
};

export default function SnipeStats({ meta, initialIgn }: Props) {
  const [search, setSearch] = useState(initialIgn || '');
  const [selectedIgn, setSelectedIgn] = useState<string | null>(initialIgn);
  const [showDropdown, setShowDropdown] = useState(false);
  const { stats, loading, error } = useExecSnipeStats(selectedIgn);

  useEffect(() => {
    if (initialIgn && initialIgn !== selectedIgn) {
      setSearch(initialIgn);
      setSelectedIgn(initialIgn);
    }
  }, [initialIgn]);

  const filtered = useMemo(() => {
    if (!search) return [];
    const lower = search.toLowerCase();
    return meta.igns.filter(i => i.toLowerCase().includes(lower)).slice(0, 15);
  }, [search, meta.igns]);

  const selectPlayer = (ign: string) => {
    setSearch(ign);
    setSelectedIgn(ign);
    setShowDropdown(false);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div>
      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1.25rem', maxWidth: '400px' }}>
        <input
          style={inputStyle}
          value={search}
          onChange={e => { setSearch(e.target.value); setSelectedIgn(null); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder="Search player IGN..."
        />
        {showDropdown && filtered.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
            background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.375rem',
            maxHeight: '200px', overflowY: 'auto', marginTop: '2px',
          }}>
            {filtered.map(ign => (
              <div
                key={ign}
                style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                onMouseDown={() => selectPlayer(ign)}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-primary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {ign}
              </div>
            ))}
          </div>
        )}
      </div>

      {!selectedIgn && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Search for a player to view their stats.
        </div>
      )}

      {loading && selectedIgn && (
        <div style={{ height: '300px', background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', animation: 'pulse 1.5s ease-in-out infinite' }} />
      )}

      {error && selectedIgn && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '1rem', color: '#ef4444', fontSize: '0.85rem' }}>
          {error.message || 'Player not found'}
        </div>
      )}

      {stats && !loading && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Total Snipes</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.total}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Rank #{stats.ranking}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Best Difficulty</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: getDifficultyColor(stats.bestDifficulty) }}>{stats.bestDifficulty}k</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{stats.bestHq}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Best Streak</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.bestStreak}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>days</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Current Streak</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: stats.currentStreak > 0 ? '#22c55e' : 'var(--text-secondary)' }}>{stats.currentStreak}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>days</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Dry Snipes</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f59e0b' }}>{stats.drySnipes}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Zero Conn</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.zeroConnSnipes}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Role Breakdown */}
            <div style={sectionStyle}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Role Breakdown</h3>
              {stats.roleBreakdown.map(r => {
                const pct = stats.total > 0 ? (r.count / stats.total) * 100 : 0;
                return (
                  <div key={r.role} style={{ marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.15rem' }}>
                      <span style={{ color: ROLE_COLORS[r.role as keyof typeof ROLE_COLORS] || 'var(--text-primary)', fontWeight: '600' }}>{r.role}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{r.count} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-primary)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: ROLE_COLORS[r.role as keyof typeof ROLE_COLORS] || '#888', borderRadius: '3px' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Activity by Day */}
            <div style={sectionStyle}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Activity by Day</h3>
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'end', height: '80px' }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                  const count = stats.activityByDay[day] || 0;
                  const maxCount = Math.max(...Object.values(stats.activityByDay), 1);
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '100%', background: 'var(--bg-primary)', borderRadius: '3px 3px 0 0', position: 'relative', height: '60px', display: 'flex', alignItems: 'end' }}>
                        <div style={{ width: '100%', height: `${Math.max(pct, 3)}%`, background: 'var(--color-ocean-400)', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                      </div>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{day}</span>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Duo Partners */}
            <div style={sectionStyle}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Top Duo Partners</h3>
              {stats.duoPartners.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No duo data.</div>
              ) : (
                stats.duoPartners.slice(0, 5).map((d, i) => (
                  <div key={d.ign} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: i < 4 ? '1px solid var(--border-card)' : 'none', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{d.ign}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{d.count} shared • best {d.bestDifficulty}k</span>
                  </div>
                ))
              )}
            </div>

            {/* Top Guilds */}
            <div style={sectionStyle}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Most Sniped Guilds</h3>
              {stats.topGuilds.map((g, i) => (
                <div key={g.tag} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: i < stats.topGuilds.length - 1 ? '1px solid var(--border-card)' : 'none', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>[{g.tag}]</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{g.count}</span>
                </div>
              ))}
            </div>

            {/* Top HQs */}
            <div style={sectionStyle}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Most Sniped HQs</h3>
              {stats.topHqs.map((h, i) => (
                <div key={h.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: i < stats.topHqs.length - 1 ? '1px solid var(--border-card)' : 'none', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{h.name}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{h.count}</span>
                </div>
              ))}
            </div>

            {/* Info */}
            <div style={sectionStyle}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Info</h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                <div>First snipe: {formatDate(stats.firstSnipe)}</div>
                <div>Latest snipe: {formatDate(stats.latestSnipe)}</div>
                <div>Unique guilds: {stats.uniqueGuilds}</div>
                <div>Unique HQs: {stats.uniqueHqs}</div>
                <div>Best day: {stats.bestDay.count} snipes on {formatDate(stats.bestDay.date)}</div>
              </div>
            </div>
          </div>

          {/* Recent Snipes */}
          <div style={sectionStyle}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Recent Snipes</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.7rem' }}>Date</th>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.7rem' }}>HQ</th>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.7rem' }}>Guild</th>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.7rem' }}>Diff</th>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.7rem' }}>Team</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentSnipes.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-card)' }}>
                      <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-secondary)' }}>{formatDate(s.snipedAt)}</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-primary)' }}>{s.hq}</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-primary)' }}>[{s.guildTag}]</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: getDifficultyColor(s.difficulty), fontWeight: '700' }}>{s.difficulty}k</td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>
                        {s.participants.map((p, i) => (
                          <span key={i}>
                            {i > 0 && ', '}
                            <span style={{ color: ROLE_COLORS[p.role as keyof typeof ROLE_COLORS] || 'var(--text-primary)' }}>{p.ign}</span>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
