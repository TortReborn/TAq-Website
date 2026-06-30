"use client";

import { useMemo, useState, useEffect } from "react";
import { Territory, getContrastColor } from "@/lib/utils";
import { getTreasuryTier, getRatingDisplay, formatTimeHeld } from "@/lib/tower-stats";
import { TerritoryVerboseData } from "@/lib/connection-calculator";

interface TerritoryHoverPanelProps {
  territory: { name: string; territory: Territory } | null;
  guildColors: Record<string, string>;
  verboseData?: TerritoryVerboseData | null;
}

// Validate hex color format
function isValidHexColor(color: string | undefined): boolean {
  if (!color) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

export default function TerritoryHoverPanel({ territory, guildColors, verboseData }: TerritoryHoverPanelProps) {
  const [timeHeld, setTimeHeld] = useState<number>(0);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Theme detection
  useEffect(() => {
    const checkTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      setIsDarkMode(theme === 'dark');
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Calculate time held and update every second
  useEffect(() => {
    if (!territory?.territory.acquired) {
      setTimeHeld(0);
      return;
    }

    const calculateTime = () => {
      const now = new Date();
      const acquired = new Date(territory.territory.acquired);
      const diff = Math.floor((now.getTime() - acquired.getTime()) / 1000);
      setTimeHeld(isNaN(diff) || diff < 0 ? 0 : diff);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [territory?.territory.acquired]);

  // Get guild color
  const guildColor = useMemo(() => {
    if (!territory) return '#FFFFFF';
    const guildName = territory.territory.guild.name;
    const guildPrefix = territory.territory.guild.prefix;

    if (!guildName || guildName === 'Unclaimed') {
      return '#808080';
    }

    const candidates = [
      guildColors[guildPrefix],
      guildColors[guildName],
      guildColors[guildPrefix?.toLowerCase()],
      guildColors[guildName.toLowerCase()]
    ];

    for (const color of candidates) {
      if (isValidHexColor(color)) {
        return color;
      }
    }

    return '#FFFFFF';
  }, [territory, guildColors]);

  // Get treasury info — prefer the live API rating, fall back to the time-held estimate
  const treasuryInfo = useMemo(
    () => getRatingDisplay(territory?.territory.treasury) ?? getTreasuryTier(timeHeld),
    [territory?.territory.treasury, timeHeld]
  );

  // Live defence rating from the API (live mode only; absent in history snapshots)
  const defenceInfo = useMemo(
    () => getRatingDisplay(territory?.territory.defences),
    [territory?.territory.defences]
  );

  // Get resources from verboseData
  const resources = useMemo(() => {
    if (!verboseData?.resources) return [];
    const res = verboseData.resources;
    const resourceList: { type: string; amount: string }[] = [];

    // Only show emeralds if > 9000
    const emeraldAmount = parseInt(res.emeralds || '0', 10);
    if (emeraldAmount > 9000) {
      resourceList.push({ type: 'emeralds', amount: res.emeralds });
    }

    // Show other resources if > 0
    if (res.ore && res.ore !== '0') resourceList.push({ type: 'ore', amount: res.ore });
    if (res.wood && res.wood !== '0') resourceList.push({ type: 'wood', amount: res.wood });
    if (res.fish && res.fish !== '0') resourceList.push({ type: 'fish', amount: res.fish });
    if (res.crops && res.crops !== '0') resourceList.push({ type: 'crops', amount: res.crops });

    return resourceList;
  }, [verboseData?.resources]);

  if (!territory) return null;

  const { name, territory: terr } = territory;

  return (
    <div
      style={{
        position: 'absolute',
        top: '1rem',
        left: '1rem',
        minWidth: '220px',
        maxWidth: '280px',
        backgroundColor: 'var(--bg-card-solid)',
        border: '2px solid var(--border-color)',
        borderRadius: '0.5rem',
        padding: '1rem',
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
      }}
    >
      {/* Territory Name */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontWeight: 'bold',
        fontSize: '1.2rem',
        color: 'var(--text-primary)',
        marginBottom: '0.5rem'
      }}>
        <span>{name}</span>
        {terr.hq && (
          <span title="Guild Headquarters" style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: '#1a1a1a',
            background: '#FFD700',
            borderRadius: '0.25rem',
            padding: '0.1rem 0.35rem',
          }}>
            ★ HQ
          </span>
        )}
      </div>

      {/* Guild Name */}
      <div style={{
        fontWeight: 'bold',
        fontSize: '1rem',
        color: getContrastColor(guildColor, isDarkMode),
        marginBottom: '0.75rem',
      }}>
        {terr.guild.name || 'Unclaimed'}
        {terr.guild.prefix && ` [${terr.guild.prefix}]`}
      </div>

      {/* Resources */}
      {resources.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          {resources.map((res, i) => (
            <div key={i} style={{
              fontSize: '0.875rem',
              color: 'var(--text-primary)',
              marginBottom: '0.2rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>+{res.amount}</span>
              <span>{res.type} per hour</span>
            </div>
          ))}
        </div>
      )}

      {/* Time Held */}
      {terr.acquired && timeHeld > 0 && (
        <div style={{
          fontSize: '0.875rem',
          color: 'var(--text-primary)',
          marginBottom: '0.25rem'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Time held:</span>{' '}
          {formatTimeHeld(timeHeld)}
        </div>
      )}

      {/* Treasury */}
      {terr.acquired && timeHeld > 0 && (
        <div style={{
          fontSize: '0.875rem',
          color: 'var(--text-primary)',
          marginBottom: defenceInfo ? '0.25rem' : 0,
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Treasury:</span>{' '}
          <span style={{ color: treasuryInfo.color, fontWeight: '600' }}>
            {treasuryInfo.tier}
          </span>
        </div>
      )}

      {/* Defence (live API rating) */}
      {defenceInfo && (
        <div style={{
          fontSize: '0.875rem',
          color: 'var(--text-primary)'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Defence:</span>{' '}
          <span style={{ color: defenceInfo.color, fontWeight: '600' }}>
            {defenceInfo.tier}
          </span>
        </div>
      )}
    </div>
  );
}
