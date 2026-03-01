"use client";

import { useState } from 'react';
import { KickListEntry } from '@/hooks/useKickList';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TIER_CONFIG = [
  { tier: 1, label: 'Tier 1 — Kick First', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.25)' },
  { tier: 2, label: 'Tier 2 — If Needed', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.25)' },
  { tier: 3, label: 'Tier 3 — Last Resort', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.25)' },
];

interface KickListPanelProps {
  entries: KickListEntry[];
  lastUpdated: string | null;
  lastUpdatedBy: string | null;
  loading: boolean;
  members?: { username: string; uuid: string; discordRank: string }[];
  memberCount?: number;
  pendingJoins?: number;
  onAdd?: (uuid: string, ign: string, tier: number) => void;
  onRemove: (uuid: string) => void;
  onChangeTier: (uuid: string, tier: number) => void;
}

export default function KickListPanel({
  entries,
  lastUpdated,
  lastUpdatedBy,
  loading,
  members,
  memberCount: memberCountProp,
  pendingJoins = 0,
  onAdd,
  onRemove,
  onChangeTier,
}: KickListPanelProps) {
  const [search, setSearch] = useState('');
  const [selectedTier, setSelectedTier] = useState(1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [collapsedTiers, setCollapsedTiers] = useState<Record<number, boolean>>({});

  const kickUuids = new Set(entries.map(e => e.uuid));
  const filtered = search.length >= 2 && members
    ? members.filter(m =>
        m.username.toLowerCase().includes(search.toLowerCase()) && !kickUuids.has(m.uuid)
      ).slice(0, 8)
    : [];

  const toggleTier = (tier: number) => {
    setCollapsedTiers(prev => ({ ...prev, [tier]: !prev[tier] }));
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '0.75rem',
      border: '1px solid var(--border-card)',
      padding: '1.25rem',
      height: 'fit-content',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{
          fontSize: '1.1rem',
          fontWeight: '700',
          color: 'var(--text-primary)',
          margin: 0,
        }}>
          Kick List
        </h2>
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          marginTop: '0.25rem',
        }}>
          {(() => {
            const count = members ? members.length : memberCountProp;
            if (!count) return null;
            const effectiveCount = count + pendingJoins;
            const openSlots = 150 - effectiveCount;
            return (
              <div style={{ marginBottom: '0.15rem' }}>
                <span style={{
                  color: openSlots <= 0 ? '#ef4444' : openSlots <= 5 ? '#f59e0b' : 'var(--text-secondary)',
                  fontWeight: openSlots <= 5 ? '600' : '400',
                }}>
                  {openSlots} open slot{openSlots !== 1 ? 's' : ''}
                </span>
                {pendingJoins > 0 && (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {' '}({pendingJoins} accepted, pending join)
                  </span>
                )}
              </div>
            );
          })()}
          Last updated: {lastUpdated ? `${timeAgo(lastUpdated)} by ${lastUpdatedBy}` : 'Never'}
        </div>
      </div>

      {/* Add player (only when members data is available) */}
      {members && onAdd && (
        <>
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              <input
                type="text"
                placeholder="Add player..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                style={{
                  flex: 1,
                  padding: '0.4rem 0.6rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  minWidth: 0,
                }}
              />
              <select
                value={selectedTier}
                onChange={(e) => setSelectedTier(Number(e.target.value))}
                style={{
                  padding: '0.4rem 0.4rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                <option value={1}>T1</option>
                <option value={2}>T2</option>
                <option value={3}>T3</option>
              </select>
            </div>

            {/* Search dropdown */}
            {showDropdown && filtered.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '0.25rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-card)',
                borderRadius: '0.375rem',
                overflow: 'hidden',
                zIndex: 20,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}>
                {filtered.map(m => (
                  <button
                    key={m.uuid}
                    onClick={() => {
                      onAdd(m.uuid, m.username, selectedTier);
                      setSearch('');
                      setShowDropdown(false);
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      width: '100%',
                      padding: '0.5rem 0.6rem',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontWeight: 600 }}>{m.username}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{m.discordRank}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Close dropdown on outside click */}
          {showDropdown && (
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 10 }}
              onClick={() => setShowDropdown(false)}
            />
          )}
        </>
      )}

      {/* Tier sections */}
      {loading && entries.length === 0 ? (
        <div style={{
          color: 'var(--text-secondary)',
          fontSize: '0.8rem',
          textAlign: 'center',
          padding: '1rem 0',
        }}>
          Loading...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {TIER_CONFIG.map(tc => {
            const tierEntries = entries.filter(e => e.tier === tc.tier);
            const collapsed = collapsedTiers[tc.tier] ?? false;

            return (
              <div key={tc.tier} style={{
                border: `1px solid ${tc.border}`,
                borderRadius: '0.5rem',
                overflow: 'hidden',
              }}>
                {/* Tier header */}
                <button
                  onClick={() => toggleTier(tc.tier)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: 'none',
                    background: tc.bg,
                    color: tc.color,
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                  }}
                >
                  <span>{tc.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: '600',
                      background: `${tc.color}20`,
                      padding: '0.1rem 0.4rem',
                      borderRadius: '0.25rem',
                    }}>
                      {tierEntries.length}
                    </span>
                    <span style={{ fontSize: '0.65rem' }}>{collapsed ? '▶' : '▼'}</span>
                  </span>
                </button>

                {/* Tier entries */}
                {!collapsed && (
                  <div style={{ padding: tierEntries.length > 0 ? '0.25rem 0' : 0 }}>
                    {tierEntries.length === 0 ? (
                      <div style={{
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic',
                      }}>
                        No players
                      </div>
                    ) : (
                      tierEntries.map(entry => (
                        <div key={entry.uuid} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.8rem',
                        }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                              {entry.ign}
                            </div>
                            <div style={{
                              fontSize: '0.65rem',
                              color: 'var(--text-secondary)',
                            }}>
                              by {entry.addedBy}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                            {/* Move tier buttons */}
                            {tc.tier > 1 && (
                              <button
                                onClick={() => onChangeTier(entry.uuid, tc.tier - 1)}
                                title={`Move to Tier ${tc.tier - 1}`}
                                style={{
                                  padding: '0.15rem 0.3rem',
                                  border: '1px solid var(--border-card)',
                                  borderRadius: '0.25rem',
                                  background: 'transparent',
                                  color: 'var(--text-secondary)',
                                  cursor: 'pointer',
                                  fontSize: '0.6rem',
                                  lineHeight: 1,
                                }}
                              >
                                ▲
                              </button>
                            )}
                            {tc.tier < 3 && (
                              <button
                                onClick={() => onChangeTier(entry.uuid, tc.tier + 1)}
                                title={`Move to Tier ${tc.tier + 1}`}
                                style={{
                                  padding: '0.15rem 0.3rem',
                                  border: '1px solid var(--border-card)',
                                  borderRadius: '0.25rem',
                                  background: 'transparent',
                                  color: 'var(--text-secondary)',
                                  cursor: 'pointer',
                                  fontSize: '0.6rem',
                                  lineHeight: 1,
                                }}
                              >
                                ▼
                              </button>
                            )}
                            {/* Remove button */}
                            <button
                              onClick={() => onRemove(entry.uuid)}
                              title="Remove from kick list"
                              style={{
                                padding: '0.15rem 0.35rem',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '0.25rem',
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444',
                                cursor: 'pointer',
                                fontSize: '0.65rem',
                                lineHeight: 1,
                                fontWeight: 700,
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
