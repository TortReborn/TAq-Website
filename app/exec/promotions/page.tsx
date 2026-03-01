"use client";

import { useState, useMemo } from 'react';
import { useExecPromotions } from '@/hooks/useExecPromotions';
import { useExecSession } from '@/hooks/useExecSession';
import { RANK_HIERARCHY, RANK_ORDER, getRankColor } from '@/lib/rank-constants';

interface StagedAction {
  uuid: string;
  ign: string;
  currentRank: string;
  newRank: string | null;
  actionType: 'promote' | 'demote' | 'remove';
}

export default function ExecPromotionsPage() {
  const { user } = useExecSession();
  const {
    members, pendingQueue, recentHistory,
    loading, error, refresh,
    queueBulkPromotions, cancelQueueEntry,
  } = useExecPromotions();

  const [searchTerm, setSearchTerm] = useState('');
  const [rankFilter, setRankFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'promote' | 'demote' | 'remove'>('promote');
  const [bulkTargetRank, setBulkTargetRank] = useState('');
  const [stagedActions, setStagedActions] = useState<StagedAction[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const userRankIdx = user ? RANK_HIERARCHY.indexOf(user.rank) : -1;

  // Pending UUIDs for disabling already-queued members
  const pendingUuids = useMemo(() => new Set(pendingQueue.map(e => e.uuid)), [pendingQueue]);

  // Staged UUIDs for showing staged status
  const stagedUuids = useMemo(() => new Set(stagedActions.map(a => a.uuid)), [stagedActions]);

  // Only show members with a rank lower than the user's
  const managableMembers = useMemo(() => {
    if (userRankIdx <= 0) return [];
    return members.filter(m => {
      const idx = RANK_HIERARCHY.indexOf(m.rank);
      return idx !== -1 && idx < userRankIdx;
    });
  }, [members, userRankIdx]);

  // Filter and sort members
  const filteredMembers = useMemo(() => {
    let list = managableMembers;
    if (rankFilter) {
      list = list.filter(m => m.rank === rankFilter);
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      list = list.filter(m => m.ign.toLowerCase().includes(lower));
    }
    return [...list].sort((a, b) => {
      const ra = RANK_ORDER[a.rank] ?? 99;
      const rb = RANK_ORDER[b.rank] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.ign.localeCompare(b.ign);
    });
  }, [managableMembers, rankFilter, searchTerm]);

  // Unique ranks present in managable members for filter buttons
  const memberRanks = useMemo(() => {
    const ranks = new Set(managableMembers.map(m => m.rank).filter(Boolean));
    return RANK_HIERARCHY.filter(r => ranks.has(r));
  }, [managableMembers]);

  // Available target ranks for bulk action (capped below user's rank)
  const availableTargetRanks = useMemo(() => {
    if (bulkAction === 'remove') return [];
    const selectedMembers = managableMembers.filter(m => selected.has(m.uuid));
    if (selectedMembers.length === 0) return RANK_HIERARCHY.slice(0, userRankIdx);

    if (bulkAction === 'promote') {
      const maxIdx = Math.max(...selectedMembers.map(m => RANK_HIERARCHY.indexOf(m.rank)));
      return RANK_HIERARCHY.slice(maxIdx + 1, userRankIdx);
    } else {
      const minIdx = Math.min(...selectedMembers.map(m => RANK_HIERARCHY.indexOf(m.rank)));
      return RANK_HIERARCHY.slice(0, minIdx);
    }
  }, [bulkAction, selected, managableMembers, userRankIdx]);

  const toggleSelect = (uuid: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = filteredMembers.filter(m => !pendingUuids.has(m.uuid) && !stagedUuids.has(m.uuid));
    if (selected.size === selectable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable.map(m => m.uuid)));
    }
  };

  const stageAction = (action: StagedAction) => {
    setStagedActions(prev => {
      // Replace if same UUID already staged
      const filtered = prev.filter(a => a.uuid !== action.uuid);
      return [...filtered, action];
    });
  };

  const removeStagedAction = (uuid: string) => {
    setStagedActions(prev => prev.filter(a => a.uuid !== uuid));
  };

  const handleSingleStage = (uuid: string, ign: string, currentRank: string, newRank: string | null, actionType: 'promote' | 'demote' | 'remove') => {
    setActionError(null);
    stageAction({ uuid, ign, currentRank, newRank, actionType });
  };

  const handleBulkStage = () => {
    if (selected.size === 0) return;
    if (bulkAction !== 'remove' && !bulkTargetRank) {
      setActionError('Select a target rank');
      return;
    }
    setActionError(null);

    for (const uuid of selected) {
      const member = managableMembers.find(m => m.uuid === uuid);
      if (!member) continue;
      stageAction({
        uuid: member.uuid,
        ign: member.ign,
        currentRank: member.rank,
        newRank: bulkAction === 'remove' ? null : bulkTargetRank,
        actionType: bulkAction,
      });
    }
    setSelected(new Set());
  };

  const handleSubmitQueue = async () => {
    if (stagedActions.length === 0) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await queueBulkPromotions(stagedActions);
      setStagedActions([]);
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
    borderRadius: '0.375rem', padding: '0.5rem 0.75rem',
    color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
  };
  const btnStyle: React.CSSProperties = {
    padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: 'none',
    cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', transition: 'opacity 0.15s',
  };

  if (loading && members.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>Promotions</h1>
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', height: '400px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && members.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>Promotions</h1>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '1rem', color: '#ef4444' }}>
          Failed to load data: {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>Promotions</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            Manage rank promotions, demotions, and role removal
          </p>
        </div>
        <button onClick={refresh} style={{ ...btnStyle, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>
          Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* Left panel: Member roster */}
        <div style={{ flex: '1 1 550px', minWidth: 0 }}>
          {/* Controls */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <button
                onClick={() => setRankFilter(null)}
                style={{ ...btnStyle, background: !rankFilter ? 'var(--color-ocean-400)' : 'var(--bg-primary)', color: !rankFilter ? '#fff' : 'var(--text-secondary)' }}
              >
                All
              </button>
              {memberRanks.map(rank => (
                <button
                  key={rank}
                  onClick={() => setRankFilter(rankFilter === rank ? null : rank)}
                  style={{
                    ...btnStyle,
                    background: rankFilter === rank ? getRankColor(rank) : 'var(--bg-primary)',
                    color: rankFilter === rank ? '#fff' : getRankColor(rank),
                    border: `1px solid ${rankFilter === rank ? 'transparent' : getRankColor(rank)}40`,
                  }}
                >
                  {rank}
                </button>
              ))}
            </div>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
              placeholder="Search by IGN..."
            />
          </div>

          {/* Member table */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                  <th style={{ padding: '0.5rem 0.75rem', width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === filteredMembers.filter(m => !pendingUuids.has(m.uuid) && !stagedUuids.has(m.uuid)).length}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  {['Player', 'Rank', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No members match filters</td></tr>
                )}
                {filteredMembers.map(member => {
                  const isPending = pendingUuids.has(member.uuid);
                  const isStaged = stagedUuids.has(member.uuid);
                  const currentIdx = RANK_HIERARCHY.indexOf(member.rank);
                  const maxPromoteIdx = userRankIdx - 1; // can't promote to own rank
                  return (
                    <tr key={member.uuid} style={{ borderBottom: '1px solid var(--border-card)', opacity: isPending ? 0.4 : 1 }}>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        <input
                          type="checkbox"
                          checked={selected.has(member.uuid)}
                          onChange={() => toggleSelect(member.uuid)}
                          disabled={isPending || isStaged}
                          style={{ cursor: isPending || isStaged ? 'not-allowed' : 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                        {member.ign}
                        {isPending && <span style={{ fontSize: '0.7rem', color: '#f59e0b', marginLeft: '0.5rem' }}>Queued</span>}
                        {isStaged && <span style={{ fontSize: '0.7rem', color: 'var(--color-ocean-400)', marginLeft: '0.5rem' }}>Staged</span>}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: getRankColor(member.rank), fontWeight: '600' }}>
                        {member.rank || '\u2014'}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        {!isPending && !isStaged && member.rank && (
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            {currentIdx < maxPromoteIdx && (
                              <button
                                onClick={() => handleSingleStage(member.uuid, member.ign, member.rank, RANK_HIERARCHY[currentIdx + 1], 'promote')}
                                title={`Promote to ${RANK_HIERARCHY[currentIdx + 1]}`}
                                style={{ ...btnStyle, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                              >
                                Promote
                              </button>
                            )}
                            {currentIdx > 0 && (
                              <button
                                onClick={() => handleSingleStage(member.uuid, member.ign, member.rank, RANK_HIERARCHY[currentIdx - 1], 'demote')}
                                title={`Demote to ${RANK_HIERARCHY[currentIdx - 1]}`}
                                style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                              >
                                Demote
                              </button>
                            )}
                            <button
                              onClick={() => handleSingleStage(member.uuid, member.ign, member.rank, null, 'remove')}
                              title="Remove role"
                              style={{ ...btnStyle, background: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div style={{
              background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--color-ocean-400)',
              padding: '1rem', marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '600' }}>
                {selected.size} selected
              </span>
              <select
                value={bulkAction}
                onChange={e => { setBulkAction(e.target.value as any); setBulkTargetRank(''); }}
                style={{ ...inputStyle, width: 'auto' }}
              >
                <option value="promote">Promote to</option>
                <option value="demote">Demote to</option>
                <option value="remove">Remove Role</option>
              </select>
              {bulkAction !== 'remove' && (
                <select
                  value={bulkTargetRank}
                  onChange={e => setBulkTargetRank(e.target.value)}
                  style={{ ...inputStyle, width: 'auto' }}
                >
                  <option value="">Select rank...</option>
                  {availableTargetRanks.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              )}
              <button onClick={handleBulkStage} style={{ ...btnStyle, background: 'var(--color-ocean-400)', color: '#fff' }}>
                Stage {selected.size} Actions
              </button>
              <button onClick={() => setSelected(new Set())} style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                Clear
              </button>
            </div>
          )}

          {actionError && (
            <div style={{ marginTop: '0.75rem', color: '#ef4444', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 0.75rem', borderRadius: '0.375rem' }}>
              {actionError}
            </div>
          )}
        </div>

        {/* Right panel: Queue sidebar */}
        <div style={{ flex: '0 0 320px' }}>
          {/* Staged actions (local, not yet submitted) */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1.25rem', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 0.75rem' }}>
              Staged Actions
              {stagedActions.length > 0 && (
                <span style={{
                  fontSize: '0.75rem', fontWeight: '600', background: 'var(--color-ocean-400)', color: '#fff',
                  padding: '0.1rem 0.4rem', borderRadius: '0.25rem', marginLeft: '0.5rem',
                }}>
                  {stagedActions.length}
                </span>
              )}
            </h2>

            {stagedActions.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>
                No staged actions. Use the buttons on the left to stage promotions, demotions, or removals.
              </p>
            ) : (
              <>
                {stagedActions.map(action => (
                  <div key={action.uuid} style={{
                    padding: '0.625rem', borderRadius: '0.5rem', background: 'var(--bg-primary)',
                    marginBottom: '0.5rem', fontSize: '0.85rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{action.ign}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
                          {action.actionType === 'remove' ? (
                            <span><span style={{ color: getRankColor(action.currentRank) }}>{action.currentRank}</span> {'\u2192'} Remove</span>
                          ) : (
                            <span>
                              <span style={{ color: getRankColor(action.currentRank) }}>{action.currentRank}</span>
                              {' \u2192 '}
                              <span style={{ color: getRankColor(action.newRank!) }}>{action.newRank}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removeStagedAction(action.uuid)}
                        style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button
                    onClick={handleSubmitQueue}
                    disabled={submitting}
                    style={{
                      ...btnStyle, flex: 1,
                      background: submitting ? '#6b7280' : '#22c55e', color: '#fff',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {submitting ? 'Submitting...' : `Submit ${stagedActions.length} to Queue`}
                  </button>
                  <button
                    onClick={() => setStagedActions([])}
                    disabled={submitting}
                    style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                  >
                    Clear All
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Pending queue (already submitted, waiting for bot) */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1.25rem', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 0.75rem' }}>
              Pending Queue
              {pendingQueue.length > 0 && (
                <span style={{
                  fontSize: '0.75rem', fontWeight: '600', background: '#f59e0b', color: '#fff',
                  padding: '0.1rem 0.4rem', borderRadius: '0.25rem', marginLeft: '0.5rem',
                }}>
                  {pendingQueue.length}
                </span>
              )}
            </h2>

            {pendingQueue.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>No pending actions</p>
            ) : (
              pendingQueue.map(entry => (
                <div key={entry.id} style={{
                  padding: '0.625rem', borderRadius: '0.5rem', background: 'var(--bg-primary)',
                  marginBottom: '0.5rem', fontSize: '0.85rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{entry.ign}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
                        {entry.actionType === 'remove' ? (
                          <span><span style={{ color: getRankColor(entry.currentRank) }}>{entry.currentRank}</span> {'\u2192'} Remove</span>
                        ) : (
                          <span>
                            <span style={{ color: getRankColor(entry.currentRank) }}>{entry.currentRank}</span>
                            {' \u2192 '}
                            <span style={{ color: getRankColor(entry.newRank!) }}>{entry.newRank}</span>
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
                        by {entry.queuedByIgn}
                      </div>
                    </div>
                    <button
                      onClick={() => cancelQueueEntry(entry.id)}
                      style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* History */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1.25rem' }}>
            <div
              onClick={() => setShowHistory(!showHistory)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Recent History
                <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                  ({recentHistory.length})
                </span>
              </h2>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{showHistory ? '\u25B2' : '\u25BC'}</span>
            </div>

            {showHistory && (
              <div style={{ marginTop: '0.75rem' }}>
                {recentHistory.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>No recent history</p>
                ) : (
                  recentHistory.map(entry => (
                    <div key={entry.id} style={{
                      padding: '0.5rem', borderRadius: '0.375rem', background: 'var(--bg-primary)',
                      marginBottom: '0.375rem', fontSize: '0.8rem',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{entry.ign}</span>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: '600',
                          color: entry.status === 'completed' ? '#22c55e' : '#ef4444',
                        }}>
                          {entry.status === 'completed' ? 'Done' : 'Failed'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {entry.actionType === 'remove' ? 'Removed' : `${entry.currentRank} \u2192 ${entry.newRank}`}
                        {entry.errorMessage && <span style={{ color: '#ef4444' }}> — {entry.errorMessage}</span>}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        {entry.completedAt ? new Date(entry.completedAt).toLocaleString() : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
