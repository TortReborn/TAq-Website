"use client";

import { useState, useEffect, useRef } from 'react';

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

const MAX_IMAGE_SIZE = 3 * 1024 * 1024; // 3MB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function DecisionPanel({ applicationId, applicantIgn, applicationType, onDecision }: DecisionPanelProps) {
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<Decision | null>(null);
  const [hoveredConfirm, setHoveredConfirm] = useState(false);
  const [hoveredCancel, setHoveredCancel] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGuildAccept = confirming === 'accepted' && applicationType === 'guild';

  // Close modal on Escape
  useEffect(() => {
    if (!confirming) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) closeModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [confirming, submitting]);

  const closeModal = () => {
    if (submitting) return;
    setConfirming(null);
    setImagePreview(null);
    setImageError(null);
  };

  const handleImageFile = async (file: File) => {
    setImageError(null);
    if (!file.type.startsWith('image/')) {
      setImageError('Please select an image file.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageError('Image too large (max 3MB).');
      return;
    }
    const base64 = await fileToBase64(file);
    setImagePreview(base64);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  };

  const handleConfirm = async () => {
    if (!confirming || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, string> = { decision: confirming };
      if (isGuildAccept && imagePreview) {
        payload.inviteImage = imagePreview;
      }

      const res = await fetch(`/api/exec/applications/${applicationId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to submit decision');
        return;
      }

      onDecision(data.status, data.reviewedAt, data.reviewedBy);
      setConfirming(null);
      setImagePreview(null);
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
          onClick={closeModal}
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
              maxWidth: '460px',
              width: '90%',
            }}
          >
            {/* Warning icon + title */}
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

            {/* Image upload — guild accepts only */}
            {isGuildAccept && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{
                  fontSize: '0.78rem',
                  fontWeight: '600',
                  color: 'var(--text-secondary)',
                  display: 'block',
                  marginBottom: '0.5rem',
                }}>
                  Attach Invite Screenshot (optional)
                </label>

                {!imagePreview ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    style={{
                      border: `2px dashed ${dragOver ? '#15803d' : 'rgba(255, 255, 255, 0.12)'}`,
                      borderRadius: '0.5rem',
                      padding: '1.25rem',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: dragOver ? 'rgba(21, 128, 61, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                      transition: 'border-color 0.15s ease, background 0.15s ease',
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 0.5rem', display: 'block' }}>
                      <path d="M12 16V8M12 8L9 11M12 8L15 11" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M20 16.7V19C20 20.1 19.1 21 18 21H6C4.9 21 4 20.1 4 19V16.7" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                      Drop image here or click to browse
                    </p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.6, margin: '0.25rem 0 0' }}>
                      Max 3MB
                    </p>
                  </div>
                ) : (
                  <div style={{
                    position: 'relative',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '0.5rem',
                    overflow: 'hidden',
                  }}>
                    <img
                      src={imagePreview}
                      alt="Invite screenshot"
                      style={{
                        display: 'block',
                        maxWidth: '100%',
                        maxHeight: '200px',
                        objectFit: 'contain',
                        margin: '0 auto',
                        background: 'rgba(0,0,0,0.2)',
                      }}
                    />
                    <button
                      onClick={() => { setImagePreview(null); setImageError(null); }}
                      style={{
                        position: 'absolute',
                        top: '0.4rem',
                        right: '0.4rem',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        border: 'none',
                        background: 'rgba(0, 0, 0, 0.7)',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      X
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleImageFile(file);
                    e.target.value = '';
                  }}
                />

                {imageError && (
                  <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.4rem' }}>
                    {imageError}
                  </p>
                )}
              </div>
            )}

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
                onClick={closeModal}
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
