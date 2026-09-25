"use client";

import { useExecSession } from '@/hooks/useExecSession';
import { useProfileData } from '@/hooks/useProfileData';
import { useGraidEvent } from '@/hooks/useGraidEvent';
import { useProfileSnipeStats } from '@/hooks/useProfileSnipeStats';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { getDifficultyColor, ROLE_COLORS } from '@/lib/snipe-constants';
import { formatLePayout, formatPoints } from '@/lib/currency';
import { logoutAndRedirect } from '@/lib/logout-client';
import BackgroundShopModal from '@/components/BackgroundShopModal';
import UniformModal from '@/components/UniformModal';

// --- Formatting utilities ---

function formatNumber(n: number): string {
  const num = parseFloat(n.toPrecision(3));
  if (Math.abs(num) >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
}

function formatPlaytime(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${Math.round(hours)} hrs`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// --- Main component ---

export default function ProfilePage() {
  const { authenticated, loading: authLoading } = useExecSession();
  const { data, loading, error, mutate: mutateProfile } = useProfileData();
  const { eventData, loading: graidLoading } = useGraidEvent();
  const { stats: snipeStats, loading: snipeLoading } = useProfileSnipeStats();
  const router = useRouter();
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [cardError, setCardError] = useState(false);
  const [cardRevision, setCardRevision] = useState(0);
  const [selectedDays, setSelectedDays] = useState(7);
  const [daysInput, setDaysInput] = useState('7');
  const [periodCache, setPeriodCache] = useState<Record<string, { playtime: number; wars: number; raids: number; contributed: number; hasCompleteData: boolean }>>({});
  const [periodLoading, setPeriodLoading] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [uniformOpen, setUniformOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.push('/login');
    }
  }, [authLoading, authenticated, router]);

  const handleCopyPng = useCallback(async () => {
    setCopyStatus('Copying...');
    try {
      const res = await fetch(`/api/profile/card?days=${selectedDays}&v=${cardRevision}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Profile card unavailable');
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('Copied!');
    } catch {
      setCopyStatus('Failed');
    }
    setTimeout(() => setCopyStatus(null), 2000);
  }, [cardRevision, selectedDays]);

  useEffect(() => {
    setCardLoading(true);
    setCardError(false);
  }, [selectedDays, cardRevision]);

  const refreshCard = useCallback(async () => {
    await mutateProfile();
    setCardRevision(value => value + 1);
  }, [mutateProfile]);

  // Auto-fetch period data when selectedDays changes
  useEffect(() => {
    if (!data) return;
    const key = String(selectedDays);
    if (data.timeFrames[key] || periodCache[key]) return;

    let cancelled = false;
    setPeriodLoading(true);

    fetch(`/api/profile?days=${selectedDays}`)
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (!cancelled && json?.timeFrames?.[key]) {
          setPeriodCache(prev => ({ ...prev, [key]: json.timeFrames[key] }));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPeriodLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDays, data]);

  const handleSelectDays = useCallback((days: number) => {
    setSelectedDays(days);
    setDaysInput(String(days));
  }, []);

  const handleDaysInputSubmit = useCallback(() => {
    const val = parseInt(daysInput, 10);
    if (val && val >= 1) {
      setSelectedDays(val);
    }
  }, [daysInput]);

  if (authLoading || loading) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 80px)' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--border-card)', borderTop: '3px solid var(--color-ocean-400)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  if (!authenticated) return null;

  if (error) {
    return (
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#ef4444' }}>We could not load your profile. Refresh the page to try again.</p>
      </main>
    );
  }

  if (!data) return null;

  const { user, stats, timeFrames, graidEvents, totalGraidCompletions, totalGraidEventsParticipated, kickStatus } = data;
  const daysInGuild = daysSince(stats.joined);

  // Get selected time frame data
  const selectedKey = String(selectedDays);
  const selectedTf = timeFrames[selectedKey] || periodCache[selectedKey] || null;

  // Build time preset buttons
  const maxDays = daysInGuild ?? 365;
  const presets: { label: string; days: number }[] = [
    { label: '1d', days: 1 },
    { label: '7d', days: 7 },
    { label: '14d', days: 14 },
    { label: '30d', days: 30 },
  ];
  if (maxDays > 90) presets.push({ label: '90d', days: 90 });
  if (maxDays > 30) presets.push({ label: 'All', days: maxDays });

  // Current graid event status
  const currentGraidEvent = eventData?.event ?? null;
  const isGraidFallback = eventData?.isFallback ?? false;
  const currentGraidRow = currentGraidEvent && !isGraidFallback
    ? (eventData?.rows?.find((r: any) => r.username.toLowerCase() === user.ign.toLowerCase()) ?? null)
    : null;
  const currentGraidPoints = currentGraidRow?.rankingPoints ?? currentGraidRow?.total ?? 0;
  const currentGraidMinimum = currentGraidEvent ? (currentGraidEvent.minPoints ?? currentGraidEvent.minc ?? 0) : 0;
  const cardUrl = `/api/profile/card?days=${selectedDays}&v=${cardRevision}`;

  return (
    <main className="profile-layout">
      {/* ===== LEFT: ACTIVITY TRENDS ===== */}
      <div className="profile-left">
        <div className="profile-panel">
          <div className="profile-panel-header">Activity Trends</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                  <th style={{ textAlign: 'left' }}>Period</th>
                  <th style={{ textAlign: 'right' }}>Playtime</th>
                  <th style={{ textAlign: 'right' }}>Wars</th>
                  <th style={{ textAlign: 'right' }}>Raids</th>
                  <th style={{ textAlign: 'right' }}>XP</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: '7', label: '7 Days' },
                  { key: '14', label: '14 Days' },
                  { key: '30', label: '30 Days' },
                ].map((period) => {
                  const tf = timeFrames[period.key];
                  if (!tf) return null;
                  const isSelected = String(selectedDays) === period.key;
                  return (
                    <tr key={period.key} style={{
                      borderBottom: '1px solid var(--border-card)',
                      background: isSelected ? 'rgba(59,130,246,0.08)' : undefined,
                    }}>
                      <td style={{ fontWeight: '600', color: isSelected ? 'var(--color-ocean-400)' : undefined }}>{period.label}</td>
                      <td style={{ textAlign: 'right' }}>
                        {tf.hasCompleteData ? formatPlaytime(tf.playtime) : '\u2014'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {tf.hasCompleteData ? tf.wars : '\u2014'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {tf.hasCompleteData ? tf.raids : '\u2014'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {tf.hasCompleteData ? formatNumber(tf.contributed) : '\u2014'}
                      </td>
                    </tr>
                  );
                })}

                {/* Show selected period row if it's custom (not 7/14/30) */}
                {!['7', '14', '30'].includes(selectedKey) && selectedTf && (
                  <tr style={{
                    borderBottom: '1px solid var(--border-card)',
                    background: 'rgba(59,130,246,0.08)',
                  }}>
                    <td style={{ fontWeight: '600', color: 'var(--color-ocean-400)' }}>{selectedDays} Days</td>
                    <td style={{ textAlign: 'right' }}>
                      {selectedTf.hasCompleteData ? formatPlaytime(selectedTf.playtime) : '\u2014'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {selectedTf.hasCompleteData ? selectedTf.wars : '\u2014'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {selectedTf.hasCompleteData ? selectedTf.raids : '\u2014'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {selectedTf.hasCompleteData ? formatNumber(selectedTf.contributed) : '\u2014'}
                    </td>
                  </tr>
                )}

                {/* Loading indicator for custom period */}
                {!['7', '14', '30'].includes(selectedKey) && !selectedTf && periodLoading && (
                  <tr style={{ borderBottom: '1px solid var(--border-card)', background: 'rgba(59,130,246,0.05)' }}>
                    <td style={{ fontWeight: '600', color: 'var(--color-ocean-400)' }}>{selectedDays} Days</td>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading activity...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ===== KICK STATUS ===== */}
        <div className="profile-panel" style={{ marginTop: '0.75rem' }}>
          <div className="profile-panel-header">Kick Status</div>
          <div style={{ padding: '0.75rem 1rem' }}>
            {/* In danger of being kicked */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem',
            }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                flexShrink: 0,
                background: kickStatus.isNewMember
                  ? '#3b82f6'
                  : kickStatus.inDanger
                    ? '#ef4444'
                    : '#22c55e',
              }} />
              <span style={{ fontSize: '0.85rem' }}>
                {kickStatus.isNewMember
                  ? 'New member, exempt from kick requirements'
                  : kickStatus.inDanger
                    ? `Below minimum playtime (${kickStatus.weeklyRequirement}h/week)`
                    : `Meeting playtime requirement (${kickStatus.weeklyRequirement}h/week)`}
              </span>
            </div>

            {/* On the kick list */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                flexShrink: 0,
                background: kickStatus.onKickList ? '#ef4444' : '#22c55e',
              }} />
              <span style={{ fontSize: '0.85rem' }}>
                {kickStatus.onKickList
                  ? `On the kick list (Tier ${kickStatus.kickListTier}${
                      kickStatus.kickListTier === 1 ? ': Kick First'
                      : kickStatus.kickListTier === 2 ? ': If Needed'
                      : ': Last Resort'
                    })`
                  : 'Not on the kick list'}
              </span>
            </div>
          </div>
        </div>

        {/* ===== SNIPE STATS ===== */}
        {snipeLoading ? (
          <div className="profile-panel" style={{ marginTop: '0.75rem', padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: "'MinecraftFont', monospace" }}>
            Loading snipe stats...
          </div>
        ) : snipeStats ? (
          <div className="profile-panel" style={{ marginTop: '0.75rem' }}>
            <div className="profile-panel-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>Snipe Stats</span>
              {snipeStats.ranking > 0 && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '400' }}>
                  Rank #{snipeStats.ranking}
                </span>
              )}
            </div>
            <div style={{ padding: '0.5rem 1rem 0.75rem' }}>
              {/* Total snipes */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.4rem',
                fontSize: '0.85rem',
              }}>
                <span>Total Snipes</span>
                <span style={{ fontWeight: '700' }}>{snipeStats.total}</span>
              </div>

              {/* Best difficulty */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.4rem',
                fontSize: '0.85rem',
              }}>
                <span>Best Difficulty</span>
                <span style={{
                  fontWeight: '700',
                  color: getDifficultyColor(snipeStats.bestDifficulty),
                }}>
                  {snipeStats.bestDifficulty}
                </span>
              </div>

              {/* Most Common HQ */}
              {snipeStats.topHqs.length > 0 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.4rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                }}>
                  <span>Top HQ</span>
                  <span style={{ fontWeight: '600', maxWidth: '55%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {snipeStats.topHqs[0].name} ({snipeStats.topHqs[0].count})
                  </span>
                </div>
              )}

              {/* Favorite Duo */}
              {snipeStats.duoPartners.length > 0 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.4rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                }}>
                  <span>Favorite Duo</span>
                  <span style={{ fontWeight: '600', maxWidth: '55%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {snipeStats.duoPartners[0].ign} ({snipeStats.duoPartners[0].count})
                  </span>
                </div>
              )}

              {/* Streaks */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.4rem',
                fontSize: '0.85rem',
              }}>
                <span>Current Streak</span>
                <span style={{ fontWeight: '700' }}>{snipeStats.currentStreak}d</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.4rem',
                fontSize: '0.85rem',
              }}>
                <span>Best Streak</span>
                <span style={{ fontWeight: '700' }}>{snipeStats.bestStreak}d</span>
              </div>

              {/* Dry / Zero-Conn */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
              }}>
                <span>Dry / Zero-Conn</span>
                <span style={{ fontWeight: '600' }}>{snipeStats.drySnipes} / {snipeStats.zeroConnSnipes}</span>
              </div>

              {/* Role breakdown bar */}
              {snipeStats.roleBreakdown.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Roles</div>
                  <div style={{
                    display: 'flex',
                    height: '8px',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    gap: '1px',
                  }}>
                    {snipeStats.roleBreakdown.map(({ role, count }) => (
                      <div
                        key={role}
                        title={`${role}: ${count}`}
                        style={{
                          flex: count,
                          background: ROLE_COLORS[role as keyof typeof ROLE_COLORS] || '#666',
                        }}
                      />
                    ))}
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    marginTop: '0.3rem',
                    fontSize: '0.65rem',
                    color: 'var(--text-secondary)',
                  }}>
                    {snipeStats.roleBreakdown.map(({ role, count }) => (
                      <span key={role} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: ROLE_COLORS[role as keyof typeof ROLE_COLORS] || '#666',
                          display: 'inline-block',
                        }} />
                        {role} {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* ===== CENTER: PROFILE CARD + CONTROLS ===== */}
      <div className="profile-center">
        <div className="profile-card-image-shell" aria-busy={cardLoading}>
          {cardLoading && !cardError && <div className="profile-card-image-placeholder" />}
          {!cardError && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={cardUrl}
              src={cardUrl}
              alt={`${user.ign}'s profile card`}
              className="profile-card-image"
              onLoad={() => setCardLoading(false)}
              onError={() => {
                setCardLoading(false);
                setCardError(true);
              }}
            />
          )}
          {cardError && (
            <div className="profile-card-image-error" role="alert">
              <span>Profile card unavailable</span>
              <button onClick={() => setCardRevision(value => value + 1)}>Retry</button>
            </div>
          )}
        </div>

        {/* Controls: Copy as PNG + Backgrounds + Time frame selector */}
        <div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
          {/* Copy as PNG button */}
          <button
            onClick={handleCopyPng}
            disabled={!!copyStatus || cardLoading || cardError}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-card)',
              borderRadius: '0.5rem',
              padding: '0.5rem 1.25rem',
              color: copyStatus === 'Copied!' ? '#22c55e' : 'var(--text-secondary)',
              fontSize: '0.8rem',
              cursor: copyStatus ? 'default' : 'pointer',
              fontFamily: "'MinecraftFont', monospace",
              letterSpacing: '0.5px',
            }}
          >
            {copyStatus || 'Copy as PNG'}
          </button>
          {/* Backgrounds button */}
          <button
            onClick={() => setShopOpen(true)}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-card)',
              borderRadius: '0.5rem',
              padding: '0.5rem 1.25rem',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontFamily: "'MinecraftFont', monospace",
              letterSpacing: '0.5px',
            }}
          >
            Backgrounds
          </button>
          {/* Uniform button (TAQ-89) */}
          <button
            onClick={() => setUniformOpen(true)}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-card)',
              borderRadius: '0.5rem',
              padding: '0.5rem 1.25rem',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontFamily: "'MinecraftFont', monospace",
              letterSpacing: '0.5px',
            }}
          >
            Uniform
          </button>
        </div>

        {/* Time frame selector */}
        <div style={{ textAlign: 'center' }}>
          <div className="time-controls">
            {presets.map((p) => (
              <button
                key={p.days}
                className={`time-preset-btn${selectedDays === p.days ? ' active' : ''}`}
                onClick={() => handleSelectDays(p.days)}
              >
                {p.label}
              </button>
            ))}
            <input
              type="number"
              className="time-days-input"
              min={1}
              max={maxDays}
              value={daysInput}
              onChange={(e) => setDaysInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDaysInputSubmit(); }}
              onBlur={handleDaysInputSubmit}
            />
            <span className="time-max-label">d</span>
          </div>
          <div className="time-max-label" style={{ marginTop: '0.15rem' }}>
            max: {maxDays} days
          </div>
        </div>
        </div>
      </div>

      {/* ===== RIGHT: GRAID EVENTS ===== */}
      <div className="profile-right">
        {/* Current Graid Event Status */}
        {graidLoading ? (
          <div className="profile-panel" style={{ marginBottom: '0.75rem', padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: "'MinecraftFont', monospace" }}>
            Loading event...
          </div>
        ) : currentGraidEvent && !isGraidFallback ? (
          <div className="profile-panel" style={{
            marginBottom: '0.75rem',
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.25)',
          }}>
            <div className="profile-panel-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ color: 'var(--color-ocean-400)' }}>Active Event</span>
              {currentGraidRow && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '400' }}>
                  Rank #{currentGraidRow.rankNum}
                </span>
              )}
            </div>
            <div style={{ padding: '0.5rem 1rem 0.75rem' }}>
              <div style={{ fontWeight: '700', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                {currentGraidEvent.title}
              </div>
              {/* Point progress */}
              <div style={{ marginBottom: '0.5rem' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: '0.25rem',
                  fontSize: '0.8rem',
                }}>
                  <span>Points</span>
                  <span style={{
                    fontWeight: '700',
                    color: currentGraidPoints >= currentGraidMinimum ? '#22c55e' : '#ef4444',
                  }}>
                    {formatPoints(currentGraidPoints)} / {formatPoints(currentGraidMinimum)}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{
                  height: '6px',
                  borderRadius: '3px',
                  background: 'rgba(255,255,255,0.1)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    borderRadius: '3px',
                    width: `${Math.min(100, (currentGraidPoints / (currentGraidMinimum || 1)) * 100)}%`,
                    background: currentGraidPoints >= currentGraidMinimum
                      ? '#22c55e'
                      : 'var(--color-ocean-400)',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
              {/* Payout */}
              {currentGraidRow && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                }}>
                  <span>Payout</span>
                  <span style={{
                    fontWeight: '600',
                    color: currentGraidRow.meetsMin ? 'var(--text-primary, #e2e8f0)' : 'var(--text-secondary)',
                  }}>
                    {currentGraidRow.meetsMin
                      ? formatLePayout(currentGraidRow.payoutLe ?? currentGraidRow.payout)
                      : 'Below minimum'}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="profile-panel" style={{
            marginBottom: '0.75rem',
            padding: '0.75rem 1rem',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: '0.8rem',
            fontFamily: "'MinecraftFont', monospace",
          }}>
            No active graid event
          </div>
        )}

        {/* Historical Graid Events */}
        <div className="profile-panel">
          <div className="profile-panel-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>Graid Events</span>
            <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '400' }}>
              <span>{totalGraidEventsParticipated} events</span>
              <span>{totalGraidCompletions} completions</span>
            </div>
          </div>
          {graidEvents.length === 0 ? (
            <div style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontFamily: "'MinecraftFont', monospace",
            }}>
              No graid event participation yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                    <th style={{ textAlign: 'left' }}>Event</th>
                    <th style={{ textAlign: 'right' }}>Date</th>
                    <th style={{ textAlign: 'right' }}>Done</th>
                  </tr>
                </thead>
                <tbody>
                  {graidEvents.map((event) => (
                    <tr key={event.id} style={{ borderBottom: '1px solid var(--border-card)' }}>
                      <td style={{ fontWeight: '600' }}>
                        {event.title}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {formatDate(event.startTs)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '700' }}>
                        {event.completions}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Logout */}
      <div className="profile-bottom" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
        <a
          href="/login"
          onClick={logoutAndRedirect}
          style={{
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: '0.8rem',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-card)',
            fontFamily: "'MinecraftFont', monospace",
          }}
        >
          Logout
        </a>
      </div>

      <BackgroundShopModal isOpen={shopOpen} onClose={() => setShopOpen(false)} onBackgroundChange={refreshCard} />
      <UniformModal isOpen={uniformOpen} onClose={() => setUniformOpen(false)} />
    </main>
  );
}
