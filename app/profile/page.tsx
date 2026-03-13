"use client";

import { useExecSession } from '@/hooks/useExecSession';
import { useProfileData } from '@/hooks/useProfileData';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getRankColor, getWynnRankInfo } from '@/lib/rank-constants';
import { toPng } from 'html-to-image';

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
  const { data, loading, error } = useProfileData();
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [customDays, setCustomDays] = useState<string>('');
  const [customData, setCustomData] = useState<{ playtime: number; wars: number; raids: number; contributed: number; hasCompleteData: boolean } | null>(null);
  const [customLoading, setCustomLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.push('/login');
    }
  }, [authLoading, authenticated, router]);

  const handleCopyPng = useCallback(async () => {
    if (!cardRef.current) return;
    setCopyStatus('Capturing...');
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('Copied!');
    } catch {
      setCopyStatus('Failed');
    }
    setTimeout(() => setCopyStatus(null), 2000);
  }, []);

  const fetchCustomPeriod = useCallback(async () => {
    const days = parseInt(customDays, 10);
    if (!days || days < 1) return;
    setCustomLoading(true);
    try {
      const res = await fetch(`/api/profile?days=${days}`);
      if (res.ok) {
        const json = await res.json();
        const tf = json.timeFrames?.[String(days)];
        if (tf) {
          setCustomData(tf);
        }
      }
    } catch { /* ignore */ }
    setCustomLoading(false);
  }, [customDays]);

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

  const { user, stats, wynnRank, customization, shellsBalance, timeFrames, graidEvents, totalGraidCompletions, totalGraidEventsParticipated } = data;
  const daysInGuild = daysSince(stats.joined);
  const rankColor = getRankColor(user.rank);
  const [gradColor1, gradColor2] = parseGradient(customization?.gradient);
  const edgeColors = getEdgeGradientColors(rankColor);
  const cleanUuid = user.uuid.replace(/-/g, '');

  // Wynncraft rank info (VIP, CHAMPION, etc.)
  const wynnInfo = getWynnRankInfo(wynnRank);
  const wynnRankDisplay = wynnInfo?.display || 'PLAYER';
  const wynnRankColor = wynnInfo?.color || '#66ccff';

  // Build stat entries matching bot's 2-column layout
  const tf7 = timeFrames['7'];
  const statEntries: { label: string; value: string }[] = [];

  if (stats.online) {
    statEntries.push({ label: 'World', value: stats.server || 'Online' });
  } else {
    statEntries.push({ label: 'Last Seen', value: stats.lastJoin ? formatDate(stats.lastJoin) : 'Unknown' });
  }
  statEntries.push({ label: 'Playtime', value: `${Math.round(stats.playtime)} hrs` });
  if (tf7?.hasCompleteData) {
    statEntries.push({ label: 'Playtime / 7D', value: `${Math.round(tf7.playtime)} hrs` });
  }
  statEntries.push({ label: 'Wars', value: String(stats.wars) });
  if (tf7?.hasCompleteData) {
    statEntries.push({ label: 'Wars / 7D', value: String(tf7.wars) });
  }
  statEntries.push({ label: 'Guild XP', value: formatNumber(stats.contributed) });
  if (tf7?.hasCompleteData) {
    statEntries.push({ label: 'Guild XP / 7D', value: formatNumber(tf7.contributed) });
  }
  statEntries.push({ label: 'Guild Raids', value: String(stats.raids) });
  if (tf7?.hasCompleteData) {
    statEntries.push({ label: 'Guild Raids / 7D', value: String(tf7.raids) });
  }
  if (statEntries.length < 10) {
    statEntries.push({ label: 'Shells', value: String(stats.shells) });
  }

  return (
    <main style={{ maxWidth: '560px', margin: '0 auto', padding: '2rem 1rem' }}>
      {/* ===== PROFILE CARD (bot-style) ===== */}
      {/* Layer 1: Edge gradient (bot's vertical_gradient(tag_color) → light→shadow) */}
      <div
        ref={cardRef}
        className="profile-card"
        style={{
          background: `linear-gradient(180deg, ${edgeColors.light}, ${edgeColors.shadow})`,
          padding: '14px',
          borderRadius: '20px',
          marginBottom: '0.75rem',
        }}
      >
        {/* Layer 2: Card gradient (custom or default blue) */}
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

          {/* Wynncraft rank badge - centered at TOP of background area (overlapping) */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '-16px',
            position: 'relative',
            zIndex: 2,
          }}>
            <ProfileBadge label={wynnRankDisplay} baseColor={wynnRankColor} />
          </div>

          {/* Background area with gradient outline (bot's bg_outline + background) */}
          <div style={{
            background: `linear-gradient(180deg, ${edgeColors.shadow}, ${edgeColors.light})`,
            borderRadius: '12px',
            padding: '5px',
            marginBottom: '8px',
          }}>
            {/* Inner background area with player bust */}
            <div style={{
              borderRadius: '8px',
              height: '280px',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative',
              ...(customization?.backgroundId >= 2 ? {
                backgroundImage: `url(/images/profile_backgrounds/${customization.backgroundId}.png)`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              } : {
                background: 'rgba(0,0,0,0.15)',
              }),
            }}>
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

          {/* Guild badges — all on one line */}
          <div style={{
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: '16px',
          }}>
            <ProfileBadge label="THE AQUARIUM" baseColor="#2196f3" />
            {stats.guildRank && (
              <ProfileBadge label={stats.guildRank.toUpperCase()} baseColor={rankColor} />
            )}
            {daysInGuild !== null && (
              <ProfileBadge label={`${daysInGuild} D`} baseColor="#363636" />
            )}
          </div>

          {/* Stat Grid - 2 columns, row layout (label left, value right) */}
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
        </div>
      </div>

      {/* Copy as PNG button */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <button
          onClick={handleCopyPng}
          disabled={!!copyStatus}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-card)',
            borderRadius: '0.5rem',
            padding: '0.5rem 1.25rem',
            color: copyStatus === 'Copied!' ? '#22c55e' : 'var(--text-secondary)',
            fontSize: '0.85rem',
            cursor: copyStatus ? 'default' : 'pointer',
          }}
        >
          {copyStatus || 'Copy as PNG'}
        </button>
      </div>

      {/* ===== ACTIVITY TRENDS (below card) ===== */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '0.75rem',
        border: '1px solid var(--border-card)',
        marginBottom: '1.5rem',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-card)' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
            Activity Trends
          </h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Period</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600' }}>Playtime</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600' }}>Wars</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600' }}>Raids</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600' }}>XP</th>
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
                return (
                  <tr key={period.key} style={{ borderBottom: '1px solid var(--border-card)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: '600', color: 'var(--text-primary)' }}>{period.label}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-primary)' }}>
                      {tf.hasCompleteData ? formatPlaytime(tf.playtime) : '\u2014'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-primary)' }}>
                      {tf.hasCompleteData ? tf.wars : '\u2014'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-primary)' }}>
                      {tf.hasCompleteData ? tf.raids : '\u2014'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-primary)' }}>
                      {tf.hasCompleteData ? formatNumber(tf.contributed) : '\u2014'}
                    </td>
                  </tr>
                );
              })}

              {/* Custom time frame row */}
              {customData && (
                <tr style={{ borderBottom: '1px solid var(--border-card)', background: 'rgba(59,130,246,0.05)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '600', color: 'var(--color-ocean-400)' }}>{customDays} Days</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-primary)' }}>
                    {customData.hasCompleteData ? formatPlaytime(customData.playtime) : '\u2014'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-primary)' }}>
                    {customData.hasCompleteData ? customData.wars : '\u2014'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-primary)' }}>
                    {customData.hasCompleteData ? customData.raids : '\u2014'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-primary)' }}>
                    {customData.hasCompleteData ? formatNumber(customData.contributed) : '\u2014'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Custom period selector */}
        <div style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--border-card)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Custom:</label>
          <input
            type="number"
            min={1}
            max={daysInGuild ?? 365}
            placeholder="Days"
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') fetchCustomPeriod(); }}
            style={{
              width: '80px',
              padding: '0.35rem 0.5rem',
              fontSize: '0.8rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--border-card)',
              background: 'var(--bg-main)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            onClick={fetchCustomPeriod}
            disabled={customLoading || !customDays}
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--border-card)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              cursor: customLoading || !customDays ? 'default' : 'pointer',
              opacity: customLoading || !customDays ? 0.5 : 1,
            }}
          >
            {customLoading ? '...' : 'Go'}
          </button>
          {daysInGuild !== null && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              max {daysInGuild}d
            </span>
          )}
        </div>
      </div>

      {/* ===== GRAID EVENTS ===== */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '0.75rem',
        border: '1px solid var(--border-card)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border-card)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
            Graid Events
          </h2>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>{totalGraidEventsParticipated} events</span>
            <span>{totalGraidCompletions} completions</span>
          </div>
        </div>
        {graidEvents.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            No graid event participation yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Event</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600' }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600' }}>Completions</th>
                </tr>
              </thead>
              <tbody>
                {graidEvents.map((event) => (
                  <tr key={event.id} style={{ borderBottom: '1px solid var(--border-card)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                      {event.title}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {formatDate(event.startTs)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-primary)', fontWeight: '700' }}>
                      {event.completions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Logout */}
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <a
          href="/api/auth/discord/logout"
          style={{
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: '0.85rem',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-card)',
          }}
        >
          Logout
        </a>
      </div>
    </main>
  );
}
