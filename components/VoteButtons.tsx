"use client";

import { useState } from 'react';

interface VoteSummary {
  accept: number;
  deny: number;
  abstain: number;
}

interface Props {
  applicationId: number;
  currentVote: 'accept' | 'deny' | 'abstain' | null;
  voteSummary: VoteSummary;
  disabled?: boolean;
  onVoteChange: (newVote: string | null, newSummary: VoteSummary) => void;
}

const VOTE_CONFIG = {
  accept: { label: 'Accept', color: '#22c55e', hoverBg: 'rgba(34, 197, 94, 0.15)' },
  abstain: { label: 'Abstain', color: '#6b7280', hoverBg: 'rgba(107, 114, 128, 0.15)' },
  deny: { label: 'Deny', color: '#ef4444', hoverBg: 'rgba(239, 68, 68, 0.15)' },
} as const;

export default function VoteButtons({ applicationId, currentVote, voteSummary, disabled, onVoteChange }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const handleVote = async (vote: 'accept' | 'deny' | 'abstain') => {
    if (submitting || disabled) return;

    setSubmitting(true);
    try {
      if (currentVote === vote) {
        // Remove vote
        const res = await fetch(`/api/exec/applications/${applicationId}/vote`, {
          method: 'DELETE',
        });
        if (res.ok) {
          const data = await res.json();
          onVoteChange(null, data.voteSummary);
        }
      } else {
        // Cast/change vote
        const res = await fetch(`/api/exec/applications/${applicationId}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vote }),
        });
        if (res.ok) {
          const data = await res.json();
          onVoteChange(data.vote, data.voteSummary);
        }
      }
    } catch (err) {
      console.error('Vote error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      gap: '0.5rem',
      alignItems: 'center',
    }}>
      {(Object.keys(VOTE_CONFIG) as Array<keyof typeof VOTE_CONFIG>).map(vote => {
        const config = VOTE_CONFIG[vote];
        const isActive = currentVote === vote;
        const count = voteSummary[vote];

        return (
          <button
            key={vote}
            onClick={() => handleVote(vote)}
            disabled={submitting || disabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.375rem 0.75rem',
              borderRadius: '0.375rem',
              border: `1px solid ${isActive ? config.color : 'var(--border-card)'}`,
              background: isActive ? config.hoverBg : 'transparent',
              color: isActive ? config.color : 'var(--text-secondary)',
              cursor: submitting || disabled ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem',
              fontWeight: '600',
              opacity: submitting ? 0.6 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isActive && !submitting && !disabled) {
                e.currentTarget.style.borderColor = config.color;
                e.currentTarget.style.color = config.color;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive && !submitting && !disabled) {
                e.currentTarget.style.borderColor = 'var(--border-card)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }
            }}
          >
            {config.label}
            <span style={{
              fontSize: '0.7rem',
              background: isActive ? config.color : 'rgba(255,255,255,0.1)',
              color: isActive ? '#fff' : 'var(--text-secondary)',
              padding: '0.1rem 0.35rem',
              borderRadius: '0.25rem',
              minWidth: '18px',
              textAlign: 'center',
            }}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
