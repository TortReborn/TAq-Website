"use client";

import { useState } from 'react';
import { useExecApplications, useExecHammerheadApplications } from '@/hooks/useExecApplications';
import { useExecSession } from '@/hooks/useExecSession';
import { useKickList } from '@/hooks/useKickList';
import ApplicationCard from '@/components/ApplicationCard';
import HammerheadApplicationCard from '@/components/HammerheadApplicationCard';
import KickListPanel from '@/components/KickListPanel';

export default function ExecApplicationsPage() {
  const [appTab, setAppTab] = useState<'member' | 'hammerhead'>('member');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [hhStatusFilter, setHhStatusFilter] = useState('pending');
  const { applications, loading, error, refresh, mutate } = useExecApplications(statusFilter);
  const { applications: hhApplications, loading: hhLoading, error: hhError, refresh: hhRefresh, mutate: hhMutate } = useExecHammerheadApplications(hhStatusFilter);
  const { user } = useExecSession();
  const kickList = useKickList();

  const handleVoteChange = (appId: number, newVote: string | null, newSummary: { accept: number; deny: number; abstain: number }) => {
    // Optimistically update the local data (votes array + userVote + voteSummary)
    mutate((current: any) => {
      if (!current) return current;
      return {
        applications: current.applications.map((app: any) => {
          if (app.id !== appId) return app;

          let updatedVotes = [...(app.votes || [])];

          if (newVote && user) {
            // Add or update the current user's vote
            const existingIdx = updatedVotes.findIndex(
              (v: any) => v.voter_discord_id === user.discord_id
            );
            const voteEntry = {
              voter_discord_id: user.discord_id,
              voter_username: user.ign,
              vote: newVote,
              source: 'website',
              voted_at: new Date().toISOString(),
            };
            if (existingIdx >= 0) {
              updatedVotes[existingIdx] = voteEntry;
            } else {
              updatedVotes.push(voteEntry);
            }
          } else if (!newVote && user) {
            // Remove the current user's vote
            updatedVotes = updatedVotes.filter(
              (v: any) => v.voter_discord_id !== user.discord_id
            );
          }

          return { ...app, userVote: newVote, voteSummary: newSummary, votes: updatedVotes };
        }),
      };
    }, false);
  };

  const handleDecision = (appId: number, status: string, reviewedAt: string, reviewedBy: string) => {
    mutate((current: any) => {
      if (!current) return current;
      return {
        applications: current.applications.map((app: any) => {
          if (app.id !== appId) return app;
          return { ...app, status, reviewedAt, reviewedBy };
        }),
      };
    }, false);
  };

  // Hammerhead vote/decision handlers
  const handleHhVoteChange = (appId: number, newVote: string | null, newSummary: { accept: number; deny: number; abstain: number }) => {
    hhMutate((current: any) => {
      if (!current) return current;
      return {
        applications: current.applications.map((app: any) => {
          if (app.id !== appId) return app;
          let updatedVotes = [...(app.votes || [])];
          if (newVote && user) {
            const existingIdx = updatedVotes.findIndex((v: any) => v.voter_discord_id === user.discord_id);
            const voteEntry = { voter_discord_id: user.discord_id, voter_username: user.ign, vote: newVote, source: 'website', voted_at: new Date().toISOString() };
            if (existingIdx >= 0) updatedVotes[existingIdx] = voteEntry;
            else updatedVotes.push(voteEntry);
          } else if (!newVote && user) {
            updatedVotes = updatedVotes.filter((v: any) => v.voter_discord_id !== user.discord_id);
          }
          return { ...app, userVote: newVote, voteSummary: newSummary, votes: updatedVotes };
        }),
      };
    }, false);
  };

  const handleHhDecision = (appId: number, status: string, reviewedAt: string, reviewedBy: string) => {
    hhMutate((current: any) => {
      if (!current) return current;
      return {
        applications: current.applications.map((app: any) => {
          if (app.id !== appId) return app;
          return { ...app, status, reviewedAt, reviewedBy };
        }),
      };
    }, false);
  };

  const filters = [
    { value: 'pending', label: 'Pending' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'denied', label: 'Denied' },
    { value: 'all', label: 'All' },
  ];

  return (
    <div>
      <h1 style={{
        fontSize: '1.75rem',
        fontWeight: '800',
        color: 'var(--text-primary)',
        marginBottom: '0.5rem',
      }}>
        Applications
      </h1>
      <p style={{
        color: 'var(--text-secondary)',
        fontSize: '0.85rem',
        marginBottom: '1.5rem',
      }}>
        Review and vote on applications. Use the decision panel at the bottom of each application to accept or deny.
      </p>

      {/* Top-level tab switcher */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.25rem',
      }}>
        {([
          { value: 'member' as const, label: 'Member Apps' },
          { value: 'hammerhead' as const, label: 'Hammerhead Apps' },
        ]).map(tab => (
          <button
            key={tab.value}
            onClick={() => setAppTab(tab.value)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid',
              borderColor: appTab === tab.value ? (tab.value === 'hammerhead' ? '#396aff' : 'var(--color-ocean-500)') : 'var(--border-card)',
              background: appTab === tab.value ? (tab.value === 'hammerhead' ? '#396aff' : 'var(--color-ocean-500)') : 'transparent',
              color: appTab === tab.value ? '#fff' : 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '700',
              outline: 'none',
              WebkitAppearance: 'none',
              transition: 'all 0.15s ease',
              fontFamily: 'inherit',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{
        display: 'flex',
        gap: '1.25rem',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}>
        {/* Left panel — Applications */}
        <div style={{ flex: '1 1 550px', minWidth: 0 }}>
          {appTab === 'member' ? (
            <>
              {/* Controls */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}>
                <div style={{ display: 'flex', gap: '0.375rem' }}>
                  {filters.map(f => (
                    <button
                      key={f.value}
                      onClick={() => setStatusFilter(f.value)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '0.375rem',
                        border: '1px solid',
                        borderColor: statusFilter === f.value ? 'var(--color-ocean-500)' : 'var(--border-card)',
                        background: statusFilter === f.value ? 'var(--color-ocean-500)' : 'transparent',
                        color: statusFilter === f.value ? '#fff' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        outline: 'none',
                        WebkitAppearance: 'none',
                        transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

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

              {/* Loading */}
              {loading && applications.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{
                      background: 'var(--bg-card)',
                      borderRadius: '0.75rem',
                      border: '1px solid var(--border-card)',
                      height: '80px',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                  ))}
                  <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
                </div>
              )}

              {/* Error */}
              {error && applications.length === 0 && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  color: '#ef4444',
                }}>
                  Failed to load applications: {error}
                </div>
              )}

              {/* Applications list */}
              {!loading && applications.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '3rem',
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-card)',
                  borderRadius: '0.75rem',
                  border: '1px solid var(--border-card)',
                }}>
                  No {statusFilter === 'all' ? '' : statusFilter} applications found.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {applications.map(app => (
                  <ApplicationCard
                    key={app.id}
                    app={app}
                    onVoteChange={handleVoteChange}
                    onDecision={handleDecision}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Hammerhead Controls */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}>
                <div style={{ display: 'flex', gap: '0.375rem' }}>
                  {filters.map(f => (
                    <button
                      key={f.value}
                      onClick={() => setHhStatusFilter(f.value)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '0.375rem',
                        border: '1px solid',
                        borderColor: hhStatusFilter === f.value ? '#396aff' : 'var(--border-card)',
                        background: hhStatusFilter === f.value ? '#396aff' : 'transparent',
                        color: hhStatusFilter === f.value ? '#fff' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        outline: 'none',
                        WebkitAppearance: 'none',
                        transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={hhRefresh}
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

              {/* Hammerhead Loading */}
              {hhLoading && hhApplications.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{
                      background: 'var(--bg-card)',
                      borderRadius: '0.75rem',
                      border: '1px solid var(--border-card)',
                      height: '80px',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                  ))}
                  <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
                </div>
              )}

              {/* Hammerhead Error */}
              {hhError && hhApplications.length === 0 && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  color: '#ef4444',
                }}>
                  Failed to load hammerhead applications: {hhError}
                </div>
              )}

              {/* Hammerhead list */}
              {!hhLoading && hhApplications.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '3rem',
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-card)',
                  borderRadius: '0.75rem',
                  border: '1px solid var(--border-card)',
                }}>
                  No {hhStatusFilter === 'all' ? '' : hhStatusFilter} hammerhead applications found.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {hhApplications.map(app => (
                  <HammerheadApplicationCard
                    key={app.id}
                    app={app}
                    onVoteChange={handleHhVoteChange}
                    onDecision={handleHhDecision}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right panel — Kick List */}
        <div style={{ flex: '0 0 320px', minWidth: '280px' }}>
          <KickListPanel
            entries={kickList.entries}
            lastUpdated={kickList.lastUpdated}
            lastUpdatedBy={kickList.lastUpdatedBy}
            loading={kickList.loading}
            memberCount={kickList.memberCount}
            pendingJoins={kickList.pendingJoins}
            onRemove={kickList.removeFromKickList}
            onChangeTier={kickList.changeTier}
          />
        </div>
      </div>
    </div>
  );
}
