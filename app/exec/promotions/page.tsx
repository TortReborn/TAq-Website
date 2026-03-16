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
  discordId: string | null;
}

export default function ExecPromotionsPage() {
  const { user } = useExecSession();
  const {
    members, pendingQueue, recentHistory, promoSuggestions,
    loading, error, refresh,
    queueBulkPromotions, cancelQueueEntry,
    suggestPromotion, removeSuggestion,
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
  const [sortCol, setSortCol] = useState<'ign' | 'rank' | 'playtime' | 'wars' | 'raids' | 'memberFor'>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const userRankIdx = user ? RANK_HIERARCHY.indexOf(user.rank) : -1;

  // Pending UUIDs for disabling already-queued members
  const pendingUuids = useMemo(() => new Set(pendingQueue.map(e => e.uuid)), [pendingQueue]);

  // Staged UUIDs for showing staged status
  const stagedUuids = useMemo(() => new Set(stagedActions.map(a => a.uuid)), [stagedActions]);

  // Suggested UUIDs for showing suggested status
  const suggestedUuids = useMemo(() => new Set(promoSuggestions.map(s => s.uuid)), [promoSuggestions]);

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
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case 'ign': cmp = a.ign.localeCompare(b.ign); break;
        case 'rank': cmp = (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99); break;
        case 'playtime': cmp = a.playtime7d - b.playtime7d; break;
        case 'wars': cmp = a.wars7d - b.wars7d; break;
        case 'raids': cmp = a.raids7d - b.raids7d; break;
        case 'memberFor': {
          const aTime = a.joined ? new Date(a.joined).getTime() : Infinity;
          const bTime = b.joined ? new Date(b.joined).getTime() : Infinity;
          cmp = aTime - bTime; // earlier join = longer member
          break;
        }
      }
      if (cmp !== 0) return cmp * dir;
      return a.ign.localeCompare(b.ign);
    });
  }, [managableMembers, rankFilter, searchTerm, sortCol, sortDir]);

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir(col === 'ign' ? 'asc' : 'desc');
    }
  };

  const sortArrow = (col: typeof sortCol) => sortCol === col ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';

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

  const handleSingleStage = (uuid: string, ign: string, currentRank: string, newRank: string | null, actionType: 'promote' | 'demote' | 'remove', discordId: string | null = null) => {
    setActionError(null);
    stageAction({ uuid, ign, currentRank, newRank, actionType, discordId });
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
        discordId: member.discordId,
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

  const handleStageAll = () => {
    setActionError(null);
    for (const suggestion of promoSuggestions) {
      if (stagedUuids.has(suggestion.uuid) || pendingUuids.has(suggestion.uuid)) continue;
      const nextRankIdx = RANK_HIERARCHY.indexOf(suggestion.currentRank) + 1;
      if (nextRankIdx >= RANK_HIERARCHY.length) continue;
      const nextRank = RANK_HIERARCHY[nextRankIdx];
      stageAction({
        uuid: suggestion.uuid,
        ign: suggestion.ign,
        currentRank: suggestion.currentRank,
        newRank: nextRank,
        actionType: 'promote',
        discordId: suggestion.discordId,
      });
    }
  };

  const generatePromotionList = (): string => {
    // Only include promote actions for the list
    const promotes = stagedActions.filter(a => a.actionType === 'promote' && a.newRank);

    // Group by transition (currentRank -> newRank)
    const groups: Record<string, StagedAction[]> = {};
    for (const action of promotes) {
      const key = `${action.currentRank} -> ${action.newRank}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(action);
    }

    // Sort groups by rank hierarchy (lowest transition first)
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const aIdx = RANK_HIERARCHY.indexOf(a.split(' -> ')[0]);
      const bIdx = RANK_HIERARCHY.indexOf(b.split(' -> ')[0]);
      return aIdx - bIdx;
    });

    const lines: string[] = [];
    for (const key of sortedKeys) {
      lines.push(`**${key}**`);
      for (const action of groups[key]) {
        if (action.discordId) {
          lines.push(`<@${action.discordId}>`);
        } else {
          lines.push(action.ign);
        }
      }
    }

    return lines.join('\n');
  };

  const formatDuration = (joinedDate: string) => {
    const now = new Date();
    const joined = new Date(joinedDate);
    const diffMs = now.getTime() - joined.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days < 1) return '<1d';
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    const remainDays = days % 30;
    if (months < 12) return remainDays > 0 ? `${months}mo ${remainDays}d` : `${months}mo`;
    const years = Math.floor(months / 12);
    const remainMonths = months % 12;
    return remainMonths > 0 ? `${years}y ${remainMonths}mo` : `${years}y`;
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
    borderRadius: '0.32rem', padding: '0.425rem 0.64rem',
    color: 'var(--text-primary)', fontSize: '0.74rem', outline: 'none',
  };
  const btnStyle: React.CSSProperties = {
    padding: '0.32rem 0.64rem', borderRadius: '0.32rem', border: 'none',
    cursor: 'pointer', fontSize: '0.68rem', fontWeight: '600', transition: 'opacity 0.15s',
  };

  if (loading && members.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '1.7rem' }}>Promotions</h1>
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.64rem', border: '1px solid var(--border-card)', height: '340px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && members.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '1.7rem' }}>Promotions</h1>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.425rem', padding: '0.85rem', color: '#ef4444' }}>
          Failed to load data: {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.28rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>Promotions</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', margin: '0.21rem 0 0' }}>
            Manage rank promotions, demotions, and role removal
          </p>
        </div>
        <button onClick={refresh} style={{ ...btnStyle, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>
          Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', height: 'calc(100vh - 11.9rem)', minHeight: '425px' }}>
        {/* Column 1: Member roster */}
        <div style={{ flex: '5 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Controls */}
          <div style={{ background: 'var(--bg-card-solid)', borderRadius: '0.64rem', border: '1px solid var(--border-card)', padding: '0.85rem', marginBottom: '0.64rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '0.425rem', flexWrap: 'wrap', marginBottom: '0.64rem' }}>
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

            {/* Bulk action bar */}
            {selected.size > 0 && (
              <div style={{
                borderTop: '1px solid var(--border-card)',
                paddingTop: '0.64rem', marginTop: '0.64rem', display: 'flex', alignItems: 'center', gap: '0.64rem', flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: '600' }}>
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
          </div>

          {/* Member table (scrollable) */}
          <style>{`.promo-row:hover { background: rgba(255, 255, 255, 0.06) !important; }`}</style>
          <div style={{ background: 'var(--bg-card-solid)', borderRadius: '0.64rem', border: '1px solid var(--border-card)', overflow: 'hidden', flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="themed-scrollbar" style={{ overflowY: 'auto', flex: '1 1 auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-card-solid)' }}>
                  <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                    <th style={{ padding: '0.425rem 0.64rem', width: '34px' }}>
                      <input
                        type="checkbox"
                        checked={selected.size > 0 && selected.size === filteredMembers.filter(m => !pendingUuids.has(m.uuid) && !stagedUuids.has(m.uuid)).length}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th style={{ padding: '0.425rem 0.64rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', width: '1%', whiteSpace: 'nowrap' }}>Actions</th>
                    {([
                      { key: 'ign' as const, label: 'Player' },
                      { key: 'rank' as const, label: 'Rank' },
                      { key: 'playtime' as const, label: 'Playtime (7d)' },
                      { key: 'wars' as const, label: 'Wars (7d)' },
                      { key: 'raids' as const, label: 'Raids (7d)' },
                      { key: 'memberFor' as const, label: 'Member For' },
                    ]).map(col => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        style={{
                          padding: '0.425rem 0.64rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: '600',
                          color: sortCol === col.key ? 'var(--color-ocean-400)' : 'var(--text-secondary)',
                          textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                        }}
                      >
                        {col.label}{sortArrow(col.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: '1.7rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No members match filters</td></tr>
                  )}
                  {filteredMembers.map((member, idx) => {
                    const isPending = pendingUuids.has(member.uuid);
                    const isStaged = stagedUuids.has(member.uuid);
                    const isSuggested = suggestedUuids.has(member.uuid);
                    const currentIdx = RANK_HIERARCHY.indexOf(member.rank);
                    const maxPromoteIdx = userRankIdx - 1;
                    const isOdd = idx % 2 === 1;
                    return (
                      <tr key={member.uuid} className="promo-row" style={{
                        borderBottom: '1px solid var(--border-card)',
                        opacity: isPending ? 0.4 : 1,
                        background: isOdd ? 'rgba(255, 255, 255, 0.025)' : 'transparent',
                        transition: 'background 0.1s',
                      }}>
                        <td style={{ padding: '0.425rem 0.64rem' }}>
                          <input
                            type="checkbox"
                            checked={selected.has(member.uuid)}
                            onChange={() => toggleSelect(member.uuid)}
                            disabled={isPending || isStaged}
                            style={{ cursor: isPending || isStaged ? 'not-allowed' : 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '0.425rem 0.64rem', whiteSpace: 'nowrap' }}>
                          {!isPending && !isStaged && member.rank && (
                            <div style={{ display: 'flex', gap: '0.21rem' }}>
                              {currentIdx < maxPromoteIdx && (
                                <button
                                  onClick={() => handleSingleStage(member.uuid, member.ign, member.rank, RANK_HIERARCHY[currentIdx + 1], 'promote', member.discordId)}
                                  title={`Promote to ${RANK_HIERARCHY[currentIdx + 1]}`}
                                  style={{ ...btnStyle, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '0.17rem 0.34rem', fontSize: '0.6rem' }}
                                >
                                  Promote
                                </button>
                              )}
                              {currentIdx > 0 && (
                                <button
                                  onClick={() => handleSingleStage(member.uuid, member.ign, member.rank, RANK_HIERARCHY[currentIdx - 1], 'demote', member.discordId)}
                                  title={`Demote to ${RANK_HIERARCHY[currentIdx - 1]}`}
                                  style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.17rem 0.34rem', fontSize: '0.6rem' }}
                                >
                                  Demote
                                </button>
                              )}
                              <button
                                onClick={() => handleSingleStage(member.uuid, member.ign, member.rank, null, 'remove', member.discordId)}
                                title="Remove role"
                                style={{ ...btnStyle, background: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', padding: '0.17rem 0.34rem', fontSize: '0.6rem' }}
                              >
                                Remove
                              </button>
                              {!isSuggested && (
                                <button
                                  onClick={() => suggestPromotion(member.uuid, member.ign, member.rank)}
                                  title="Add to promo list"
                                  style={{ ...btnStyle, background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', padding: '0.17rem 0.34rem', fontSize: '0.6rem' }}
                                >
                                  Suggest
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.425rem 0.64rem', fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                          {member.ign}
                          {isPending && <span style={{ fontSize: '0.6rem', color: '#f59e0b', marginLeft: '0.425rem' }}>Queued</span>}
                          {isStaged && <span style={{ fontSize: '0.6rem', color: 'var(--color-ocean-400)', marginLeft: '0.425rem' }}>Staged</span>}
                          {isSuggested && <span style={{ fontSize: '0.6rem', color: '#a855f7', marginLeft: '0.425rem' }}>Suggested</span>}
                        </td>
                        <td style={{ padding: '0.425rem 0.64rem', fontSize: '0.68rem', color: getRankColor(member.rank), fontWeight: '600' }}>
                          {member.rank || '\u2014'}
                        </td>
                        <td style={{ padding: '0.425rem 0.64rem', fontSize: '0.68rem', color: member.hasStats ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {member.hasStats ? `${member.playtime7d.toFixed(1)}h` : '\u2014'}
                        </td>
                        <td style={{ padding: '0.425rem 0.64rem', fontSize: '0.68rem', color: member.hasStats ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {member.hasStats ? member.wars7d : '\u2014'}
                        </td>
                        <td style={{ padding: '0.425rem 0.64rem', fontSize: '0.68rem', color: member.hasStats ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {member.hasStats ? member.raids7d : '\u2014'}
                        </td>
                        <td style={{ padding: '0.425rem 0.64rem', fontSize: '0.68rem', color: member.joined ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {member.joined ? formatDuration(member.joined) : '\u2014'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {actionError && (
            <div style={{ marginTop: '0.64rem', color: '#ef4444', fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.425rem 0.64rem', borderRadius: '0.32rem', flexShrink: 0 }}>
              {actionError}
            </div>
          )}
        </div>

        {/* Column 2: Promo List */}
        <div style={{ flex: '1.5 1 0', minWidth: '170px', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '0.64rem', border: '1px solid var(--border-card)', padding: '0.85rem', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.64rem', flexShrink: 0 }}>
              <h2 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Promo List
                {promoSuggestions.length > 0 && (
                  <span style={{
                    fontSize: '0.64rem', fontWeight: '600', background: '#a855f7', color: '#fff',
                    padding: '0.085rem 0.34rem', borderRadius: '0.21rem', marginLeft: '0.425rem',
                  }}>
                    {promoSuggestions.length}
                  </span>
                )}
              </h2>
              {promoSuggestions.length > 0 && (
                <button
                  onClick={handleStageAll}
                  style={{ ...btnStyle, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '0.21rem 0.425rem', fontSize: '0.6rem' }}
                >
                  Stage All
                </button>
              )}
            </div>

            <div className="themed-scrollbar" style={{ overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
              {promoSuggestions.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontStyle: 'italic', margin: 0 }}>
                  No suggestions yet. Use the Suggest button on members to add them here.
                </p>
              ) : (
                promoSuggestions.map(suggestion => {
                  const nextRankIdx = RANK_HIERARCHY.indexOf(suggestion.currentRank) + 1;
                  const nextRank = nextRankIdx < RANK_HIERARCHY.length ? RANK_HIERARCHY[nextRankIdx] : null;
                  return (
                  <div key={suggestion.id} style={{
                    padding: '0.53rem', borderRadius: '0.425rem', background: 'var(--bg-primary)',
                    marginBottom: '0.425rem', fontSize: '0.72rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{suggestion.ign}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: '600', marginTop: '0.1rem' }}>
                          <span style={{ color: getRankColor(suggestion.currentRank) }}>{suggestion.currentRank}</span>
                          {nextRank && (
                            <>
                              {' \u2192 '}
                              <span style={{ color: getRankColor(nextRank) }}>{nextRank}</span>
                            </>
                          )}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                          suggested by {suggestion.suggestedByIgn}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.21rem' }}>
                        {nextRank && !stagedUuids.has(suggestion.uuid) && !pendingUuids.has(suggestion.uuid) && (
                          <button
                            onClick={() => handleSingleStage(suggestion.uuid, suggestion.ign, suggestion.currentRank, nextRank, 'promote', suggestion.discordId)}
                            style={{ ...btnStyle, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '0.17rem 0.34rem', fontSize: '0.6rem' }}
                          >
                            Stage
                          </button>
                        )}
                        <button
                          onClick={() => removeSuggestion(suggestion.id)}
                          style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.17rem 0.34rem', fontSize: '0.6rem' }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Column 3: Staged Actions + Pending Queue + History */}
        <div style={{ flex: '1.5 1 0', minWidth: '170px', display: 'flex', flexDirection: 'column', height: '100%', gap: '0.64rem' }}>
          {/* Staged Actions */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '0.64rem', border: '1px solid var(--border-card)', padding: '0.85rem', display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.64rem', flexShrink: 0 }}>
              <h2 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Staged Actions
                {stagedActions.length > 0 && (
                  <span style={{
                    fontSize: '0.64rem', fontWeight: '600', background: 'var(--color-ocean-400)', color: '#fff',
                    padding: '0.085rem 0.34rem', borderRadius: '0.21rem', marginLeft: '0.425rem',
                  }}>
                    {stagedActions.length}
                  </span>
                )}
              </h2>
            </div>

            <div className="themed-scrollbar" style={{ overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
              {stagedActions.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontStyle: 'italic', margin: 0 }}>
                  No staged actions. Use the buttons on the left to stage promotions, demotions, or removals.
                </p>
              ) : (
                stagedActions.map(action => (
                  <div key={action.uuid} style={{
                    padding: '0.53rem', borderRadius: '0.425rem', background: 'var(--bg-primary)',
                    marginBottom: '0.425rem', fontSize: '0.72rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{action.ign}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
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
                        style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.17rem 0.34rem', fontSize: '0.6rem' }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {stagedActions.length > 0 && (
              <div style={{ display: 'flex', gap: '0.425rem', marginTop: '0.64rem', flexShrink: 0, flexWrap: 'wrap' }}>
                <button
                  onClick={handleSubmitQueue}
                  disabled={submitting}
                  style={{
                    ...btnStyle, flex: '1 1 auto',
                    background: submitting ? '#6b7280' : '#22c55e', color: '#fff',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Submitting...' : `Submit ${stagedActions.length}`}
                </button>
                <button
                  onClick={() => { setCopied(false); setShowGenerateModal(true); }}
                  style={{ ...btnStyle, background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}
                  title="Generate Discord promotion list"
                >
                  Generate
                </button>
                <button
                  onClick={() => setStagedActions([])}
                  disabled={submitting}
                  style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Pending queue */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '0.64rem', border: '1px solid var(--border-card)', padding: '0.85rem', display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
            <h2 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 0.64rem', flexShrink: 0 }}>
              Pending Queue
              {pendingQueue.length > 0 && (
                <span style={{
                  fontSize: '0.64rem', fontWeight: '600', background: '#f59e0b', color: '#fff',
                  padding: '0.085rem 0.34rem', borderRadius: '0.21rem', marginLeft: '0.425rem',
                }}>
                  {pendingQueue.length}
                </span>
              )}
            </h2>

            <div className="themed-scrollbar" style={{ overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
              {pendingQueue.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontStyle: 'italic', margin: 0 }}>No pending actions</p>
              ) : (
                pendingQueue.map(entry => (
                  <div key={entry.id} style={{
                    padding: '0.53rem', borderRadius: '0.425rem', background: 'var(--bg-primary)',
                    marginBottom: '0.425rem', fontSize: '0.72rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{entry.ign}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
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
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                          by {entry.queuedByIgn}
                        </div>
                      </div>
                      <button
                        onClick={() => cancelQueueEntry(entry.id)}
                        style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.17rem 0.34rem', fontSize: '0.6rem' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* History (collapsible, shares column with queue) */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '0.64rem', border: '1px solid var(--border-card)', padding: '0.85rem', flexShrink: 0, maxHeight: showHistory ? '50%' : 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div
              onClick={() => setShowHistory(!showHistory)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}
            >
              <h2 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Recent History
                <span style={{ fontSize: '0.68rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.425rem' }}>
                  ({recentHistory.length})
                </span>
              </h2>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.68rem' }}>{showHistory ? '\u25B2' : '\u25BC'}</span>
            </div>

            {showHistory && (
              <div className="themed-scrollbar" style={{ marginTop: '0.64rem', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
                {recentHistory.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontStyle: 'italic', margin: 0 }}>No recent history</p>
                ) : (
                  recentHistory.map(entry => (
                    <div key={entry.id} style={{
                      padding: '0.425rem', borderRadius: '0.32rem', background: 'var(--bg-primary)',
                      marginBottom: '0.32rem', fontSize: '0.68rem',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{entry.ign}</span>
                        <span style={{
                          fontSize: '0.6rem', fontWeight: '600',
                          color: entry.status === 'completed' ? '#22c55e' : '#ef4444',
                        }}>
                          {entry.status === 'completed' ? 'Done' : 'Failed'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-secondary)' }}>
                        {entry.actionType === 'remove' ? 'Removed' : `${entry.currentRank} \u2192 ${entry.newRank}`}
                        {entry.errorMessage && <span style={{ color: '#ef4444' }}> — {entry.errorMessage}</span>}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
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

      {/* Generate List Modal */}
      {showGenerateModal && (
        <div
          onClick={() => setShowGenerateModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#1a1a2e', borderRadius: '0.64rem', border: '1px solid var(--border-card)',
              padding: '1.28rem', width: '425px', maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            }}
          >
            <h2 style={{ fontSize: '0.94rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 0.64rem' }}>
              Promotion Wave List
            </h2>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', margin: '0 0 0.64rem' }}>
              Copy the text below and paste it directly into Discord.
            </p>
            <textarea
              readOnly
              value={generatePromotionList()}
              style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
                borderRadius: '0.425rem', padding: '0.64rem', color: 'var(--text-primary)',
                fontSize: '0.72rem', fontFamily: 'monospace', resize: 'vertical',
                minHeight: '170px', flex: 1, outline: 'none',
              }}
              onFocus={e => e.target.select()}
            />
            <div style={{ display: 'flex', gap: '0.425rem', marginTop: '0.64rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatePromotionList());
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                style={{ ...btnStyle, background: copied ? '#22c55e' : 'var(--color-ocean-400)', color: '#fff' }}
              >
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
              <button
                onClick={() => setShowGenerateModal(false)}
                style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
