"use client";

import React, { useState } from "react";

interface Member {
  username: string;
  online?: boolean | string;
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
}

interface MemberGridProps {
  members: Member[];
  onRefresh?: () => Promise<void>;
  showOnlineOnly?: boolean;
}

export default function MemberGrid({ members, onRefresh, showOnlineOnly = false }: MemberGridProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Helper to check if member is online (handles both boolean and string values)
  const isOnline = (member: Member) => {
    return member.online === true || member.online === 'true';
  };

  // Filter members based on online toggle
  const filteredMembers = showOnlineOnly ? members.filter(member => isOnline(member)) : members;

  // Group members by Discord rank or create single online group
  const groupedMembers = showOnlineOnly 
    ? { 'Online Players': filteredMembers } // Single group for online players
    : filteredMembers.reduce((groups, member) => {
        const rank = member.discordRank;
        if (!groups[rank]) {
          groups[rank] = [];
        }
        groups[rank].push(member);
        return groups;
      }, {} as Record<string, Member[]>);

  // Discord rank order as specified
  const discordRankOrder = [
    'Hydra', 
    'Narwhal',
    'Dolphin',
    'Sailfish',
    'Hammerhead',
    'Angler',
    'Barracuda',
    'Piranha',
    'Manatee',
    'Starfish'
  ];

  const sortedRanks = showOnlineOnly 
    ? ['Online Players'] // Single group when showing online only
    : discordRankOrder.filter(rank => groupedMembers[rank]);

  const getRankColor = (rank: string) => {
    switch (rank) {
      case 'Hydra': return '#ac034c';
      case 'Narwhal': return '#eb2279';
      case 'Dolphin': return '#9d68ff';
      case 'Sailfish': return '#396aff';
      case 'Hammerhead': return '#04b0eb';
      case 'Angler': return '#00e2db';
      case 'Barracuda': return '#79e64a';
      case 'Piranha': return '#c8ff00';
      case 'Manatee': return '#ffe226';
      case 'Starfish': return '#e8a41c';
      default: return 'var(--text-muted)';
    }
  };  const getOnlineStatusColor = (online: boolean) => {
    return online ? '#27ae60' : '#7f8c8d';
  };

  const formatJoinDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const formatPlaytime = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours < 24) return `${hours.toFixed(1)} hrs`;
    return `${(hours / 24).toFixed(1)} days`;
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Member grid organized by rank */}
      {sortedRanks.map((rankName) => (
        <div key={rankName} style={{ marginBottom: '3rem' }}>
          {/* Header with rank title */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              color: showOnlineOnly ? 'var(--text-primary)' : getRankColor(rankName),
              margin: 0,
              textShadow: '0 1px 2px rgba(0,0,0,0.1)',
              textAlign: 'center'
            }}>
              {rankName}
            </h3>
          </div>

          {/* Member grid */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1rem',
            marginBottom: '1rem',
            width: '100%',
            flexWrap: 'wrap'
          }}>
            {groupedMembers[rankName].map((member) => {
              let isFlipped = false;
              
              return (
                <div
                  key={member.username}
                  style={{
                    perspective: '1000px',
                    width: '120px',
                    height: '120px'
                  }}
                  onMouseEnter={(e) => {
                    if (!isFlipped) {
                      const cardInner = e.currentTarget.querySelector('.card-inner') as HTMLElement;
                      if (cardInner) {
                        cardInner.style.transform = 'rotateY(180deg)';
                        isFlipped = true;
                      }
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isFlipped) {
                      const cardInner = e.currentTarget.querySelector('.card-inner') as HTMLElement;
                      if (cardInner) {
                        cardInner.style.transform = 'rotateY(0deg)';
                        isFlipped = false;
                      }
                    }
                  }}
                >
                  <div
                    className="card-inner"
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      transformStyle: 'preserve-3d',
                      transition: 'transform 0.6s',
                      cursor: 'pointer'
                    }}
                  >
                    {/* Front of card */}
                    <div
                      style={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                        backfaceVisibility: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.5rem',
                        background: isOnline(member)
                          ? `linear-gradient(to bottom, var(--bg-card), rgba(39, 174, 96, 0.1))`
                          : 'var(--bg-card)',
                        borderRadius: '0.75rem',
                        border: '2px solid',
                        borderColor: getRankColor(showOnlineOnly ? member.discordRank : rankName),
                        boxSizing: 'border-box'
                      }}
                    >
                      {/* Online status indicator */}
                      <div style={{
                        position: 'absolute',
                        top: '0.5rem',
                        right: '0.5rem',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: getOnlineStatusColor(isOnline(member))
                      }} />

                      {/* Minecraft head */}
                      <div style={{
                        width: '40px',
                        height: '40px',
                        backgroundColor: '#8B4513',
                        borderRadius: '4px',
                        marginBottom: '0.25rem',
                        backgroundImage: `url(https://mc-heads.net/avatar/${member.username}/40)`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }} />

                      {/* Username */}
                      <div style={{
                        fontSize: member.username.length > 12 ? '0.65rem' : member.username.length > 8 ? '0.7rem' : '0.75rem',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        textAlign: 'center',
                        lineHeight: '1.2',
                        marginBottom: '0.1rem',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {member.username}
                      </div>

                      {/* Online status */}
                      <div style={{
                        fontSize: '0.625rem',
                        color: isOnline(member) ? getOnlineStatusColor(true) : '#7f8c8d',
                        textAlign: 'center'
                      }}>
                        {isOnline(member) ? (member.server || 'Online') : 'Offline'}
                      </div>
                    </div>

                    {/* Back of card */}
                    <div
                      style={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '0.5rem',
                        background: isOnline(member)
                          ? `linear-gradient(to bottom, var(--bg-card), rgba(39, 174, 96, 0.1))`
                          : 'var(--bg-card)',
                        borderRadius: '0.75rem',
                        border: '2px solid',
                        borderColor: getRankColor(showOnlineOnly ? member.discordRank : rankName),
                        boxSizing: 'border-box'
                      }}
                    >
                      {/* Username */}
                      <div style={{
                        fontSize: '0.7rem',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        textAlign: 'center',
                        marginBottom: '0.25rem',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {member.username}
                      </div>

                      {/* Wars/Raids/Shells */}
                      <div style={{
                        fontSize: '0.6rem',
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                        marginBottom: '0.2rem'
                      }}>
                        ⚔️ {member.wars} 🏰 {member.raids} 🐚 {member.shells}
                      </div>

                      {/* Playtime */}
                      <div style={{
                        fontSize: '0.6rem',
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                        marginBottom: '0.2rem'
                      }}>
                        Playtime: {formatPlaytime(member.playtime)}
                      </div>

                      {/* Last Join Date */}
                      <div style={{
                        fontSize: '0.6rem',
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                        lineHeight: '1.2'
                      }}>
                        {formatJoinDate(member.lastJoin)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {members.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          color: 'var(--text-muted)',
          fontSize: '1.125rem'
        }}>
          No members with Discord ranks found.
        </div>
      )}
    </div>
  );
}
