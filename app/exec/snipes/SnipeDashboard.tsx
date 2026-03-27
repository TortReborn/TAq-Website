"use client";

import { useState } from 'react';
import { useExecSnipeDashboard } from '@/hooks/useExecSnipes';
import { getDifficultyColor, ROLE_COLORS } from '@/lib/snipe-constants';

interface Props {
  meta: {
    currentSeason: number;
    seasonsWithData: number[];
  };
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.4rem 0.6rem',
  color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
};

const statCardStyle: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)',
  padding: '1rem', textAlign: 'center',
};

const sectionStyle: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)',
  padding: '1rem', marginBottom: '1rem',
};

export default function SnipeDashboard({ meta }: Props) {
  const [season, setSeason] = useState<number | null>(null);
  const { data, loading, error } = useExecSnipeDashboard(season);

  return (
    <div>
      {/* Season selector */}
      <div style={{ marginBottom: '1rem' }}>
        <select style={inputStyle} value={season ?? ''} onChange={e => setSeason(e.target.value === '' ? null : parseInt(e.target.value, 10))}>
          <option value="">Current Season (S{meta.currentSeason})</option>
          <option value={0}>All Time</option>
          {[...meta.seasonsWithData].sort((a, b) => b - a).map(s => (
            <option key={s} value={s}>Season {s}</option>
          ))}
        </select>
      </div>

      {loading && !data ? (
        <div style={{ height: '300px', background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : error ? (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '1rem', color: '#ef4444', fontSize: '0.85rem' }}>
          Failed to load dashboard
        </div>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={statCardStyle}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Total Snipes</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)' }}>{data.totalSnipes}</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Unique Participants</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--color-ocean-400)' }}>{data.uniqueParticipants}</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Most Sniped Guild</div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                {data.mostSnipedGuild ? `[${data.mostSnipedGuild.tag}]` : '—'}
              </div>
              {data.mostSnipedGuild && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{data.mostSnipedGuild.count} times</div>}
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Hardest Snipe</div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color: data.hardestSnipe ? getDifficultyColor(data.hardestSnipe.difficulty) : 'var(--text-secondary)' }}>
                {data.hardestSnipe ? `${data.hardestSnipe.difficulty}k` : '—'}
              </div>
              {data.hardestSnipe && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{data.hardestSnipe.hq} vs [{data.hardestSnipe.guildTag}]</div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Snipes over time */}
            <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Snipes per Week</h3>
              {data.snipesOverTime.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No data.</div>
              ) : (
                <div style={{ display: 'flex', gap: '2px', alignItems: 'end', height: '120px', paddingBottom: '20px', position: 'relative' }}>
                  {data.snipesOverTime.map((w, i) => {
                    const maxCount = Math.max(...data.snipesOverTime.map(x => x.count), 1);
                    const pct = (w.count / maxCount) * 100;
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                        <div
                          style={{
                            width: '100%', maxWidth: '40px',
                            height: `${Math.max(pct, 3)}%`,
                            background: 'var(--color-ocean-400)',
                            borderRadius: '2px 2px 0 0',
                            transition: 'height 0.3s',
                            minHeight: '2px',
                          }}
                          title={`${w.week}: ${w.count} snipes`}
                        />
                        {(i === 0 || i === data.snipesOverTime.length - 1 || i % Math.max(1, Math.floor(data.snipesOverTime.length / 5)) === 0) && (
                          <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', position: 'absolute', bottom: '-16px', whiteSpace: 'nowrap' }}>
                            {w.week.slice(5)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Difficulty distribution */}
            <div style={sectionStyle}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Difficulty Distribution</h3>
              {data.difficultyDistribution.map(b => {
                const maxCount = Math.max(...data.difficultyDistribution.map(x => x.count), 1);
                const pct = (b.count / maxCount) * 100;
                // Map bucket to a representative difficulty for color
                const repDiff = parseInt(b.bucket) || 0;
                return (
                  <div key={b.bucket} style={{ marginBottom: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.1rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{b.bucket}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{b.count}</span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(pct, 2)}%`, height: '100%', background: getDifficultyColor(repDiff), borderRadius: '4px', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Role distribution */}
            <div style={sectionStyle}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Role Distribution</h3>
              {(() => {
                const totalRoles = data.roleDistribution.reduce((sum, r) => sum + r.count, 0) || 1;
                return (
                  <>
                    {/* Stacked bar */}
                    <div style={{ height: '24px', borderRadius: '12px', overflow: 'hidden', display: 'flex', marginBottom: '0.75rem' }}>
                      {data.roleDistribution.map(r => (
                        <div key={r.role} style={{
                          width: `${(r.count / totalRoles) * 100}%`,
                          background: ROLE_COLORS[r.role as keyof typeof ROLE_COLORS] || '#888',
                          minWidth: r.count > 0 ? '2px' : '0',
                        }} />
                      ))}
                    </div>
                    {data.roleDistribution.map(r => (
                      <div key={r.role} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.2rem 0' }}>
                        <span style={{ color: ROLE_COLORS[r.role as keyof typeof ROLE_COLORS] || 'var(--text-primary)', fontWeight: '600' }}>{r.role}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{r.count} ({((r.count / totalRoles) * 100).toFixed(0)}%)</span>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>

            {/* Guild breakdown */}
            <div style={sectionStyle}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Top Sniped Guilds</h3>
              {data.guildBreakdown.map((g, i) => {
                const maxCount = data.guildBreakdown[0]?.count || 1;
                const pct = (g.count / maxCount) * 100;
                return (
                  <div key={g.tag} style={{ marginBottom: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.1rem' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>[{g.tag}]</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{g.count}</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-primary)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-ocean-400)', borderRadius: '3px' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* HQ frequency */}
            <div style={sectionStyle}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Top Sniped HQs</h3>
              {data.hqFrequency.map((h, i) => {
                const maxCount = data.hqFrequency[0]?.count || 1;
                const pct = (h.count / maxCount) * 100;
                return (
                  <div key={h.name} style={{ marginBottom: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.1rem' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{h.name}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{h.count}</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-primary)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: '#22c55e', borderRadius: '3px' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Season comparison */}
            {data.seasonComparison.length > 1 && (
              <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Season Comparison</h3>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'end', height: '100px' }}>
                  {data.seasonComparison.map(s => {
                    const maxCount = Math.max(...data.seasonComparison.map(x => x.count), 1);
                    const pct = (s.count / maxCount) * 100;
                    return (
                      <div key={s.season} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)', fontWeight: '600', marginBottom: '0.25rem' }}>{s.count}</span>
                        <div style={{
                          width: '100%', maxWidth: '60px',
                          height: `${Math.max(pct, 5)}%`,
                          background: 'var(--color-ocean-400)',
                          borderRadius: '4px 4px 0 0',
                        }} />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>S{s.season}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
