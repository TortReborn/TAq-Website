"use client";

import { useState, useEffect } from "react";
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
  const [timeFrame, setTimeFrame] = useState('7');

  const handleTimeFrameChange = (newTimeFrame: string) => {
    setTimeFrame(newTimeFrame);
    if (typeof window !== 'undefined') {
      localStorage.setItem('leaderboardTimeFrame', newTimeFrame);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTimeFrame = localStorage.getItem('leaderboardTimeFrame');
      if (savedTimeFrame) {
        setTimeFrame(savedTimeFrame);
      }
    }
  }, []);

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

  // Get time frame label for display
  const getTimeFrameLabel = () => {
    switch (timeFrame) {
      case '1': return 'Last 24 Hours';
      case '7': return 'Last 7 Days';
      case '14': return 'Last 14 Days';
      case '30': return 'Last 30 Days';
      case 'all': return 'All Time';
      default: return 'All Time';
    }
  };

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '5rem',
      paddingLeft: 'clamp(1rem, 5vw, 3rem)',
      paddingRight: 'clamp(1rem, 5vw, 3rem)',
      paddingBottom: '2rem'
    }}>
      <div style={{
        width: '60%',
        maxWidth: '1400px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem'
      }}>
        <div style={{
          textAlign: 'center',
          marginBottom: '1rem'
        }}>
          <h1 style={{
            fontSize: 'clamp(2rem, 4vw, 3rem)',
            fontWeight: '800',
            background: 'linear-gradient(135deg, var(--color-ocean-400), var(--color-ocean-600))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '0.5rem',
            letterSpacing: '-0.02em'
          }}>
            Guild Leaderboard
          </h1>
          {!membersData.hasHistoricalData?.[timeFrame] && timeFrame !== 'all' && (
            <p style={{
              color: '#FFA500',
              fontSize: '0.875rem',
              marginTop: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.25rem'
            }}>
              ⚠️ Historical data not available - showing all-time stats
            </p>
          )}
        </div>

        <LeaderboardTable
          members={membersData.members}
          onRefresh={refresh}
          timeFrame={timeFrame}
          onTimeFrameChange={handleTimeFrameChange}
        />
      </div>
    </main>
  );
}