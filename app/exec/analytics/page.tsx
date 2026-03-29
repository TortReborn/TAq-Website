"use client";

import { useState, useMemo } from 'react';
import {
  useAnalyticsOverview,
  useAnalyticsLogins,
  useAnalyticsPageviews,
  useAnalyticsActions,
  useAnalyticsUsers,
} from '@/hooks/useExecAnalytics';

type Tab = 'logins' | 'pages' | 'users' | 'actions';
type Range = '7d' | '30d' | '90d' | 'all';

function getDateRange(range: Range): { from?: string; to?: string } {
  if (range === 'all') return {};
  const now = new Date();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString() };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '< 1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDay(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>('30d');
  const [tab, setTab] = useState<Tab>('logins');
  const [pageFilter, setPageFilter] = useState<string>('');

  const { from } = useMemo(() => getDateRange(range), [range]);

  const overview = useAnalyticsOverview(from);
  const logins = useAnalyticsLogins(from);
  const pageviews = useAnalyticsPageviews(from, undefined, pageFilter || undefined);
  const actions = useAnalyticsActions(from, undefined, pageFilter || undefined);
  const users = useAnalyticsUsers(from);

  const loading = overview.loading;
  const error = overview.error;

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    borderRadius: '0.75rem',
    border: '1px solid var(--border-card)',
    padding: '1.25rem',
    flex: 1,
    minWidth: '140px',
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: '600',
    background: active ? 'var(--color-ocean-400)' : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--text-secondary)',
    transition: 'all 0.15s',
  });

  const rangeBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.375rem 0.75rem',
    borderRadius: '0.375rem',
    border: active ? '1px solid var(--color-ocean-400)' : '1px solid var(--border-card)',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: '600',
    background: active ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-card)',
    color: active ? 'var(--color-ocean-400)' : 'var(--text-secondary)',
    transition: 'all 0.15s',
  });

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.85rem',
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '0.625rem 0.75rem',
    borderBottom: '1px solid var(--border-card)',
    color: 'var(--text-secondary)',
    fontWeight: '600',
    fontSize: '0.8rem',
  };

  const tdStyle: React.CSSProperties = {
    padding: '0.625rem 0.75rem',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    color: 'var(--text-primary)',
  };

  if (loading && !overview.data) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>
          Analytics
        </h1>
        <div style={{
          background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)',
          height: '400px', animation: 'pulse 1.5s ease-in-out infinite',
        }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && !overview.data) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>
          Analytics
        </h1>
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '0.5rem', padding: '1rem', color: '#ef4444',
        }}>
          Failed to load analytics: {error}
        </div>
      </div>
    );
  }

  const o = overview.data;
  const maxBarValue = logins.data?.daily?.length
    ? Math.max(...logins.data.daily.map(d => d.count), 1)
    : 1;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
            Analytics
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            Site usage metrics and visitor activity
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {(['7d', '30d', '90d', 'all'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)} style={rangeBtnStyle(range === r)}>
              {r === 'all' ? 'All' : r}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Cards */}
      {o && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unique Users</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '0.25rem' }}>{o.uniqueUsers}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Page Views</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '0.25rem' }}>{o.totalPageViews.toLocaleString()}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Logins</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '0.25rem' }}>{o.totalLogins}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Duration</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '0.25rem' }}>{formatDuration(o.avgSessionDuration)}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {([['logins', 'Logins'], ['pages', 'Pages'], ['users', 'Users'], ['actions', 'Actions']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => { setTab(t); setPageFilter(''); }} style={tabBtnStyle(tab === t)}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)',
        padding: '1.5rem',
      }}>

        {/* === LOGINS TAB === */}
        {tab === 'logins' && logins.data && (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 1rem' }}>
              Login Activity
            </h2>

            {/* Bar Chart */}
            {logins.data.daily.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '120px' }}>
                  {logins.data.daily.map((d, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                      <div
                        title={`${formatDay(d.day)}: ${d.count} logins`}
                        style={{
                          width: '100%',
                          maxWidth: '32px',
                          height: `${Math.max((d.count / maxBarValue) * 100, 4)}%`,
                          background: 'var(--color-ocean-400)',
                          borderRadius: '2px 2px 0 0',
                          minHeight: '2px',
                          transition: 'height 0.3s ease',
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '2px', marginTop: '0.25rem' }}>
                  {logins.data.daily.length <= 14 ? logins.data.daily.map((d, i) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                      {formatDay(d.day)}
                    </div>
                  )) : (
                    <>
                      <div style={{ flex: 1, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{formatDay(logins.data.daily[0].day)}</div>
                      <div style={{ flex: 1 }} />
                      <div style={{ flex: 1, textAlign: 'right', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{formatDay(logins.data.daily[logins.data.daily.length - 1].day)}</div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Recent Logins Table */}
            <h3 style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>Recent Logins</h3>
            {logins.data.recent.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No logins in this period</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>IGN</th>
                      <th style={thStyle}>Rank</th>
                      <th style={thStyle}>Role</th>
                      <th style={thStyle}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logins.data.recent.map((l, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{l.ign || l.discord_id}</td>
                        <td style={tdStyle}>{l.rank}</td>
                        <td style={tdStyle}>
                          <span style={{
                            padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600',
                            background: l.role === 'exec' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.08)',
                            color: l.role === 'exec' ? '#3b82f6' : 'var(--text-secondary)',
                          }}>
                            {l.role}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{formatDate(l.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* === PAGES TAB === */}
        {tab === 'pages' && pageviews.data && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Page Views
              </h2>
              {pageFilter && (
                <button
                  onClick={() => setPageFilter('')}
                  style={{
                    padding: '0.25rem 0.75rem', borderRadius: '9999px', border: '1px solid var(--border-card)',
                    background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-ocean-400)', fontSize: '0.8rem',
                    fontWeight: '600', cursor: 'pointer',
                  }}
                >
                  {pageFilter} &times;
                </button>
              )}
            </div>
            {pageviews.data.summary.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No page views in this period</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Page</th>
                      <th style={thStyle}>Views</th>
                      <th style={thStyle}>Unique Users</th>
                      <th style={thStyle}>Sessions</th>
                      <th style={thStyle}>Avg Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageviews.data.summary.map((p, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>
                          <span
                            style={{ cursor: 'pointer', color: 'var(--color-ocean-400)', fontWeight: '500' }}
                            onClick={() => setPageFilter(p.page)}
                          >
                            {p.page}
                          </span>
                        </td>
                        <td style={tdStyle}>{p.views.toLocaleString()}</td>
                        <td style={tdStyle}>{p.uniqueUsers}</td>
                        <td style={tdStyle}>{p.sessions}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{formatDuration(p.avgDuration)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* === USERS TAB === */}
        {tab === 'users' && users.data && (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 1rem' }}>
              User Activity
            </h2>
            {users.data.users.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No user activity in this period</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>IGN</th>
                      <th style={thStyle}>Page Views</th>
                      <th style={thStyle}>Actions</th>
                      <th style={thStyle}>Top Page</th>
                      <th style={thStyle}>Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.data.users.map((u, i) => (
                      <tr key={i}>
                        <td style={{ ...tdStyle, fontWeight: '600' }}>{u.ign || u.discordId}</td>
                        <td style={tdStyle}>{u.totalViews.toLocaleString()}</td>
                        <td style={tdStyle}>{u.totalActions.toLocaleString()}</td>
                        <td style={tdStyle}>
                          {u.topPage && (
                            <span
                              style={{ cursor: 'pointer', color: 'var(--color-ocean-400)', fontSize: '0.85rem' }}
                              onClick={() => { setTab('pages'); setPageFilter(u.topPage); }}
                            >
                              {u.topPage}
                            </span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{formatDate(u.lastSeen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* === ACTIONS TAB === */}
        {tab === 'actions' && actions.data && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Actions
              </h2>
              {pageFilter && (
                <button
                  onClick={() => setPageFilter('')}
                  style={{
                    padding: '0.25rem 0.75rem', borderRadius: '9999px', border: '1px solid var(--border-card)',
                    background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-ocean-400)', fontSize: '0.8rem',
                    fontWeight: '600', cursor: 'pointer',
                  }}
                >
                  {pageFilter} &times;
                </button>
              )}
            </div>
            {actions.data.actions.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No actions in this period</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Action</th>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Page</th>
                      <th style={thStyle}>Count</th>
                      <th style={thStyle}>Unique Users</th>
                      <th style={thStyle}>Last Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.data.actions.map((a, i) => (
                      <tr key={i}>
                        <td style={{ ...tdStyle, fontWeight: '500', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.label}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600',
                            background: a.type === 'click' ? 'rgba(59, 130, 246, 0.15)' : a.type === 'submit' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.08)',
                            color: a.type === 'click' ? '#3b82f6' : a.type === 'submit' ? '#22c55e' : 'var(--text-secondary)',
                          }}>
                            {a.type}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span
                            style={{ cursor: 'pointer', color: 'var(--color-ocean-400)', fontSize: '0.85rem' }}
                            onClick={() => setPageFilter(a.page)}
                          >
                            {a.page}
                          </span>
                        </td>
                        <td style={tdStyle}>{a.count.toLocaleString()}</td>
                        <td style={tdStyle}>{a.uniqueUsers}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{formatDate(a.lastUsed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Loading for tab data */}
        {((tab === 'logins' && !logins.data) ||
          (tab === 'pages' && !pageviews.data) ||
          (tab === 'users' && !users.data) ||
          (tab === 'actions' && !actions.data)) && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}
