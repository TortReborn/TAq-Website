"use client";

import { useState, useEffect } from 'react';

interface DecisionPanelProps {
  applicationId: number;
  applicantIgn: string;
  applicationType: string;
  onDecision: (status: string, reviewedAt: string, reviewedBy: string) => void;
}

const DECISION_CONFIG = {
  accepted: {
    label: 'Accept Application',
    confirmLabel: 'Confirm Accept',
    color: '#15803d',
    bg: 'rgba(21, 128, 61, 0.15)',
    hoverBg: 'rgba(21, 128, 61, 0.25)',
  },
  denied: {
    label: 'Deny Application',
    confirmLabel: 'Confirm Deny',
    color: '#b91c1c',
    bg: 'rgba(185, 28, 28, 0.15)',
    hoverBg: 'rgba(185, 28, 28, 0.25)',
  },
} as const;

type Decision = keyof typeof DECISION_CONFIG;

export default function DecisionPanel({ applicationId, applicantIgn, applicationType, onDecision }: DecisionPanelProps) {
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<Decision | null>(null);
  const [hoveredConfirm, setHoveredConfirm] = useState(false);
  const [hoveredCancel, setHoveredCancel] = useState(false);

  // Close modal on Escape
  useEffect(() => {
    if (!confirming) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) setConfirming(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [confirming, submitting]);

  const handleConfirm = async () => {
    if (!confirming || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/exec/applications/${applicationId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: confirming }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to submit decision');
        return;
      }

      onDecision(data.status, data.reviewedAt, data.reviewedBy);
      setConfirming(null);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmMessage = confirming === 'accepted'
    ? `Accept ${applicantIgn}'s ${applicationType} application? The bot will handle Discord roles and messages automatically.`
    : `Deny ${applicantIgn}'s ${applicationType} application? The bot will notify the applicant and close the thread.`;

  return (
    <>
      {/* Decision panel */}
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
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.5rem',
          }}>
            {/* Shield icon */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <path d="M8 1L2 3.5V7.5C2 11.1 4.5 14.4 8 15.5C11.5 14.4 14 11.1 14 7.5V3.5L8 1Z" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
              <path d="M6 8L7.5 9.5L10 6.5" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: '700',
              color: '#f59e0b',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              HR Decision
            </span>
          </div>

          <p style={{
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            marginBottom: '0.75rem',
            lineHeight: '1.4',
          }}>
            Final decision for this application. This cannot be undone.
          </p>

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
                  }}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {confirming && (
        <div
          onClick={() => !submitting && setConfirming(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-card)',
              borderRadius: '0.75rem',
              padding: '1.75rem',
              maxWidth: '420px',
              width: '90%',
            }}
          >
            {/* Warning icon */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
            }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L1 18H19L10 2Z" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(245, 158, 11, 0.1)" />
                <path d="M10 8V12" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="10" cy="15" r="0.75" fill="#f59e0b" />
              </svg>
              <span style={{
                fontSize: '1rem',
                fontWeight: '700',
                color: 'var(--text-primary)',
              }}>
                Confirm Decision
              </span>
            </div>

            <p style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              lineHeight: '1.5',
              marginBottom: '1.25rem',
            }}>
              {confirmMessage}
            </p>

            {error && (
              <p style={{
                fontSize: '0.8rem',
                color: '#ef4444',
                marginBottom: '1rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '0.375rem',
              }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirming(null)}
                disabled={submitting}
                onMouseEnter={() => setHoveredCancel(true)}
                onMouseLeave={() => setHoveredCancel(false)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-card)',
                  background: hoveredCancel ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                  color: 'var(--text-primary)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  opacity: submitting ? 0.5 : 1,
                  transition: 'background 0.15s ease',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                onMouseEnter={() => setHoveredConfirm(true)}
                onMouseLeave={() => setHoveredConfirm(false)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: hoveredConfirm
                    ? DECISION_CONFIG[confirming].hoverBg
                    : DECISION_CONFIG[confirming].color,
                  color: '#fff',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  opacity: submitting ? 0.7 : 1,
                  transition: 'background 0.15s ease',
                }}
              >
                {submitting ? 'Submitting...' : DECISION_CONFIG[confirming].confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
