"use client";

import React, { useState } from "react";

interface Member {
  username: string;
  online: boolean;
  server: string | null;
  contributed: number;
  guildRank: number;
  contributionRank?: number;
  joined: string;
  discordRank: string; // Now guaranteed to be non-null
  guildRankName: string;
}

interface MemberGridProps {
  members: Member[];
  onRefresh?: () => Promise<void>;
}

export default function MemberGrid({ members, onRefresh }: MemberGridProps) {
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

  // Group members by Discord rank
  const groupedMembers = members.reduce((groups, member) => {
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

  const sortedRanks = discordRankOrder.filter(rank => groupedMembers[rank]);

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

  return (
    <div style={{ width: '100%' }}>
      {/* Member grid organized by rank */}
      {sortedRanks.map((rankName) => (
        <div key={rankName} style={{ marginBottom: '3rem' }}>
          {/* Rank header */}
          <div style={{
            textAlign: 'center',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: getRankColor(rankName),
              margin: 0,
              textShadow: '0 1px 2px rgba(0,0,0,0.1)'
            }}>
              {rankName} ({groupedMembers[rankName].length})
            </h3>
          </div>

          {/* Member grid */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1rem',
            marginBottom: '1rem',
            flexWrap: 'wrap'
          }}>
            {groupedMembers[rankName].map((member) => (
                <div
                  key={member.username}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '0.75rem',
                    background: member.online 
                      ? `linear-gradient(to bottom, var(--bg-card), rgba(39, 174, 96, 0.1))`
                      : 'var(--bg-card)',
                    borderRadius: '0.75rem',
                    border: '2px solid',
                    borderColor: getRankColor(rankName),
                    minWidth: '100px',
                    maxWidth: '120px',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  title={`${member.username}\nContribution: ${member.contributed.toLocaleString()}\nJoined: ${new Date(member.joined).toLocaleDateString()}`}
                >
                  {/* Online status indicator */}
                  <div style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: getOnlineStatusColor(member.online)
                  }} />

                  {/* Minecraft head placeholder (you can replace with actual skin API) */}
                  <div style={{
                    width: '48px',
                    height: '48px',
                    backgroundColor: '#8B4513',
                    borderRadius: '4px',
                    marginBottom: '0.5rem',
                    backgroundImage: `url(https://mc-heads.net/avatar/${member.username}/48)`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }} />

                  {/* Username */}
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    textAlign: 'center',
                    wordBreak: 'break-word',
                    lineHeight: '1.2',
                    marginBottom: '0.25rem'
                  }}>
                    {member.username}
                  </div>

                  {/* Online status */}
                  <div style={{
                    fontSize: '0.625rem',
                    color: member.online ? getOnlineStatusColor(member.online) : '#7f8c8d',
                    textAlign: 'center'
                  }}>
                    {member.online && member.server ? member.server : 'Offline'}
                  </div>
                </div>
              ))}
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
