"use client";

import { useState } from 'react';
import VoteButtons from './VoteButtons';
import type { ExecApplication } from '@/hooks/useExecApplications';

// Question labels for hammerhead applications
const GENERAL_LABELS: Record<string, string> = {
  hh_ign_rank: 'IGN & Rank',
  hh_candidate_fit: 'Why a Good Candidate',
  hh_hr_meaning: 'What HR Means',
  hh_missing_hr: 'Missing in HR',
  hh_conflict: 'Conflict Resolution',
  hh_vibe: 'TAq Vibe',
};

const GENERAL_ORDER = [
  'hh_ign_rank', 'hh_candidate_fit', 'hh_hr_meaning',
  'hh_missing_hr', 'hh_conflict', 'hh_vibe',
];

const TASK_SECTIONS: Record<string, { label: string; keys: string[]; labels: Record<string, string> }> = {
  Recruitment: {
    label: 'Recruitment',
    keys: ['hh_recruit_experience', 'hh_recruit_strategies', 'hh_recruit_retention'],
    labels: {
      hh_recruit_experience: 'Recruitment Experience',
      hh_recruit_strategies: 'Recruitment Strategies',
      hh_recruit_retention: 'Member Retention',
    },
  },
  Wars: {
    label: 'Wars',
    keys: ['hh_war_importance', 'hh_war_experience', 'hh_eco_knowledge', 'hh_war_teaching'],
    labels: {
      hh_war_importance: 'War Importance',
      hh_war_experience: 'War Experience',
      hh_eco_knowledge: 'Eco Knowledge',
      hh_war_teaching: 'Teaching Wars',
    },
  },
  Events: {
    label: 'Events',
    keys: ['hh_event_ideas', 'hh_event_success', 'hh_event_experience'],
    labels: {
      hh_event_ideas: 'Event Ideas',
      hh_event_success: 'Successful Events',
      hh_event_experience: 'Event Experience',
    },
  },
  'Ing/Mat Grinding': {
    label: 'Ing/Mat Grinding',
    keys: ['hh_crafting_willing', 'hh_past_contributions', 'hh_gbank_tracking'],
    labels: {
      hh_crafting_willing: 'Willing to Craft',
      hh_past_contributions: 'Past Contributions',
      hh_gbank_tracking: 'Guild Bank Tracking',
    },
  },
  Raid: {
    label: 'Raid',
    keys: ['hh_raid_experience', 'hh_raid_teaching'],
    labels: {
      hh_raid_experience: 'Raid Experience',
      hh_raid_teaching: 'Teaching Raids',
    },
  },
};

const FINAL_LABELS: Record<string, string> = {
  hh_dedication: 'Dedication Outside Playtime',
  hh_expertise: 'Additional Expertise',
};
const FINAL_ORDER = ['hh_dedication', 'hh_expertise'];

interface Props {
  app: ExecApplication;
  onVoteChange: (appId: number, newVote: string | null, newSummary: { accept: number; deny: number; abstain: number }) => void;
  onDecision: (appId: number, status: string, reviewedAt: string, reviewedBy: string) => void;
}

const DECISION_CONFIG = {
  accepted: {
    label: 'Accept',
    confirmLabel: 'Confirm Accept',
    color: '#15803d',
    bg: 'rgba(21, 128, 61, 0.15)',
    hoverBg: 'rgba(21, 128, 61, 0.25)',
  },
  denied: {
    label: 'Deny',
    confirmLabel: 'Confirm Deny',
    color: '#b91c1c',
    bg: 'rgba(185, 28, 28, 0.15)',
    hoverBg: 'rgba(185, 28, 28, 0.25)',
  },
} as const;

type Decision = keyof typeof DECISION_CONFIG;

export default function HammerheadApplicationCard({ app, onVoteChange, onDecision }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<Decision | null>(null);

  const statusColors: Record<string, string> = {
    pending: '#f59e0b',
    accepted: '#22c55e',
    denied: '#ef4444',
  };

  const statusColor = statusColors[app.status] || '#6b7280';
  const avatarUrl = app.discordAvatar || `https://cdn.discordapp.com/embed/avatars/0.png`;
  const submittedDate = new Date(app.submittedAt);
  const ign = app.answers?.hh_ign_rank?.split(',')[0]?.trim() || app.discordUsername;

  // Determine selected tasks
  let selectedTasks: string[] = [];
  const rawTasks = app.answers?.hh_tasks;
  if (Array.isArray(rawTasks)) {
    selectedTasks = rawTasks;
  } else if (typeof rawTasks === 'string') {
    try { selectedTasks = JSON.parse(rawTasks); } catch { selectedTasks = [rawTasks]; }
  }

  const handleConfirm = async () => {
    if (!confirming || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/exec/applications/${app.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: confirming }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to submit decision');
        setSubmitting(false);
        return;
      }

      onDecision(app.id, data.status, data.reviewedAt, data.reviewedBy);
      setConfirming(null);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderAnswer = (key: string, label: string) => {
    const value = app.answers?.[key];
    if (!value) return null;
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
  };

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
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                {ign}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                ({app.discordUsername})
              </span>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: '600',
                padding: '0.15rem 0.4rem',
                borderRadius: '0.25rem',
                background: 'rgba(4, 176, 235, 0.15)',
                color: '#04b0eb',
                textTransform: 'uppercase',
              }}>
                Hammerhead
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              {submittedDate.toLocaleDateString()} {submittedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {selectedTasks.length > 0 && (
                <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>
                  — {selectedTasks.join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
          {/* Vote summary */}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
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
        <div style={{ borderTop: '1px solid var(--border-card)', padding: '1.25rem' }}>
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

            {/* Individual votes */}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end' }}>
                  {rows.map(g => (
                    <div key={g.type} style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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

          {/* General questions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {GENERAL_ORDER.map(key => renderAnswer(key, GENERAL_LABELS[key] || key))}
          </div>

          {/* Task areas */}
          {selectedTasks.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: '600',
                color: 'var(--text-secondary)',
                marginBottom: '0.2rem',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}>
                Selected Task Areas
              </div>
              <div style={{
                display: 'flex',
                gap: '0.35rem',
                flexWrap: 'wrap',
                marginBottom: '0.75rem',
              }}>
                {selectedTasks.map(task => (
                  <span key={task} style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '0.25rem',
                    background: 'rgba(4, 176, 235, 0.12)',
                    border: '1px solid rgba(4, 176, 235, 0.25)',
                    color: '#04b0eb',
                  }}>
                    {task}
                  </span>
                ))}
              </div>

              {selectedTasks.map(taskName => {
                const section = TASK_SECTIONS[taskName];
                if (!section) return null;
                const hasAnswers = section.keys.some(k => app.answers?.[k]);
                if (!hasAnswers) return null;
                return (
                  <div key={taskName} style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    paddingTop: '0.75rem',
                    marginTop: '0.5rem',
                  }}>
                    <div style={{
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      color: '#04b0eb',
                      marginBottom: '0.75rem',
                    }}>
                      {section.label}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {section.keys.map(key => renderAnswer(key, section.labels[key] || key))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Final questions */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: '0.75rem',
            marginTop: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}>
            {FINAL_ORDER.map(key => renderAnswer(key, FINAL_LABELS[key] || key))}
          </div>

          {/* Reviewed info */}
          {app.reviewedBy && (
            <div style={{
              marginTop: '1rem',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}>
              Decided by <strong>{app.reviewedBy}</strong> on {app.reviewedAt ? new Date(app.reviewedAt).toLocaleString() : 'unknown'}
            </div>
          )}

          {/* Decision panel — pending only */}
          {app.status === 'pending' && (
            <div style={{
              marginTop: '1.25rem',
              paddingTop: '1.25rem',
              borderTop: '2px dashed rgba(255, 255, 255, 0.1)',
            }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '0.5rem',
                padding: '1rem 1.25rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M8 1L2 3.5V7.5C2 11.1 4.5 14.4 8 15.5C11.5 14.4 14 11.1 14 7.5V3.5L8 1Z" stroke="#04b0eb" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                    <path d="M6 8L7.5 9.5L10 6.5" stroke="#04b0eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    color: '#04b0eb',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}>
                    Hammerhead Decision
                  </span>
                </div>

                {error && (
                  <p style={{
                    fontSize: '0.8rem',
                    color: '#ef4444',
                    marginBottom: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '0.375rem',
                  }}>
                    {error}
                  </p>
                )}

                {!confirming ? (
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    {(['accepted', 'denied'] as const).map(d => {
                      const cfg = DECISION_CONFIG[d];
                      const isHovered = hoveredBtn === d;
                      return (
                        <button
                          key={d}
                          onClick={() => { setError(null); setConfirming(d); }}
                          onMouseEnter={() => setHoveredBtn(d)}
                          onMouseLeave={() => setHoveredBtn(null)}
                          style={{
                            flex: 1,
                            padding: '0.6rem 1rem',
                            borderRadius: '0.375rem',
                            border: `1px solid ${cfg.color}`,
                            background: isHovered ? cfg.hoverBg : cfg.bg,
                            color: cfg.color,
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: '700',
                            transition: 'background 0.15s ease',
                            fontFamily: 'inherit',
                          }}
                        >
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    <p style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-secondary)',
                      lineHeight: '1.5',
                      marginBottom: '0.75rem',
                    }}>
                      {confirming === 'accepted'
                        ? `Accept ${ign}'s Hammerhead application?`
                        : `Deny ${ign}'s Hammerhead application?`}
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => { setConfirming(null); setError(null); }}
                        disabled={submitting}
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: '0.375rem',
                          border: '1px solid var(--border-card)',
                          background: 'transparent',
                          color: 'var(--text-primary)',
                          cursor: submitting ? 'not-allowed' : 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          opacity: submitting ? 0.5 : 1,
                          fontFamily: 'inherit',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirm}
                        disabled={submitting}
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: '0.375rem',
                          border: 'none',
                          background: DECISION_CONFIG[confirming].color,
                          color: '#fff',
                          cursor: submitting ? 'not-allowed' : 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: '700',
                          opacity: submitting ? 0.7 : 1,
                          fontFamily: 'inherit',
                        }}
                      >
                        {submitting ? 'Submitting...' : DECISION_CONFIG[confirming].confirmLabel}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation modal overlay */}
      {/* (inline approach used instead of modal for simplicity) */}
    </div>
  );
}
