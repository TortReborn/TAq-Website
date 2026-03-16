"use client";

import { useExecSession } from '@/hooks/useExecSession';
import { useProfileData } from '@/hooks/useProfileData';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getRankColor, getWynnRankInfo } from '@/lib/rank-constants';
import { toPng } from 'html-to-image';
import BackgroundShopModal from '@/components/BackgroundShopModal';

// --- HSV color utilities (porting bot's Color class from Helpers/functions.py) ---

function hexToRgbArr(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  ).join('');
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 1) + 1) % 1;
  s = Math.max(0, Math.min(1, s));
  v = Math.max(0, Math.min(1, v));
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r: number, g: number, b: number;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function getEdgeGradientColors(hex: string): { light: string; shadow: string } {
  const [r, g, b] = hexToRgbArr(hex);
  const [h, s, v] = rgbToHsv(r, g, b);
  return {
    light: rgbToHex(...hsvToRgb(h + 0.03, s, Math.min(v + 0.15, 1))),
    shadow: rgbToHex(...hsvToRgb(h - 0.03, s, Math.max(v - 0.10, 0))),
  };
}

function getBadgeColors(hex: string): { light: string; shadow: string; text: string } {
  const [r, g, b] = hexToRgbArr(hex);
  const [h, s, v] = rgbToHsv(r, g, b);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000 / 255;
  return {
    light: rgbToHex(...hsvToRgb(h, Math.max(s - 0.20, 0), Math.min(v + 0.09, 1))),
    shadow: rgbToHex(...hsvToRgb(h, Math.min(s + 0.15, 1), Math.max(v - 0.15, 0))),
    text: brightness < 0.5 ? '#ffffff' : '#000000',
  };
}

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

function parseGradient(gradient: string[] | string | null | undefined): [string, string] {
  if (Array.isArray(gradient) && gradient.length >= 2) {
    return [gradient[0], gradient[1]];
  }
  if (typeof gradient === 'string') {
    try {
      const parsed = JSON.parse(gradient);
      if (Array.isArray(parsed) && parsed.length >= 2) return [parsed[0], parsed[1]];
    } catch { /* not JSON */ }
    const parts = gradient.split(',').map((s: string) => s.trim());
    if (parts.length >= 2 && parts[0].startsWith('#')) return [parts[0], parts[1]];
  }
  return ['#293786', '#1d275e'];
}

// --- Badge component (matching bot's generate_badge() 3D beveled style) ---

function ProfileBadge({ label, baseColor }: { label: string; baseColor: string }) {
  const { light, shadow, text } = getBadgeColors(baseColor);
  return (
    <span
      className="profile-badge"
      style={{
        background: baseColor,
        borderTopColor: light,
        borderLeftColor: light,
        borderBottomColor: shadow,
        borderRightColor: shadow,
        color: text,
        textShadow: `1px 1px 0 ${shadow}`,
      }}
    >
      {label}
    </span>
  );
}

// --- Main component ---

export default function ProfilePage() {
  const { authenticated, loading: authLoading } = useExecSession();
  const { data, loading, error, mutate: mutateProfile } = useProfileData();
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [cardScale, setCardScale] = useState(1);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState(7);
  const [daysInput, setDaysInput] = useState('7');
  const [periodCache, setPeriodCache] = useState<Record<string, { playtime: number; wars: number; raids: number; contributed: number; hasCompleteData: boolean }>>({});
  const [periodLoading, setPeriodLoading] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);

  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.push('/login');
    }
  }, [authLoading, authenticated, router]);

  // Reset bgLoaded when background changes
  const bgId = data?.customization?.backgroundId || 1;
  useEffect(() => {
    setBgLoaded(false);
  }, [bgId]);

  // Scale card to fit viewport while preserving aspect ratio
  useEffect(() => {
    const card = cardRef.current;
    const wrapper = wrapperRef.current;
    if (!card || !wrapper) return;

    let measuring = false;
    const updateScale = () => {
      if (measuring) return;
      measuring = true;
      // Temporarily reset scale to measure natural height
      card.style.transform = 'none';
      wrapper.style.height = 'auto';
      const naturalHeight = card.offsetHeight;
      // Measure how far the top of the card is from viewport top
      const cardTop = wrapper.getBoundingClientRect().top + window.scrollY;
      // Measure controls below the card
      const controlsHeight = controlsRef.current?.offsetHeight || 0;
      const availableHeight = window.innerHeight - cardTop - controlsHeight - 24;
      const scale = naturalHeight > availableHeight ? availableHeight / naturalHeight : 1;
      setCardScale(scale);
      card.style.transform = `scale(${scale})`;
      // Adjust wrapper height so elements below don't overlap
      wrapper.style.height = `${naturalHeight * scale}px`;
      measuring = false;
    };

    // Small delay to ensure layout is settled before first measurement
    requestAnimationFrame(updateScale);
    const observer = new ResizeObserver(updateScale);
    observer.observe(card);
    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [data]);

  const handleCopyPng = useCallback(async () => {
    if (!cardRef.current) return;
    setCopyStatus('Capturing...');
    try {
      // Temporarily reset scale for full-resolution capture
      const prevTransform = cardRef.current.style.transform;
      cardRef.current.style.transform = 'none';
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });
      cardRef.current.style.transform = prevTransform;
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('Copied!');
    } catch {
      setCopyStatus('Failed');
    }
    setTimeout(() => setCopyStatus(null), 2000);
  }, []);

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
        <p style={{ color: '#ef4444' }}>Failed to load profile data. Please try again later.</p>
      </main>
    );
  }

  if (!data) return null;

  const { user, stats, wynnRank, customization, shellsBalance, timeFrames, graidEvents, totalGraidCompletions, totalGraidEventsParticipated, kickStatus } = data;
  const daysInGuild = daysSince(stats.joined);
  const rankColor = getRankColor(user.rank);
  const [gradColor1, gradColor2] = parseGradient(customization?.gradient);
  const cleanUuid = user.uuid.replace(/-/g, '');

  // Wynncraft rank info (VIP, CHAMPION, etc.) — used for edge outline color
  const wynnInfo = getWynnRankInfo(wynnRank);
  const wynnRankDisplay = wynnInfo?.display || 'PLAYER';
  const wynnRankColor = wynnInfo?.color || '#66ccff';
  const edgeColors = getEdgeGradientColors(wynnRankColor);

  // Get selected time frame data
  const selectedKey = String(selectedDays);
  const selectedTf = timeFrames[selectedKey] || periodCache[selectedKey] || null;

  // Build stat entries using selected time frame
  const statEntries: { label: string; value: string }[] = [];

  if (stats.online) {
    statEntries.push({ label: 'World', value: stats.server || 'Online' });
  } else {
    statEntries.push({ label: 'Last Seen', value: stats.lastJoin ? formatDate(stats.lastJoin) : 'Unknown' });
  }
  statEntries.push({ label: 'Shells', value: String(shellsBalance) });
  statEntries.push({ label: 'Playtime', value: `${Math.round(stats.playtime)} hrs` });
  if (selectedTf?.hasCompleteData) {
    statEntries.push({ label: `Playtime / ${selectedDays}D`, value: `${Math.round(selectedTf.playtime)} hrs` });
  }
  statEntries.push({ label: 'Wars', value: String(stats.wars) });
  if (selectedTf?.hasCompleteData) {
    statEntries.push({ label: `Wars / ${selectedDays}D`, value: String(selectedTf.wars) });
  }
  statEntries.push({ label: 'Guild XP', value: formatNumber(stats.contributed) });
  if (selectedTf?.hasCompleteData) {
    statEntries.push({ label: `Guild XP / ${selectedDays}D`, value: formatNumber(selectedTf.contributed) });
  }
  statEntries.push({ label: 'Guild Raids', value: String(stats.raids) });
  if (selectedTf?.hasCompleteData) {
    statEntries.push({ label: `Guild Raids / ${selectedDays}D`, value: String(selectedTf.raids) });
  }

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
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td>
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
                  ? 'New member — exempt from kick requirements'
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
                      kickStatus.kickListTier === 1 ? ' — Kick First'
                      : kickStatus.kickListTier === 2 ? ' — If Needed'
                      : ' — Last Resort'
                    })`
                  : 'Not on the kick list'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== CENTER: PROFILE CARD + CONTROLS ===== */}
      <div className="profile-center">
        {/* Hidden preloader for background image (outside cardRef so it won't appear in Copy as PNG) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/profile-background/${customization?.backgroundId || 1}`}
          alt=""
          style={{ display: 'none' }}
          onLoad={() => setBgLoaded(true)}
        />

        {/* Profile Card — scaled wrapper preserves proportions to fit viewport */}
        <div ref={wrapperRef} className="profile-card-wrapper">
        <div
          ref={cardRef}
          className="profile-card profile-card-scaled"
          style={{
            background: `linear-gradient(180deg, ${edgeColors.light}, ${edgeColors.shadow})`,
            transform: `scale(${cardScale})`,
          }}
        >
          <div style={{
            background: `linear-gradient(180deg, ${gradColor1}, ${gradColor2})`,
            borderRadius: '12px',
            padding: '20px 25px 30px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Header: Player name (left) + Shells balance (right) */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '8px',
            }}>
              <h1 className="profile-card-name" style={{ margin: 0 }}>
                {user.ign}
              </h1>
              {shellsBalance > 0 && (
                <div className="profile-card-balance" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  {shellsBalance}
                  <img
                    src="/images/profile/shells.png"
                    alt="shells"
                    style={{ width: 22, height: 22, imageRendering: 'pixelated' }}
                  />
                </div>
              )}
            </div>

            {/* Wynncraft rank badge - centered at TOP of background area */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '-16px',
              position: 'relative',
              zIndex: 2,
            }}>
              <ProfileBadge label={wynnRankDisplay} baseColor={wynnRankColor} />
            </div>

            {/* Background area with gradient outline */}
            <div style={{
              background: `linear-gradient(180deg, ${edgeColors.shadow}, ${edgeColors.light})`,
              borderRadius: '12px',
              padding: '5px',
              marginBottom: '8px',
            }}>
              <div style={{
                borderRadius: '8px',
                height: '280px',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative',
                backgroundImage: bgLoaded
                  ? `url(/api/profile-background/${customization?.backgroundId || 1})`
                  : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}>
                {!bgLoaded && <div className="profile-bg-shimmer" />}
                <img
                  src={`https://visage.surgeplay.com/bust/480/${cleanUuid}`}
                  alt={user.ign}
                  style={{
                    maxHeight: '260px',
                    imageRendering: 'pixelated',
                    filter: 'drop-shadow(4px 4px 8px rgba(0,0,0,0.5))',
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://mc-heads.net/avatar/${cleanUuid}/128`;
                    (e.target as HTMLImageElement).style.maxHeight = '128px';
                  }}
                />
              </div>
            </div>

            {/* Guild badges */}
            <div style={{
              display: 'flex',
              gap: '6px',
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: '16px',
            }}>
              <ProfileBadge label="THE AQUARIUM" baseColor="#2196f3" />
              {user.rank && (
                <ProfileBadge label={user.rank.toUpperCase()} baseColor={rankColor} />
              )}
              {daysInGuild !== null && (
                <ProfileBadge label={`${daysInGuild} D`} baseColor="#363636" />
              )}
            </div>

            {/* Stat Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
            }}>
              {statEntries.map((entry, i) => (
                <div key={i} style={{
                  background: 'rgba(0,0,0,0.12)',
                  borderRadius: '10px',
                  padding: '8px 14px',
                  minHeight: '52px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}>
                  <span className="profile-stat-label" style={{ textAlign: 'left' }}>
                    {entry.label}
                  </span>
                  <span className="profile-stat-value" style={{ textAlign: 'right' }}>
                    {entry.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Loading overlay for period data */}
            {periodLoading && (
              <div style={{
                position: 'absolute',
                bottom: '8px',
                right: '12px',
                fontSize: '0.7rem',
                color: 'rgba(255,255,255,0.5)',
                fontFamily: "'MinecraftFont', monospace",
              }}>
                Loading...
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Controls: Copy as PNG + Backgrounds + Time frame selector */}
        <div ref={controlsRef}>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
          {/* Copy as PNG button */}
          <button
            onClick={handleCopyPng}
            disabled={!!copyStatus}
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
          href="/api/auth/discord/logout"
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

      <BackgroundShopModal isOpen={shopOpen} onClose={() => setShopOpen(false)} onBackgroundChange={() => mutateProfile()} />
    </main>
  );
}
