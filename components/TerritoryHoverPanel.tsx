"use client";

import { useMemo, useState, useEffect } from "react";
import { Territory, getContrastColor } from "@/lib/utils";
import { getTreasuryTier, formatTimeHeld } from "@/lib/tower-stats";

interface TerritoryHoverPanelProps {
  territory: { name: string; territory: Territory } | null;
  guildColors: Record<string, string>;
}

// Validate hex color format
function isValidHexColor(color: string | undefined): boolean {
  if (!color) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

export default function TerritoryHoverPanel({ territory, guildColors }: TerritoryHoverPanelProps) {
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

  // Get treasury info
  const treasuryInfo = useMemo(() => getTreasuryTier(timeHeld), [timeHeld]);

  // Get resources
  const resources = useMemo(() => {
    if (!territory?.territory.resources) return [];
    const res = territory.territory.resources;
    const resourceList: { type: string; amount: string }[] = [];

    if (res.emeralds && res.emeralds !== '0') resourceList.push({ type: 'emeralds', amount: res.emeralds });
    if (res.ore && res.ore !== '0') resourceList.push({ type: 'ore', amount: res.ore });
    if (res.wood && res.wood !== '0') resourceList.push({ type: 'wood', amount: res.wood });
    if (res.fish && res.fish !== '0') resourceList.push({ type: 'fish', amount: res.fish });
    if (res.crops && res.crops !== '0') resourceList.push({ type: 'crops', amount: res.crops });

    return resourceList;
  }, [territory?.territory.resources]);

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
        fontWeight: 'bold',
        fontSize: '1.2rem',
        color: 'var(--text-primary)',
        marginBottom: '0.5rem'
      }}>
        {name}
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
          color: 'var(--text-primary)'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Treasury:</span>{' '}
          <span style={{ color: treasuryInfo.color, fontWeight: '600' }}>
            {treasuryInfo.tier}
          </span>
        </div>
      )}
    </div>
  );
}
