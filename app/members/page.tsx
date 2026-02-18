"use client";

import { useState } from "react";
import MemberGrid from "@/components/MemberGrid";
import PageHeader from "@/components/PageHeader";
import { useMembers } from "@/hooks/useMembers";
import MemberGridSkeleton from "@/components/skeletons/MemberGridSkeleton";

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
}

interface MembersData {
  guild: Guild;
  members: Member[];
}

export default function MembersPage() {
  const { membersData, loading, error, refresh } = useMembers();
  const [showOnlineOnly, setShowOnlineOnly] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('membersOnlineOnly') === 'true';
    }
    return false;
  });

  const handleToggleOnlineOnly = () => {
    const newValue = !showOnlineOnly;
    setShowOnlineOnly(newValue);
    // Cache the preference
    if (typeof window !== 'undefined') {
      localStorage.setItem('membersOnlineOnly', newValue.toString());
    }
  };

  if (loading) {
    return (
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '2rem',
        minHeight: '100vh'
      }}>
        <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto' }}>
          <MemberGridSkeleton />
        </div>
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

  // Discord data is already included in members from the API
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
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '3rem'
      }}>
        {/* Header Container */}
        <div style={{
          display: 'flex',
          justifyContent: 'center'
        }}>
          {/* Unified Header */}
          <div className="members-header-container" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '2rem',
            flexWrap: 'wrap',
            background: 'var(--bg-card)',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            border: '3px solid #240059',
            width: '90%',
            maxWidth: '1200px'
          }}>
            {/* Member Count (Left) */}
            <div style={{
              fontSize: '0.875rem',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--bg-secondary)',
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem'
            }}>
              <span style={{ fontSize: '1.125rem' }}>👥</span>
              <div>
                <div style={{ fontWeight: '600' }}>{membersData.guild.totalMembers} Total Members</div>
                <div>{membersData.guild.onlineMembers} Currently Online</div>
              </div>
            </div>

            {/* Title (Center) */}
            <div style={{
              flex: '1',
              textAlign: 'center',
              minWidth: '200px'
            }}>
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
                Guild Members
              </h1>
            </div>

            {/* Online Only Toggle (Right) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              background: 'var(--bg-secondary)',
              borderRadius: '0.5rem',
              padding: '0.5rem 1rem'
            }}>
              <label style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                userSelect: 'none'
              }}>
                Online Only
              </label>
              <button
                onClick={handleToggleOnlineOnly}
                style={{
                  width: '48px',
                  height: '24px',
                  borderRadius: '12px',
                  background: showOnlineOnly ? '#7a187a' : 'var(--bg-card)',
                  border: '2px solid #7a187a',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  padding: 0
                }}
              >
                <div style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: showOnlineOnly ? 'white' : '#7a187a',
                  position: 'absolute',
                  top: '1px',
                  left: showOnlineOnly ? '25px' : '1px',
                  transition: 'all 0.3s ease'
                }} />
              </button>
            </div>
          </div>
        </div>

        {/* Members Grid */}
        <div style={{
          display: 'flex',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '90%',
            maxWidth: '1200px'
          }}>
            <MemberGrid
              members={membersData.members}
              onRefresh={refresh}
              showOnlineOnly={showOnlineOnly}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
