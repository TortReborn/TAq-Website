"use client";

import { useState, useMemo, useEffect } from 'react';

interface Member {
  username: string;
  uuid: string;
  online?: boolean;
  server?: string | null;
  contributed: number;
  guildRank?: number;
  contributionRank?: number;
  joined?: string;
  discordRank: string;
  discordId?: string;
  discordUsername?: string;
  guildRankName: string;
  wars: number;
  raids: number;
  shells: number;
  lastJoin: string | null;
  playtime: number;
  // Time frame specific values
  timeFrameWars?: number;
  timeFrameRaids?: number;
  timeFrameShells?: number;
  timeFrameContributed?: number;
  timeFramePlaytime?: number;
  hasCompleteData?: boolean;
}

interface LeaderboardTableProps {
  members: Member[];
  onRefresh?: () => void;
  timeFrame: string;
  onTimeFrameChange: (timeFrame: string) => void;
}

type SortableColumn = 'username' | 'discordRank' | 'wars' | 'raids' | 'shells' | 'contributed' | 'playtime';
type SortDirection = 'asc' | 'desc';

export default function LeaderboardTable({ members, onRefresh, timeFrame, onTimeFrameChange }: LeaderboardTableProps) {
  const [sortColumn, setSortColumn] = useState<SortableColumn>('raids');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Load saved sort preferences from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && !initialized) {
      const savedSortColumn = localStorage.getItem('leaderboardSortColumn') as SortableColumn;
      const savedSortDirection = localStorage.getItem('leaderboardSortDirection') as SortDirection;

      if (savedSortColumn) {
        setSortColumn(savedSortColumn);
      }
      if (savedSortDirection) {
        setSortDirection(savedSortDirection);
      }

      setInitialized(true);
    }
  }, [initialized]);

  const timeFrames = [
    { value: '1', label: '24 Hours' },
    { value: '7', label: '7 Days' },
    { value: '14', label: '14 Days' },
    { value: '30', label: '30 Days' },
    { value: 'all', label: 'All Time' }
  ];

  const formatPlaytime = (minutes: number) => {
    const roundedMinutes = Math.round(minutes);
    const hours = Math.floor(roundedMinutes / 60);
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    const remainingMinutes = roundedMinutes % 60;

    if (days > 0) {
      return `${days}d ${remainingHours}h`;
    } else if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    } else {
      return `${remainingMinutes}m`;
    }
  };

  const formatValue = (value: number, column: SortableColumn) => {
    if (column === 'playtime') {
      return formatPlaytime(value);
    }
    if (column === 'contributed') {
      return value.toLocaleString() + ' XP';
    }
    return value.toLocaleString();
  };

  // Get the value based on time frame
  const getValue = (member: Member, column: SortableColumn): number | string => {
    if (column === 'username') return member.username;
    if (column === 'discordRank') {
      // Sort by rank priority
      const rankPriority: Record<string, number> = {
        'Hydra': 1,
        'Narwhal': 2,
        'Dolphin': 3,
        'Sailfish': 4,
        'Hammerhead': 5,
        'Angler': 6,
        'Barracuda': 7,
        'Piranha': 8,
        'Manatee': 9,
        'Starfish': 10
      };
      return rankPriority[member.discordRank] || 999;
    }

    // For numeric columns
    if (timeFrame === 'all') {
      return member[column] || 0;
    }

    switch (column) {
      case 'wars': return member.timeFrameWars || 0;
      case 'raids': return member.timeFrameRaids || 0;
      case 'shells': return member.timeFrameShells || 0;
      case 'contributed': return member.timeFrameContributed || 0;
      case 'playtime': return member.timeFramePlaytime || 0;
      default: return 0;
    }
  };

  const handleSort = (column: SortableColumn) => {
    let newDirection: SortDirection;

    if (sortColumn === column) {
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // For username, default to 'asc' (alphabetical)
      // For all other columns including discordRank, default to 'desc' (highest/best first)
      newDirection = column === 'username' ? 'asc' : 'desc';
    }

    setSortColumn(column);
    setSortDirection(newDirection);

    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('leaderboardSortColumn', column);
      localStorage.setItem('leaderboardSortDirection', newDirection);
    }
  };

  const filteredAndSortedMembers = useMemo(() => {
    // Filter by search
    let filtered = members.filter(member =>
      member.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (member.discordRank && member.discordRank.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Sort
    filtered.sort((a, b) => {
      const aValue = getValue(a, sortColumn);
      const bValue = getValue(b, sortColumn);

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      const aNum = typeof aValue === 'number' ? aValue : 0;
      const bNum = typeof bValue === 'number' ? bValue : 0;

      // For discordRank, we need to invert the logic since lower numbers = better ranks
      // Descending should show Hydra (1) first, ascending should show Starfish (10) first
      if (sortColumn === 'discordRank') {
        return sortDirection === 'desc' ? aNum - bNum : bNum - aNum;
      }

      // For all other numeric columns
      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
    });

    return filtered;
  }, [members, searchTerm, sortColumn, sortDirection, timeFrame]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      width: '100%'
    }}>
      {/* Time Frame Selector */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '0.75rem',
        border: '1px solid var(--border-card)',
        padding: '1.5rem'
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap'
          }}>
            {timeFrames.map(tf => (
              <button
                key={tf.value}
                onClick={() => onTimeFrameChange(tf.value)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid',
                  borderColor: timeFrame === tf.value ? 'var(--color-ocean-500)' : 'var(--border-card)',
                  background: timeFrame === tf.value ? 'var(--color-ocean-500)' : 'transparent',
                  color: timeFrame === tf.value ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <div style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center'
          }}>
            <input
              type="text"
              placeholder="Search member..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                width: '200px'
              }}
            />

            {onRefresh && (
              <button
                onClick={onRefresh}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border-card)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = 'var(--color-ocean-500)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'var(--border-card)';
                }}
              >
                Refresh
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table */}
      {filteredAndSortedMembers.length > 0 ? (
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '0.75rem',
          border: '1px solid var(--border-card)',
          overflow: 'hidden'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse'
          }}>
            <thead>
              <tr style={{
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-card)'
              }}>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: 'var(--text-secondary)',
                  width: '60px'
                }}>
                  Rank
                </th>
                <th
                  onClick={() => handleSort('username')}
                  style={{
                    padding: '0.75rem',
                    textAlign: 'left',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: sortColumn === 'username' ? 'var(--color-ocean-500)' : 'var(--text-secondary)',
                    background: sortColumn === 'username' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  Member {sortColumn === 'username' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('discordRank')}
                  style={{
                    padding: '0.75rem',
                    textAlign: 'left',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: sortColumn === 'discordRank' ? 'var(--color-ocean-500)' : 'var(--text-secondary)',
                    background: sortColumn === 'discordRank' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  Rank {sortColumn === 'discordRank' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('wars')}
                  style={{
                    padding: '0.75rem',
                    textAlign: 'right',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: sortColumn === 'wars' ? 'var(--color-ocean-500)' : 'var(--text-secondary)',
                    background: sortColumn === 'wars' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  Wars {sortColumn === 'wars' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('raids')}
                  style={{
                    padding: '0.75rem',
                    textAlign: 'right',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: sortColumn === 'raids' ? 'var(--color-ocean-500)' : 'var(--text-secondary)',
                    background: sortColumn === 'raids' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  Raids {sortColumn === 'raids' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('shells')}
                  style={{
                    padding: '0.75rem',
                    textAlign: 'right',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: sortColumn === 'shells' ? 'var(--color-ocean-500)' : 'var(--text-secondary)',
                    background: sortColumn === 'shells' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  Shells {sortColumn === 'shells' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('contributed')}
                  style={{
                    padding: '0.75rem',
                    textAlign: 'right',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: sortColumn === 'contributed' ? 'var(--color-ocean-500)' : 'var(--text-secondary)',
                    background: sortColumn === 'contributed' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  Contribution (XP) {sortColumn === 'contributed' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('playtime')}
                  style={{
                    padding: '0.75rem',
                    textAlign: 'right',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: sortColumn === 'playtime' ? 'var(--color-ocean-500)' : 'var(--text-secondary)',
                    background: sortColumn === 'playtime' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  Playtime {sortColumn === 'playtime' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedMembers.map((member, index) => {
                const position = index + 1;

                return (
                  <tr
                    key={member.uuid}
                    style={{
                      borderBottom: index < filteredAndSortedMembers.length - 1 ? '1px solid var(--border-card)' : 'none',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: position <= 3 ?
                        (position === 1 ? '#FFD700' : position === 2 ? '#C0C0C0' : '#CD7F32') :
                        'var(--text-secondary)'
                    }}>
                      #{position}
                      {!member.hasCompleteData && timeFrame !== 'all' && (
                        <span
                          style={{
                            marginLeft: '0.25rem',
                            color: '#FFA500',
                            fontSize: '0.75rem'
                          }}
                          title="Incomplete data for this time period"
                        >
                          ⚠️
                        </span>
                      )}
                    </td>
                    <td style={{
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: sortColumn === 'username' ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                    }}>
                      {member.username}
                      {member.online && (
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: '#4ade80'
                        }} />
                      )}
                    </td>
                    <td style={{
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                      background: sortColumn === 'discordRank' ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                    }}>
                      {member.discordRank && (
                        <span>{member.discordRank}</span>
                      )}
                    </td>
                    <td style={{
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: 'var(--color-ocean-500)',
                      textAlign: 'right',
                      background: sortColumn === 'wars' ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                    }}>
                      {formatValue(getValue(member, 'wars') as number, 'wars')}
                    </td>
                    <td style={{
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: 'var(--color-ocean-500)',
                      textAlign: 'right',
                      background: sortColumn === 'raids' ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                    }}>
                      {formatValue(getValue(member, 'raids') as number, 'raids')}
                    </td>
                    <td style={{
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: 'var(--color-ocean-500)',
                      textAlign: 'right',
                      background: sortColumn === 'shells' ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                    }}>
                      {formatValue(getValue(member, 'shells') as number, 'shells')}
                    </td>
                    <td style={{
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: 'var(--color-ocean-500)',
                      textAlign: 'right',
                      background: sortColumn === 'contributed' ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                    }}>
                      {formatValue(getValue(member, 'contributed') as number, 'contributed')}
                    </td>
                    <td style={{
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: 'var(--color-ocean-500)',
                      textAlign: 'right',
                      background: sortColumn === 'playtime' ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                    }}>
                      {formatValue(getValue(member, 'playtime') as number, 'playtime')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          background: 'var(--bg-card)',
          borderRadius: '0.75rem',
          border: '1px solid var(--border-card)'
        }}>
          <p style={{
            color: 'var(--text-secondary)',
            fontSize: '1.125rem'
          }}>
            No members found matching your criteria
          </p>
        </div>
      )}
    </div>
  );
}