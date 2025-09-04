"use client";

import { useState, useEffect } from "react";
import MemberGrid from "@/components/MemberGrid";

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
  online: boolean;
  server: string | null;
  contributed: number;
  guildRank: number;
  contributionRank?: number;
  joined: string;
  discordRank: string; // Non-null since API now filters these out
  guildRankName: string;
}

interface MembersData {
  guild: Guild;
  members: Member[];
}

export default function MembersPage() {
  const [membersData, setMembersData] = useState<MembersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembersData = async () => {
    try {
      const response = await fetch('/api/members', {
        cache: 'no-store'
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          // Rate limit exceeded
          const errorData = await response.json();
          const retryAfter = response.headers.get('Retry-After');
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
      setError(err instanceof Error ? err.message : 'Failed to load members data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembersData();
  }, []);

  if (loading) {
    return (
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '5rem',
        paddingLeft: '1rem',
        paddingRight: '1rem'
      }}>
        <div style={{ color: 'var(--text-primary)' }}>Loading...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '5rem',
        paddingLeft: '1rem',
        paddingRight: '1rem'
      }}>
        <div style={{ 
          padding: '2rem', 
          textAlign: 'center',
          minHeight: '50vh',
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

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '5rem',
      paddingLeft: '1rem',
      paddingRight: '1rem'
    }}>
      <div style={{
        maxWidth: '64rem',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem'
      }}>
        {/* Members Grid */}
        <MemberGrid 
          members={membersData.members} 
          onRefresh={fetchMembersData}
        />
      </div>
    </main>
  );
}
