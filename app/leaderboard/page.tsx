"use client";

import { useState, useEffect } from "react";
import LeaderboardTable from "@/components/LeaderboardTable";

interface Guild {
  name: string;
  prefix: string;
  level: number;
  territories: number;
  totalMembers: number;
  onlineMembers: number;
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
  // Time frame specific values
  timeFrameWars?: number;
  timeFrameRaids?: number;
  timeFrameShells?: number;
  timeFrameContributed?: number;
  timeFramePlaytime?: number;
  hasCompleteData?: boolean;
}

interface MembersData {
  guild: Guild;
  members: Member[];
  hasHistoricalData?: boolean;
}

export default function LeaderboardPage() {
  const [membersData, setMembersData] = useState<MembersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFrame, setTimeFrame] = useState('7'); // Default to 7 days
  const [initialized, setInitialized] = useState(false);

  const fetchMembersData = async (selectedTimeFrame?: string) => {
    const frame = selectedTimeFrame || timeFrame;
    setLoading(true);

    try {
      const response = await fetch(`/api/members/activity?timeFrame=${frame}`, {
        cache: 'no-store'
      });

      if (!response.ok) {
        if (response.status === 429) {
          const errorData = await response.json();
          throw new Error(`Rate limit exceeded. ${errorData.message || 'Please try again later.'}`);
        } else {
          throw new Error(`HTTP ${response.status}: Failed to fetch members data`);
        }
      }

      const data = await response.json();
      setMembersData(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching members data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleTimeFrameChange = (newTimeFrame: string) => {
    setTimeFrame(newTimeFrame);
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('leaderboardTimeFrame', newTimeFrame);
    }
    fetchMembersData(newTimeFrame);
  };

  useEffect(() => {
    // Load saved time frame from localStorage
    if (typeof window !== 'undefined' && !initialized) {
      const savedTimeFrame = localStorage.getItem('leaderboardTimeFrame');
      if (savedTimeFrame) {
        setTimeFrame(savedTimeFrame);
        fetchMembersData(savedTimeFrame);
      } else {
        // First time visitor - use default of 7 days
        fetchMembersData('7');
      }
      setInitialized(true);
    } else if (initialized) {
      // Only set up interval after initialization
      const interval = setInterval(() => fetchMembersData(), 60000);
      return () => clearInterval(interval);
    }
  }, [initialized]);

  if (loading && !membersData) {
    return (
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '5rem',
        paddingLeft: '1rem',
        paddingRight: '1rem',
        minHeight: '100vh'
      }}>
        <div style={{
          color: 'var(--text-primary)',
          fontSize: '1.125rem'
        }}>
          Loading leaderboard...
        </div>
      </main>
    );
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
        minHeight: '100vh'
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
      paddingBottom: '2rem',
      minHeight: '100vh'
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
          {!membersData.hasHistoricalData && timeFrame !== 'all' && (
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
          onRefresh={() => fetchMembersData()}
          timeFrame={timeFrame}
          onTimeFrameChange={handleTimeFrameChange}
        />
      </div>
    </main>
  );
}