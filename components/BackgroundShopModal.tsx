'use client';

import { useState, useEffect, useCallback } from 'react';
import { useBackgroundShop } from '@/hooks/useBackgroundShop';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function BackgroundShopModal({ isOpen, onClose }: Props) {
  const { data, loading, error, purchaseBackground, setActiveBackground } = useBackgroundShop();
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handlePurchase = useCallback(async (id: number) => {
    setActionError(null);
    setActionLoading(id);
    const result = await purchaseBackground(id);
    setActionLoading(null);
    setConfirmingId(null);
    if (result.error) {
      setActionError(result.error);
    }
  }, [purchaseBackground]);

  const handleSetActive = useCallback(async (id: number) => {
    setActionError(null);
    setActionLoading(id);
    const result = await setActiveBackground(id);
    setActionLoading(null);
    if (result.error) {
      setActionError(result.error);
    }
  }, [setActiveBackground]);

  if (!isOpen) return null;

  const backgrounds = data?.backgrounds ?? [];
  const owned = data?.owned ?? [1];
  const activeId = data?.activeId ?? 0;
  const shellsBalance = data?.shellsBalance ?? 0;

  // Sort: default (id 1) first, then the rest by price
  const allBackgrounds = [...backgrounds].sort((a, b) => {
    if (a.id === 1) return -1;
    if (b.id === 1) return 1;
    return a.price - b.price || a.id - b.id;
  });

  return (
    <div className="bg-shop-overlay" onClick={onClose}>
      <div className="bg-shop-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--border-card)',
        }}>
          <h2 style={{
            margin: 0,
            fontFamily: "'MinecraftFont', monospace",
            fontSize: '1.1rem',
            color: 'var(--text-primary)',
            letterSpacing: '0.5px',
          }}>
            Backgrounds
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{
              fontFamily: "'GameFont', monospace",
              fontSize: '0.9rem',
              color: '#f5c842',
            }}>
              {shellsBalance} shells
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0 0.25rem',
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>
        </div>

        {/* Error banner */}
        {actionError && (
          <div style={{
            background: 'rgba(220, 38, 38, 0.15)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            borderRadius: '0.5rem',
            padding: '0.5rem 0.75rem',
            marginBottom: '0.75rem',
            color: '#fca5a5',
            fontSize: '0.8rem',
            fontFamily: "'MinecraftFont', monospace",
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '1rem' }}
            >
              &times;
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '3rem 0',
            color: 'var(--text-secondary)',
            fontFamily: "'MinecraftFont', monospace",
          }}>
            Loading backgrounds...
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div style={{
            textAlign: 'center',
            padding: '3rem 0',
            color: '#fca5a5',
            fontFamily: "'MinecraftFont', monospace",
          }}>
            Failed to load backgrounds
          </div>
        )}

        {/* Grid */}
        {!loading && !error && (
          <div className="bg-shop-grid">
            {allBackgrounds.map(bg => {
              const isOwned = owned.includes(bg.id);
              const isActive = activeId === bg.id;
              const isConfirming = confirmingId === bg.id;
              const isLoading = actionLoading === bg.id;
              const canPurchase = !isOwned && bg.price > 0;
              const isExclusive = !isOwned && bg.price === 0 && bg.id !== 1;

              return (
                <div
                  key={bg.id}
                  className="bg-shop-card"
                  style={{
                    border: isActive
                      ? '2px solid #22c55e'
                      : '1px solid var(--border-card)',
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '800 / 526',
                    overflow: 'hidden',
                    borderRadius: '0.375rem 0.375rem 0 0',
                    background: 'var(--bg-secondary)',
                  }}>
                    <img
                      src={`/api/profile-background/${bg.id}`}
                      alt={bg.name}
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />

                    {/* Status badge */}
                    {isActive && (
                      <div style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        background: '#22c55e',
                        color: '#fff',
                        fontSize: '0.6rem',
                        fontFamily: "'PixelFont5x5', monospace",
                        padding: '2px 6px',
                        borderRadius: '3px',
                        letterSpacing: '0.5px',
                      }}>
                        ACTIVE
                      </div>
                    )}
                    {!isActive && isOwned && (
                      <div style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        background: '#3b82f6',
                        color: '#fff',
                        fontSize: '0.6rem',
                        fontFamily: "'PixelFont5x5', monospace",
                        padding: '2px 6px',
                        borderRadius: '3px',
                        letterSpacing: '0.5px',
                      }}>
                        OWNED
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ padding: '0.5rem 0.6rem' }}>
                    <div style={{
                      fontFamily: "'MinecraftFont', monospace",
                      fontSize: '0.8rem',
                      color: 'var(--text-primary)',
                      marginBottom: '0.2rem',
                      letterSpacing: '0.3px',
                    }}>
                      {bg.name}
                    </div>
                    {bg.description && (
                      <div style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-secondary)',
                        marginBottom: '0.4rem',
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {bg.description}
                      </div>
                    )}

                    {/* Action area */}
                    <div style={{ minHeight: '1.75rem', display: 'flex', alignItems: 'center' }}>
                      {isActive && (
                        <span style={{
                          fontSize: '0.7rem',
                          color: '#22c55e',
                          fontFamily: "'MinecraftFont', monospace",
                        }}>
                          Currently Active
                        </span>
                      )}

                      {isOwned && !isActive && (
                        <button
                          onClick={() => handleSetActive(bg.id)}
                          disabled={isLoading}
                          className="bg-shop-btn bg-shop-btn-set"
                        >
                          {isLoading ? '...' : 'Set Active'}
                        </button>
                      )}

                      {canPurchase && !isConfirming && (
                        <button
                          onClick={() => {
                            setConfirmingId(bg.id);
                            setActionError(null);
                          }}
                          disabled={shellsBalance < bg.price || isLoading}
                          className="bg-shop-btn bg-shop-btn-buy"
                          style={{
                            opacity: shellsBalance < bg.price ? 0.5 : 1,
                          }}
                          title={shellsBalance < bg.price ? `Need ${bg.price} shells (you have ${shellsBalance})` : ''}
                        >
                          {bg.price} shells
                        </button>
                      )}

                      {canPurchase && isConfirming && (
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <button
                            onClick={() => handlePurchase(bg.id)}
                            disabled={isLoading}
                            className="bg-shop-btn bg-shop-btn-confirm"
                          >
                            {isLoading ? '...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            disabled={isLoading}
                            className="bg-shop-btn bg-shop-btn-cancel"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {isExclusive && (
                        <span style={{
                          fontSize: '0.65rem',
                          color: 'var(--text-secondary)',
                          fontFamily: "'MinecraftFont', monospace",
                          opacity: 0.6,
                        }}>
                          Exclusive
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Custom Background promo card */}
            <div
              className="bg-shop-card"
              style={{
                border: '1px dashed var(--border-card)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{
                width: '100%',
                aspectRatio: '800 / 526',
                borderRadius: '0.375rem 0.375rem 0 0',
                background: 'linear-gradient(135deg, rgba(245,200,66,0.1), rgba(59,130,246,0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.5rem',
              }}>
                🎨
              </div>
              <div style={{ padding: '0.5rem 0.6rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  fontFamily: "'MinecraftFont', monospace",
                  fontSize: '0.8rem',
                  color: 'var(--text-primary)',
                  marginBottom: '0.2rem',
                  letterSpacing: '0.3px',
                }}>
                  Custom Background
                </div>
                <div style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '0.4rem',
                  lineHeight: 1.3,
                }}>
                  Submit your own image as a profile background! Contact an exec to purchase.
                </div>
                <div style={{ minHeight: '1.75rem', display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: "'MinecraftFont', monospace",
                    fontSize: '0.7rem',
                    color: '#f5c842',
                  }}>
                    300 shells
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
