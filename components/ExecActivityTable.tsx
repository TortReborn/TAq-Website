"use client";

import { useState, useMemo } from 'react';
import type { ExecMember } from '@/hooks/useExecActivity';

type SortKey = 'username' | 'discordRank' | 'playtime' | 'wars' | 'raids' | 'inactiveDays' | 'kickScore' | 'daysInGuild';

// 5h/week = 5/7 h/day; threshold for N days = N * 5/7
const WEEKLY_HOURS = 5;
function getThreshold(days: number): number {
  return days * WEEKLY_HOURS / 7;
}

function isBelowThreshold(member: { isNewMember: boolean; timeFrames: Record<string, { playtime: number; hasCompleteData: boolean }> }, timeFrame: string): boolean {
  if (member.isNewMember) return false;
  const tf = member.timeFrames[timeFrame];
  if (!tf?.hasCompleteData) return false;
  return tf.playtime < getThreshold(Number(timeFrame));
}
type SortDirection = 'asc' | 'desc';

const RANK_ORDER: Record<string, number> = {
  'Hydra': 1, 'Narwhal': 2, 'Dolphin': 3, 'Sailfish': 4,
  'Hammerhead': 5, 'Angler': 6, 'Barracuda': 7, 'Piranha': 8,
  'Manatee': 9, 'Starfish': 10,
};

const RANK_COLORS: Record<string, string> = {
  'Hydra': '#ac034c', 'Narwhal': '#eb2279', 'Dolphin': '#9d68ff',
  'Sailfish': '#396aff', 'Hammerhead': '#04b0eb', 'Angler': '#00e2db',
  'Barracuda': '#79e64a', 'Piranha': '#c8ff00', 'Manatee': '#ffe226',
  'Starfish': '#e8a41c',
};

interface Props {
  members: ExecMember[];
  timeFrame: string;
  searchTerm: string;
  sortMode: 'activity' | 'kick';
  onAddToKickList?: (uuid: string, ign: string, tier: number) => void;
  kickListUuids?: Set<string>;
}

const TIER_BUTTONS = [
  { tier: 1, label: 'T1', color: '#ef4444' },
  { tier: 2, label: 'T2', color: '#f59e0b' },
  { tier: 3, label: 'T3', color: '#3b82f6' },
];

export default function ExecActivityTable({ members, timeFrame, searchTerm, sortMode, onAddToKickList, kickListUuids }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>(sortMode === 'kick' ? 'kickScore' : 'playtime');
  const [sortDir, setSortDir] = useState<SortDirection>(sortMode === 'kick' ? 'asc' : 'desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'username' ? 'asc' : 'desc');
    }
  };

  const sortedMembers = useMemo(() => {
    let filtered = members;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = members.filter(m =>
        m.username.toLowerCase().includes(term) ||
        m.discordRank.toLowerCase().includes(term)
      );
    }

    return [...filtered].sort((a, b) => {
      if (sortMode === 'kick') {
        // Kick suitability: new members at bottom, then sort by threshold/rank/playtime
        const aBT = isBelowThreshold(a, timeFrame);
        const bBT = isBelowThreshold(b, timeFrame);
        if (a.isNewMember !== b.isNewMember) return a.isNewMember ? 1 : -1;
        if (aBT !== bBT) return aBT ? -1 : 1;
        if (a.kickRankScore !== b.kickRankScore) return a.kickRankScore - b.kickRankScore;
        return (a.timeFrames[timeFrame]?.playtime ?? 0) - (b.timeFrames[timeFrame]?.playtime ?? 0);
      }

      let valA: number | string = 0;
      let valB: number | string = 0;

      switch (sortKey) {
        case 'username':
          valA = a.username.toLowerCase();
          valB = b.username.toLowerCase();
          break;
        case 'discordRank':
          valA = RANK_ORDER[a.discordRank] ?? 999;
          valB = RANK_ORDER[b.discordRank] ?? 999;
          break;
        case 'playtime':
          valA = a.timeFrames[timeFrame]?.playtime ?? 0;
          valB = b.timeFrames[timeFrame]?.playtime ?? 0;
          break;
        case 'wars':
          valA = a.timeFrames[timeFrame]?.wars ?? 0;
          valB = b.timeFrames[timeFrame]?.wars ?? 0;
          break;
        case 'raids':
          valA = a.timeFrames[timeFrame]?.raids ?? 0;
          valB = b.timeFrames[timeFrame]?.raids ?? 0;
          break;
        case 'inactiveDays':
          valA = a.inactiveDays ?? 0;
          valB = b.inactiveDays ?? 0;
          break;
        case 'daysInGuild':
          valA = a.daysInGuild;
          valB = b.daysInGuild;
          break;
        case 'kickScore':
          valA = a.kickRankScore;
          valB = b.kickRankScore;
          break;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [members, searchTerm, sortKey, sortDir, timeFrame, sortMode]);

  const SortHeader = ({ label, sortKeyName, width }: { label: string; sortKeyName: SortKey; width?: string }) => (
    <th
      onClick={() => handleSort(sortKeyName)}
      style={{
        padding: '0.75rem 0.5rem',
        textAlign: 'left',
        fontSize: '0.75rem',
        fontWeight: '600',
        color: sortKey === sortKeyName ? 'var(--color-ocean-400)' : 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        cursor: 'pointer',
        userSelect: 'none',
        width: width || 'auto',
        whiteSpace: 'nowrap',
        borderBottom: '1px solid var(--border-card)',
      }}
    >
      {label} {sortKey === sortKeyName ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
    </th>
  );

  return (
    <div style={{
      overflowX: 'auto',
      borderRadius: '0.75rem',
      border: '1px solid var(--border-card)',
      background: 'var(--bg-card)',
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.85rem',
      }}>
        <thead>
          <tr>
            <SortHeader label="Player" sortKeyName="username" width="160px" />
            <SortHeader label="Rank" sortKeyName="discordRank" width="100px" />
            <SortHeader label={`Playtime (${timeFrame}d)`} sortKeyName="playtime" />
            <SortHeader label={`Wars (${timeFrame}d)`} sortKeyName="wars" />
            <SortHeader label={`Raids (${timeFrame}d)`} sortKeyName="raids" />
            <SortHeader label="Last Seen" sortKeyName="inactiveDays" />
            <SortHeader label="Member For" sortKeyName="daysInGuild" />
            <th style={{
              padding: '0.75rem 0.5rem',
              textAlign: 'left',
              fontSize: '0.75rem',
              fontWeight: '600',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              borderBottom: '1px solid var(--border-card)',
            }}>
              Status
            </th>
            {onAddToKickList && (
              <th style={{
                padding: '0.75rem 0.5rem',
                textAlign: 'center',
                fontSize: '0.75rem',
                fontWeight: '600',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid var(--border-card)',
              }}>
                Kick List
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {sortedMembers.map(member => {
            const tf = member.timeFrames[timeFrame];
            const rankColor = RANK_COLORS[member.discordRank] || 'var(--text-secondary)';
            const belowThreshold = isBelowThreshold(member, timeFrame);

            let rowBg = 'transparent';
            if (sortMode === 'kick' && !member.isNewMember) {
              rowBg = belowThreshold ? 'rgba(239, 68, 68, 0.08)' : 'rgba(59, 130, 246, 0.05)';
            }

            return (
              <tr key={member.uuid} style={{ background: rowBg }}>
                <td style={{
                  padding: '0.625rem 0.5rem',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {member.online && (
                      <div style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: '#22c55e', flexShrink: 0,
                      }} title={`Online: ${member.server || 'unknown'}`} />
                    )}
                    {member.username}
                  </div>
                </td>
                <td style={{
                  padding: '0.625rem 0.5rem',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{
                    color: rankColor,
                    fontWeight: '600',
                    fontSize: '0.8rem',
                  }}>
                    {member.discordRank || 'Unlinked'}
                  </span>
                </td>
                <td style={{
                  padding: '0.625rem 0.5rem',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  color: belowThreshold ? '#ef4444' : 'var(--text-primary)',
                  fontWeight: belowThreshold ? '600' : '400',
                }}>
                  {tf?.hasCompleteData ? `${tf.playtime.toFixed(1)}h` : '-'}
                </td>
                <td style={{
                  padding: '0.625rem 0.5rem',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  color: 'var(--text-primary)',
                }}>
                  {tf?.hasCompleteData ? tf.wars : '-'}
                </td>
                <td style={{
                  padding: '0.625rem 0.5rem',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  color: 'var(--text-primary)',
                }}>
                  {tf?.hasCompleteData ? tf.raids : '-'}
                </td>
                <td style={{
                  padding: '0.625rem 0.5rem',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  color: member.inactiveDays !== null && member.inactiveDays > 7 ? '#f59e0b' : 'var(--text-secondary)',
                }}>
                  {member.online
                    ? 'Now'
                    : member.inactiveDays !== null
                      ? `${member.inactiveDays}d ago`
                      : 'Unknown'
                  }
                </td>
                <td style={{
                  padding: '0.625rem 0.5rem',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  color: member.isNewMember ? '#a855f7' : 'var(--text-secondary)',
                  fontWeight: member.isNewMember ? '600' : '400',
                }}>
                  {member.daysInGuild}d
                </td>
                <td style={{
                  padding: '0.625rem 0.5rem',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}>
                  {member.isNewMember ? (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: '600',
                      padding: '0.15rem 0.4rem', borderRadius: '0.25rem',
                      background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7',
                    }}>NEW</span>
                  ) : belowThreshold ? (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: '600',
                      padding: '0.15rem 0.4rem', borderRadius: '0.25rem',
                      background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444',
                    }}>Danger</span>
                  ) : (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: '600',
                      padding: '0.15rem 0.4rem', borderRadius: '0.25rem',
                      background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e',
                    }}>Safe</span>
                  )}
                </td>
                {onAddToKickList && (
                  <td style={{
                    padding: '0.625rem 0.5rem',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    textAlign: 'center',
                  }}>
                    {kickListUuids?.has(member.uuid) ? (
                      <span style={{
                        fontSize: '0.7rem', fontWeight: '600',
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic',
                      }}>Added</span>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                        {TIER_BUTTONS.map(tb => (
                          <button
                            key={tb.tier}
                            onClick={() => onAddToKickList(member.uuid, member.username, tb.tier)}
                            title={`Add to Tier ${tb.tier}`}
                            style={{
                              padding: '0.2rem 0.4rem',
                              borderRadius: '0.25rem',
                              border: `1px solid ${tb.color}40`,
                              background: `${tb.color}15`,
                              color: tb.color,
                              cursor: 'pointer',
                              fontSize: '0.65rem',
                              fontWeight: '700',
                              lineHeight: 1,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = `${tb.color}30`; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = `${tb.color}15`; }}
                          >
                            {tb.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {sortedMembers.length === 0 && (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--text-secondary)',
        }}>
          No members found.
        </div>
      )}
    </div>
  );
}
