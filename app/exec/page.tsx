"use client";

import Link from 'next/link';
import { useState, useRef } from 'react';
import { useExecDashboard } from '@/hooks/useExecDashboard';
import { getRankColor, RANK_ORDER } from '@/lib/rank-constants';

function StatCard({ label, value, color, href }: { label: string; value: string | number; color: string; href?: string }) {
  const content = (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '0.5rem',
      padding: '0.75rem 1rem',
      border: '1px solid var(--border-card)',
      flex: '1 1 140px',
      minWidth: '120px',
      cursor: href ? 'pointer' : 'default',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
    }}
      onMouseEnter={(e) => {
        if (href) {
          e.currentTarget.style.borderColor = color;
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (href) {
          e.currentTarget.style.borderColor = 'var(--border-card)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      <div style={{
        fontSize: '1.4rem',
        fontWeight: '800',
        color: color,
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '0.7rem',
        color: 'var(--text-secondary)',
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        lineHeight: 1.2,
      }}>
        {label}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none', flex: '1 1 140px', minWidth: '120px' }}>{content}</Link>;
  }
  return content;
}

function OnlineStatCard({ count, members }: { count: number; members: { name: string; rank: string }[] }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sorted = [...members].sort((a, b) => {
    const aOrder = RANK_ORDER[a.rank] ?? 999;
    const bOrder = RANK_ORDER[b.rank] ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });

  return (
    <div
      style={{ position: 'relative', flex: '1 1 140px', minWidth: '120px' }}
      onMouseEnter={() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setShowTooltip(true);
      }}
      onMouseLeave={() => {
        timeoutRef.current = setTimeout(() => setShowTooltip(false), 150);
      }}
    >
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '0.5rem',
        padding: '0.75rem 1rem',
        border: '1px solid var(--border-card)',
        cursor: 'default',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#22c55e';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-card)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#22c55e', lineHeight: 1 }}>
          {count}
        </div>
        <div style={{
          fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '500',
          textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.2,
        }}>
          Online
        </div>
      </div>

      {showTooltip && sorted.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '6px',
          background: '#1e293b',
          border: '1px solid var(--border-card)',
          borderRadius: '0.5rem',
          padding: '0.5rem 0',
          minWidth: '180px',
          maxHeight: '280px',
          overflowY: 'auto',
          zIndex: 100,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        }}>
          {sorted.map((m) => (
            <div
              key={m.name}
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: '600',
                color: getRankColor(m.rank),
                whiteSpace: 'nowrap',
              }}
            >
              {m.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExecDashboardPage() {
  const { data, loading, error } = useExecDashboard();

  if (loading && !data) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: '800',
          color: 'var(--text-primary)',
          marginBottom: '2rem',
        }}>
          Dashboard
        </h1>
        <div style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              background: 'var(--bg-card)',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              border: '1px solid var(--border-card)',
              flex: '1 1 200px',
              minWidth: '180px',
              height: '100px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '0.5rem',
          padding: '1rem',
          color: '#ef4444',
        }}>
          Failed to load dashboard: {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 80px - 4rem)',
    }}>
      <h1 style={{
        fontSize: '1.75rem',
        fontWeight: '800',
        color: 'var(--text-primary)',
        marginBottom: '1rem',
      }}>
        Dashboard
      </h1>

      {/* Stats row */}
      <div data-tour="stats" style={{
        display: 'flex',
        gap: '0.75rem',
        flexWrap: 'wrap',
        marginBottom: '1rem',
      }}>
        <StatCard
          label="Pending Apps"
          value={data.pendingApplications}
          color="#f59e0b"
          href="/exec/applications"
        />
        <StatCard
          label="Members"
          value={data.guild.totalMembers}
          color="var(--color-ocean-400)"
          href="/exec/activity"
        />
        <OnlineStatCard
          count={data.guild.onlineMembers}
          members={data.guild.onlineMembersList || []}
        />
      </div>

      {/* Recent Applications — fixed height for 5 apps */}
      <div data-tour="recent-apps" style={{
        background: 'var(--bg-card)',
        borderRadius: '0.75rem',
        border: '1px solid var(--border-card)',
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '1rem',
        flexShrink: 0,
        height: '295px',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border-card)',
          flexShrink: 0,
        }}>
          <h2 style={{
            fontSize: '1rem',
            fontWeight: '700',
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            Recent Applications
          </h2>
          <Link href="/exec/applications" style={{
            fontSize: '0.75rem',
            color: 'var(--color-ocean-400)',
            textDecoration: 'none',
            fontWeight: '500',
          }}>
            View all
          </Link>
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.5rem',
        }}>
          {data.recentApplications.length === 0 ? (
            <div style={{
              color: 'var(--text-secondary)',
              fontSize: '0.9rem',
              textAlign: 'center',
              padding: '2rem 0',
            }}>
              No applications yet.
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
            }}>
              {data.recentApplications.slice(0, 5).map(app => {
                const statusColors: Record<string, string> = {
                  pending: '#f59e0b',
                  accepted: '#22c55e',
                  denied: '#ef4444',
                };
                const voteSummary = app.votes
                  ? `${app.votes.accept}/${app.votes.deny}/${app.votes.abstain}`
                  : '0/0/0';

                return (
                  <Link
                    key={app.id}
                    href={`/exec/applications?id=${app.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '0.5rem',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      textDecoration: 'none',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: statusColors[app.status] || '#6b7280',
                        flexShrink: 0,
                      }} />
                      <div>
                        <div style={{
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          color: 'var(--text-primary)',
                        }}>
                          {app.username}
                        </div>
                        <div style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-secondary)',
                        }}>
                          {app.type === 'guild' ? 'Guild' : 'Community'} &middot; {new Date(app.submittedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                      }} title="Accept / Deny / Abstain">
                        Votes: {voteSummary}
                      </div>
                      <div style={{
                        fontSize: '0.7rem',
                        fontWeight: '600',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.25rem',
                        background: `${statusColors[app.status] || '#6b7280'}20`,
                        color: statusColors[app.status] || '#6b7280',
                        textTransform: 'capitalize',
                      }}>
                        {app.status}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick Links — pinned to bottom */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '0.75rem',
        flex: 1,
        minHeight: 0,
      }}>
        {[
          {
            category: 'Members',
            color: 'var(--color-ocean-400)',
            links: [
              { href: '/exec/applications', label: 'Applications', desc: 'Review and vote on applications' },
              { href: '/exec/activity', label: 'Activity', desc: 'Track activity and update kick list' },
              { href: '/exec/promotions', label: 'Promotions', desc: 'Manage and suggest promotions' },
              { href: '/exec/blacklist', label: 'Blacklist', desc: 'View and add banned players' },
            ],
          },
          {
            category: 'Activities',
            color: '#ef4444',
            links: [
              { href: '/exec/graid', label: 'Graid Events', desc: 'Schedule and manage guild raids' },
              { href: '/exec/snipes', label: 'Snipes', desc: 'Track territory snipe attempts' },
              { href: '/exec/builds', label: 'War Builds', desc: 'Manage war roles and builds' },
              { href: '/exec/guild-bank', label: 'Guild Bank', desc: 'Track war consumables and items' },
            ],
          },
          {
            category: 'Economy',
            color: '#f59e0b',
            links: [
              { href: '/exec/shells', label: 'Shells', desc: 'Manage member shell balances' },
              { href: '/exec/shell-exchange', label: 'Shell Exchange', desc: 'Update exchange rates' },
              { href: '/exec/backgrounds', label: 'Backgrounds', desc: 'Manage profile backgrounds' },
            ],
          },
          {
            category: 'Operations',
            color: '#22c55e',
            links: [
              { href: '/exec/agenda', label: 'Agenda', desc: 'View and manage meeting agenda' },
            ],
          },
        ].map((group) => (
          <div key={group.category} style={{
            background: 'var(--bg-card)',
            borderRadius: '0.75rem',
            border: '1px solid var(--border-card)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '0.625rem 1rem',
              fontSize: '0.75rem',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: group.color,
              background: 'rgba(255, 255, 255, 0.03)',
              borderBottom: '1px solid var(--border-card)',
            }}>
              {group.category}
            </div>
            <div style={{ padding: '0.5rem' }}>
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    display: 'block',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '0.375rem',
                    textDecoration: 'none',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    marginBottom: '0.15rem',
                  }}>
                    {link.label}
                  </div>
                  <div style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                  }}>
                    {link.desc}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
