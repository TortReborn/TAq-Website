"use client";

import { useState, useMemo } from 'react';

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

type LeaderboardCategory = 'wars' | 'raids' | 'shells' | 'contributed' | 'playtime';

export default function LeaderboardTable({ members, onRefresh, timeFrame, onTimeFrameChange }: LeaderboardTableProps) {
  const [selectedCategory, setSelectedCategory] = useState<LeaderboardCategory>('wars');
  const [searchTerm, setSearchTerm] = useState('');

  const discordRankEmojis: Record<string, string> = {
    'Hydra': '🐉',
    'Narwhal': '🦄',
    'Dolphin': '🐬',
    'Sailfish': '⛵',
    'Hammerhead': '🔨',
    'Angler': '🎣',
    'Barracuda': '🐟',
    'Piranha': '🦈',
    'Manatee': '🦭',
    'Starfish': '⭐'
  };

  const categories = [
    { key: 'wars' as LeaderboardCategory, label: 'Wars', icon: '⚔️' },
    { key: 'raids' as LeaderboardCategory, label: 'Raids', icon: '🏰' },
    { key: 'shells' as LeaderboardCategory, label: 'Shells', icon: '🐚' },
    { key: 'contributed' as LeaderboardCategory, label: 'Contribution', icon: '💎' },
    { key: 'playtime' as LeaderboardCategory, label: 'Playtime', icon: '⏱️' },
  ];

  const timeFrames = [
    { value: '1', label: '24 Hours' },
    { value: '7', label: '7 Days' },
    { value: '14', label: '14 Days' },
    { value: '30', label: '30 Days' },
    { value: 'all', label: 'All Time' }
  ];

  const formatPlaytime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    if (days > 0) {
      return `${days}d ${remainingHours}h`;
    }
    return `${hours}h ${minutes % 60}m`;
  };

  const formatValue = (value: number, category: LeaderboardCategory) => {
    if (category === 'playtime') {
      return formatPlaytime(value);
    }
    if (category === 'contributed') {
      return value.toLocaleString() + ' LE';
    }
    return value.toLocaleString();
  };

  // Get the value based on time frame
  const getValue = (member: Member, category: LeaderboardCategory): number => {
    if (timeFrame === 'all') {
      return member[category] || 0;
    }

    // Use time frame specific values
    switch (category) {
      case 'wars':
        return member.timeFrameWars || 0;
      case 'raids':
        return member.timeFrameRaids || 0;
      case 'shells':
        return member.timeFrameShells || 0;
      case 'contributed':
        return member.timeFrameContributed || 0;
      case 'playtime':
        return member.timeFramePlaytime || 0;
      default:
        return 0;
    }
  };

  const filteredAndSortedMembers = useMemo(() => {
    let filtered = members.filter(member => {
      const matchesSearch = member.username.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });

    return filtered.sort((a, b) => {
      const aValue = getValue(a, selectedCategory);
      const bValue = getValue(b, selectedCategory);
      return bValue - aValue;
    });
  }, [members, searchTerm, selectedCategory, timeFrame]);

  const topMembers = filteredAndSortedMembers.slice(0, 3);
  const otherMembers = filteredAndSortedMembers.slice(3);

  const getMedalEmoji = (position: number) => {
    switch (position) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return '';
    }
  };

  const getPositionStyle = (position: number) => {
    switch (position) {
      case 1: return { background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', color: '#000' };
      case 2: return { background: 'linear-gradient(135deg, #C0C0C0 0%, #808080 100%)', color: '#000' };
      case 3: return { background: 'linear-gradient(135deg, #CD7F32 0%, #8B4513 100%)', color: '#fff' };
      default: return {};
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem'
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        background: 'var(--bg-card)',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        border: '1px solid var(--border-card)'
      }}>
        {/* Time Frame Selector */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          padding: '0.5rem',
          background: 'var(--bg-secondary)',
          borderRadius: '0.5rem'
        }}>
          {timeFrames.map(tf => (
            <button
              key={tf.value}
              onClick={() => onTimeFrameChange(tf.value)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: 'none',
                background: timeFrame === tf.value ? 'var(--color-ocean-500)' : 'transparent',
                color: timeFrame === tf.value ? '#fff' : 'var(--text-secondary)',
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
            {categories.map(category => (
              <button
                key={category.key}
                onClick={() => setSelectedCategory(category.key)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid',
                  borderColor: selectedCategory === category.key ? 'var(--color-ocean-500)' : 'var(--border-card)',
                  background: selectedCategory === category.key ? 'var(--color-ocean-500)' : 'transparent',
                  color: selectedCategory === category.key ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
              >
                <span>{category.icon}</span>
                <span>{category.label}</span>
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
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border-card)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'transform 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'rotate(180deg)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'rotate(0deg)'}
              >
                🔄
              </button>
            )}
          </div>
        </div>
      </div>

      {topMembers.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem'
        }}>
          {topMembers.map((member, index) => {
            const position = index + 1;
            const value = getValue(member, selectedCategory);

            return (
              <div
                key={member.uuid}
                style={{
                  ...getPositionStyle(position),
                  padding: '1.5rem',
                  borderRadius: '0.75rem',
                  border: '2px solid',
                  borderColor: position === 1 ? '#FFD700' : position === 2 ? '#C0C0C0' : '#CD7F32',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  position: 'relative',
                  overflow: 'hidden',
                  background: 'var(--bg-card)'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '0.5rem',
                  right: '0.5rem',
                  fontSize: '2rem'
                }}>
                  {getMedalEmoji(position)}
                </div>

                {!member.hasCompleteData && timeFrame !== 'all' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '0.5rem',
                      left: '0.5rem',
                      fontSize: '1rem',
                      color: '#FFA500'
                    }}
                    title="Incomplete data for this time period"
                  >
                    ⚠️
                  </div>
                )}

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{
                    fontSize: '1.5rem',
                    fontWeight: '800',
                    color: position <= 3 ? (position === 2 ? '#444' : '#fff') : 'var(--text-primary)'
                  }}>
                    #{position}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '1.125rem',
                      fontWeight: '700',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      {member.username}
                      {member.online && (
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#4ade80',
                          display: 'inline-block'
                        }} />
                      )}
                    </div>
                    <div style={{
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      {member.discordRank && (
                        <span>{member.discordRank}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{
                  fontSize: '1.75rem',
                  fontWeight: '800',
                  color: 'var(--color-ocean-500)',
                  textAlign: 'center',
                  padding: '0.5rem',
                  background: 'var(--bg-primary)',
                  borderRadius: '0.5rem'
                }}>
                  {formatValue(value, selectedCategory)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {otherMembers.length > 0 && (
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
                  color: 'var(--text-secondary)'
                }}>
                  Rank
                </th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: 'var(--text-secondary)'
                }}>
                  Member
                </th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: 'var(--text-secondary)'
                }}>
                  Rank
                </th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'right',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: 'var(--text-secondary)'
                }}>
                  {categories.find(c => c.key === selectedCategory)?.label}
                </th>
              </tr>
            </thead>
            <tbody>
              {otherMembers.map((member, index) => {
                const position = index + 4;
                const value = getValue(member, selectedCategory);

                return (
                  <tr
                    key={member.uuid}
                    style={{
                      borderBottom: '1px solid var(--border-card)',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: 'var(--text-secondary)'
                    }}>
                      #{position}
                      {!member.hasCompleteData && timeFrame !== 'all' && (
                        <span style={{
                          marginLeft: '0.25rem',
                          color: '#FFA500',
                          fontSize: '0.75rem'
                        }}>
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
                      gap: '0.5rem'
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
                      color: 'var(--text-secondary)'
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
                      textAlign: 'right'
                    }}>
                      {formatValue(value, selectedCategory)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filteredAndSortedMembers.length === 0 && (
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