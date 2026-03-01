"use client";

import { useState } from 'react';
import VoteButtons from './VoteButtons';
import type { ExecApplication } from '@/hooks/useExecApplications';

// Question labels matching the bot's check_website_apps.py
const GUILD_QUESTION_LABELS: Record<string, string> = {
  ign: 'IGN',
  timezone: 'Timezone',
  stats_link: 'Stats Link',
  age: 'Age',
  playtime: 'Playtime/Day',
  guild_experience: 'Guild Experience',
  warring: 'Warring Interest',
  know_about_taq: 'Knowledge of TAq',
  gain_from_taq: 'Goals from TAq',
  contribute: 'Contribution',
  anything_else: 'Additional Info',
  reference: 'Reference/Recruiter',
};

const COMMUNITY_QUESTION_LABELS: Record<string, string> = {
  ign: 'IGN',
  guild: 'Current Guild',
  why_community: 'Why Community',
  contribute: 'Contribution',
  anything_else: 'Additional Info',
};

const GUILD_ORDER = [
  'ign', 'timezone', 'stats_link', 'age', 'playtime',
  'guild_experience', 'warring', 'know_about_taq',
  'gain_from_taq', 'contribute', 'anything_else', 'reference',
];

const COMMUNITY_ORDER = [
  'ign', 'guild', 'why_community', 'contribute', 'anything_else',
];

interface Props {
  app: ExecApplication;
  onVoteChange: (appId: number, newVote: string | null, newSummary: { accept: number; deny: number; abstain: number }) => void;
}

export default function ApplicationCard({ app, onVoteChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  const labels = app.type === 'guild' ? GUILD_QUESTION_LABELS : COMMUNITY_QUESTION_LABELS;
  const order = app.type === 'guild' ? GUILD_ORDER : COMMUNITY_ORDER;

  const statusColors: Record<string, string> = {
    pending: '#f59e0b',
    accepted: '#22c55e',
    denied: '#ef4444',
  };

  const statusColor = statusColors[app.status] || '#6b7280';
  const avatarUrl = app.discordAvatar || `https://cdn.discordapp.com/embed/avatars/0.png`;
  const submittedDate = new Date(app.submittedAt);
  const ign = app.answers?.ign || 'Unknown';

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '0.75rem',
      border: '1px solid var(--border-card)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '1rem 1.25rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <img
            src={avatarUrl}
            alt={app.discordUsername}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              flexShrink: 0,
              border: `2px solid ${statusColor}`,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}>
              <span style={{
                fontSize: '0.95rem',
                fontWeight: '700',
                color: 'var(--text-primary)',
              }}>
                {ign}
              </span>
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
              }}>
                ({app.discordUsername})
              </span>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: '600',
                padding: '0.15rem 0.4rem',
                borderRadius: '0.25rem',
                background: app.type === 'guild' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                color: app.type === 'guild' ? '#3b82f6' : '#a855f7',
                textTransform: 'uppercase',
              }}>
                {app.type}
              </span>
            </div>
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              marginTop: '0.15rem',
            }}>
              {submittedDate.toLocaleDateString()} {submittedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
          {/* Vote summary */}
          <div style={{
            display: 'flex',
            gap: '0.35rem',
          }}>
            {[
              { count: app.voteSummary.accept, label: 'A', color: '#22c55e' },
              { count: app.voteSummary.abstain, label: 'Ab', color: '#6b7280' },
              { count: app.voteSummary.deny, label: 'D', color: '#ef4444' },
            ].map(({ count, label, color }) => (
              <span key={label} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.7rem',
                fontWeight: '700',
                padding: '0.2rem 0.45rem',
                borderRadius: '0.3rem',
                background: `${color}18`,
                border: `1px solid ${color}30`,
                color,
              }}>
                {count}<span style={{ opacity: 0.7, fontWeight: '500' }}>{label}</span>
              </span>
            ))}
          </div>

          {/* Status badge */}
          <span style={{
            fontSize: '0.7rem',
            fontWeight: '600',
            padding: '0.2rem 0.5rem',
            borderRadius: '0.25rem',
            background: `${statusColor}20`,
            color: statusColor,
            textTransform: 'capitalize',
          }}>
            {app.status}
          </span>

          {/* Expand arrow */}
          <span style={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            color: 'var(--text-secondary)',
            fontSize: '0.75rem',
          }}>
            &#x25BC;
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border-card)',
          padding: '1.25rem',
        }}>
          {/* Vote buttons */}
          <div style={{
            marginBottom: '1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}>
            <VoteButtons
              applicationId={app.id}
              currentVote={app.userVote}
              voteSummary={app.voteSummary}
              disabled={app.status !== 'pending'}
              onVoteChange={(newVote, newSummary) => onVoteChange(app.id, newVote, newSummary)}
            />

            {/* Individual votes grouped by type: accepts / abstains / denies */}
            {app.votes.length > 0 && (() => {
              const voteGroups = [
                { type: 'accept', color: '#22c55e' },
                { type: 'abstain', color: '#6b7280' },
                { type: 'deny', color: '#ef4444' },
              ];
              const rows = voteGroups
                .map(g => ({ ...g, voters: app.votes.filter(v => v.vote === g.type) }))
                .filter(g => g.voters.length > 0);

              return (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.3rem',
                  alignItems: 'flex-end',
                }}>
                  {rows.map(g => (
                    <div key={g.type} style={{
                      display: 'flex',
                      gap: '0.35rem',
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                    }}>
                      {g.voters.map(v => (
                        <span key={v.voter_discord_id} style={{
                          fontSize: '0.7rem',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '0.25rem',
                          border: `1px solid ${g.color}40`,
                          color: g.color,
                        }}>
                          {v.voter_username}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Application answers */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}>
            {order.map(key => {
              const value = app.answers?.[key];
              if (!value) return null;
              const label = labels[key] || key;

              return (
                <div key={key}>
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: 'var(--text-secondary)',
                    marginBottom: '0.2rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                  }}>
                    {label}
                  </div>
                  <div style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-primary)',
                    lineHeight: '1.5',
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '0.375rem',
                    border: '1px solid rgba(255,255,255,0.05)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {value}
                  </div>
                </div>
              );
            })}

            {/* Extra answers not in known order */}
            {Object.entries(app.answers || {})
              .filter(([key]) => !order.includes(key))
              .map(([key, value]) => {
                if (!value) return null;
                return (
                  <div key={key}>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: 'var(--text-secondary)',
                      marginBottom: '0.2rem',
                    }}>
                      {labels[key] || key}
                    </div>
                    <div style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-primary)',
                      lineHeight: '1.5',
                      padding: '0.5rem 0.75rem',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: '0.375rem',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      {value}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
