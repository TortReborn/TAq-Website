"use client";

import { useState } from "react";
import LeaderboardTable from "@/components/LeaderboardTable";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import LeaderboardSkeleton from "@/components/skeletons/LeaderboardSkeleton";

interface Guild {
  name: string;
  prefix: string;
  level: number;
  territories: number;
  totalMembers: number;
  onlineMembers: number;
}

interface TimeFrameStats {
  wars: number;
  raids: number;
  shells: number;
  contributed: number;
  playtime: number;
  hasCompleteData: boolean;
}

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
  // All time frame stats pre-calculated
  timeFrames: Record<string, TimeFrameStats>;
}

interface MembersData {
  guild: Guild;
  members: Member[];
  hasHistoricalData: Record<string, boolean>;
}

export default function LeaderboardPage() {
  const { membersData, loading, error, refresh } = useLeaderboard();
  const [searchTerm, setSearchTerm] = useState('');
  const [timeFrame, setTimeFrame] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('leaderboardTimeFrame') || '7';
    }
    return '7';
  });

  const handleTimeFrameChange = (newTimeFrame: string) => {
    setTimeFrame(newTimeFrame);
    if (typeof window !== 'undefined') {
      localStorage.setItem('leaderboardTimeFrame', newTimeFrame);
    }
  };

  if (loading && !membersData) {
    return <LeaderboardSkeleton />;
  }

  if (error && !membersData) {
    return (
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '5rem',
        paddingLeft: '1rem',
        paddingRight: '1rem',
        paddingBottom: '2rem'
      }}>
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            fontSize: '1.125rem',
            color: '#e33232',
            background: 'var(--bg-card)',
            padding: '1.5rem',
            borderRadius: '0.5rem',
            border: '1px solid #e33232'
          }}>
            ❌ {error}
          </div>
        </div>
      </main>
    );
  }

  if (!membersData) {
    return null;
  }

  const timeFrames = [
    { value: '1', label: '24 Hours' },
    { value: '7', label: '7 Days' },
    { value: '14', label: '14 Days' },
    { value: '30', label: '30 Days' },
    { value: 'all', label: 'All Time' }
  ];

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '2rem',
      minHeight: '100vh'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '900px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem'
      }}>
        {/* Unified Header */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          background: 'var(--bg-card)',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          border: '3px solid #240059'
        }}>
            {/* Title Row */}
            <div style={{ textAlign: 'center' }}>
              <h1 style={{
                fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
                fontWeight: '800',
                background: 'linear-gradient(135deg, var(--color-ocean-400), var(--color-ocean-600))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                margin: 0,
                letterSpacing: '-0.02em'
              }}>
                Guild Leaderboard
              </h1>
              {!membersData.hasHistoricalData?.[timeFrame] && timeFrame !== 'all' && (
                <p style={{
                  color: '#FFA500',
                  fontSize: '0.75rem',
                  margin: '0.25rem 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.25rem'
                }}>
                  ⚠️ Historical data not available
                </p>
              )}
            </div>

            {/* Controls Row */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              {/* Time Frame Selector (Left) */}
              <div style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap'
              }}>
                {timeFrames.map(tf => (
                  <button
                    key={tf.value}
                    onClick={() => handleTimeFrameChange(tf.value)}
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

              {/* Search + Refresh (Right) */}
              <div style={{
                display: 'flex',
                gap: '0.5rem',
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
                    width: '180px'
                  }}
                />
                <button
                  onClick={refresh}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border-card)',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '600',
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
              </div>
            </div>
        </div>

        {/* Table */}
        <LeaderboardTable
          members={membersData.members}
          timeFrame={timeFrame}
          searchTerm={searchTerm}
        />
      </div>
    </main>
  );
}