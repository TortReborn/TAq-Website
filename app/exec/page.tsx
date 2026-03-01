"use client";

import Link from 'next/link';
import { useExecDashboard } from '@/hooks/useExecDashboard';

function StatCard({ label, value, color, href }: { label: string; value: string | number; color: string; href?: string }) {
  const content = (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '0.75rem',
      padding: '1.5rem',
      border: '1px solid var(--border-card)',
      flex: '1 1 200px',
      minWidth: '180px',
      cursor: href ? 'pointer' : 'default',
      transition: 'all 0.2s ease',
    }}
      onMouseEnter={(e) => {
        if (href) {
          e.currentTarget.style.borderColor = color;
          e.currentTarget.style.transform = 'translateY(-2px)';
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
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        marginBottom: '0.5rem',
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '2rem',
        fontWeight: '800',
        color: color,
      }}>
        {value}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none', flex: '1 1 200px', minWidth: '180px' }}>{content}</Link>;
  }
  return content;
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
    <div>
      <h1 style={{
        fontSize: '1.75rem',
        fontWeight: '800',
        color: 'var(--text-primary)',
        marginBottom: '2rem',
      }}>
        Dashboard
      </h1>

      {/* Stats row */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
        marginBottom: '2rem',
      }}>
        <StatCard
          label="Pending Applications"
          value={data.pendingApplications}
          color="#f59e0b"
          href="/exec/applications"
        />
        <StatCard
          label="Guild Members"
          value={data.guild.totalMembers}
          color="var(--color-ocean-400)"
          href="/exec/activity"
        />
        <StatCard
          label="Online Now"
          value={data.guild.onlineMembers}
          color="#22c55e"
        />
      </div>

      {/* Recent Applications */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        border: '1px solid var(--border-card)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}>
          <h2 style={{
            fontSize: '1.1rem',
            fontWeight: '700',
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            Recent Applications
          </h2>
          <Link href="/exec/applications" style={{
            fontSize: '0.8rem',
            color: 'var(--color-ocean-400)',
            textDecoration: 'none',
            fontWeight: '500',
          }}>
            View all
          </Link>
        </div>

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
            gap: '0.5rem',
          }}>
            {data.recentApplications.map(app => {
              const statusColors: Record<string, string> = {
                pending: '#f59e0b',
                accepted: '#22c55e',
                denied: '#ef4444',
              };
              const voteSummary = app.votes
                ? `${app.votes.accept}/${app.votes.deny}/${app.votes.abstain}`
                : '0/0/0';

              return (
                <div key={app.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: statusColors[app.status] || '#6b7280',
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
