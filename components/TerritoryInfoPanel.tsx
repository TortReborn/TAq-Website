"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Territory, getContrastColor } from "@/lib/utils";
import {
  MAX_TOWER_LEVEL,
  MAX_AURA_LEVEL,
  MAX_VOLLEY_LEVEL,
  calculateEffectiveHP,
  calculateAvgDPS,
  calculateTotalHP,
  calculateTotalDamage,
  getDefenseTier,
  getTreasuryTier,
  formatTimeHeld,
  formatNumber,
  getHealthDisplay,
  getDefenseDisplay,
  getDamageDisplay,
  getAttackSpeedDisplay,
  getAuraDisplay,
  getVolleyDisplay,
} from "@/lib/tower-stats";
import {
  calculateConnections,
  calculateExternals,
  TerritoryVerboseData,
} from "@/lib/connection-calculator";

interface TerritoryInfoPanelProps {
  selectedTerritory: { name: string; territory: Territory } | null;
  onClose: () => void;
  panelId?: string;
  guildColors: Record<string, string>;
  territories: Record<string, Territory>;
  verboseData: Record<string, TerritoryVerboseData> | null;
}

// Validate hex color format
function isValidHexColor(color: string | undefined): boolean {
  if (!color) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

// Stat row component
function StatRow({
  label,
  level,
  maxLevel,
  onDecrease,
  onIncrease,
  displayValue,
}: {
  label: string;
  level: number;
  maxLevel: number;
  onDecrease: () => void;
  onIncrease: () => void;
  displayValue?: string;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '0.5rem',
      fontSize: '0.875rem',
    }}>
      <span style={{ color: 'var(--text-secondary)', minWidth: '70px' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {displayValue && (
          <span style={{ color: 'var(--text-primary)', fontSize: '0.75rem', marginRight: '0.5rem', minWidth: '80px', textAlign: 'right' }}>
            {displayValue}
          </span>
        )}
        <button
          onClick={onDecrease}
          disabled={level <= 0}
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            border: '1px solid var(--border-color)',
            background: level <= 0 ? 'var(--bg-secondary)' : '#6b3a3a',
            color: level <= 0 ? 'var(--text-secondary)' : '#ffcccc',
            cursor: level <= 0 ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
          }}
        >
          -
        </button>
        <span style={{
          minWidth: '24px',
          textAlign: 'center',
          color: 'var(--text-primary)',
          fontWeight: '600',
        }}>
          {level}
        </span>
        <button
          onClick={onIncrease}
          disabled={level >= maxLevel}
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            border: '1px solid var(--border-color)',
            background: level >= maxLevel ? 'var(--bg-secondary)' : '#3a5a3a',
            color: level >= maxLevel ? 'var(--text-secondary)' : '#ccffcc',
            cursor: level >= maxLevel ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function TerritoryInfoPanel({
  selectedTerritory,
  onClose,
  panelId,
  guildColors,
  territories,
  verboseData,
}: TerritoryInfoPanelProps) {
  // Theme detection
  const [isDarkMode, setIsDarkMode] = useState(true);

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

  // Tower stat levels (default to 11)
  const [damageLevel, setDamageLevel] = useState(11);
  const [attackSpeedLevel, setAttackSpeedLevel] = useState(11);
  const [healthLevel, setHealthLevel] = useState(11);
  const [defenseLevel, setDefenseLevel] = useState(11);
  const [auraLevel, setAuraLevel] = useState(0);
  const [volleyLevel, setVolleyLevel] = useState(0);
  const [isHQ, setIsHQ] = useState(false);
  const [connectionOverride, setConnectionOverride] = useState<number | null>(null);
  const [externalsOverride, setExternalsOverride] = useState<number | null>(null);

  // Time held state
  const [timeHeld, setTimeHeld] = useState<number>(0);

  // Calculate connections from map data
  const calculatedConnections = useMemo(() => {
    if (!selectedTerritory || !verboseData) return { owned: 0, total: 0 };
    return calculateConnections(
      selectedTerritory.name,
      selectedTerritory.territory.guild.name,
      territories,
      verboseData
    );
  }, [selectedTerritory, territories, verboseData]);

  // Use override if set, otherwise use calculated value
  const ownedConnections = connectionOverride !== null ? connectionOverride : calculatedConnections.owned;
  const totalConnections = calculatedConnections.total;

  // Reset stats when territory changes
  useEffect(() => {
    setDamageLevel(11);
    setAttackSpeedLevel(11);
    setHealthLevel(11);
    setDefenseLevel(11);
    setAuraLevel(0);
    setVolleyLevel(0);
    setIsHQ(false);
    setConnectionOverride(null);
    setExternalsOverride(null);
  }, [selectedTerritory?.name]);

  // Calculate time held and update every second
  useEffect(() => {
    if (!selectedTerritory?.territory.acquired) {
      setTimeHeld(0);
      return;
    }

    const calculateTime = () => {
      const now = new Date();
      const acquired = new Date(selectedTerritory.territory.acquired);
      const diff = Math.floor((now.getTime() - acquired.getTime()) / 1000);
      setTimeHeld(isNaN(diff) || diff < 0 ? 0 : diff);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [selectedTerritory?.territory.acquired]);

  // Get guild color
  const guildColor = useMemo(() => {
    if (!selectedTerritory) return '#FFFFFF';
    const guildName = selectedTerritory.territory.guild.name;
    const guildPrefix = selectedTerritory.territory.guild.prefix;

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
  }, [selectedTerritory, guildColors]);

  // Calculate externals for HQ bonus (always calculate so we can show the auto value)
  const calculatedExternals = useMemo(() => {
    if (!selectedTerritory || !verboseData) return 0;
    return calculateExternals(
      selectedTerritory.name,
      selectedTerritory.territory.guild.name,
      territories,
      verboseData
    );
  }, [selectedTerritory, territories, verboseData]);

  // Use override if set, otherwise use calculated value
  const externals = externalsOverride !== null ? externalsOverride : calculatedExternals;

  // Calculate effective HP and DPS
  const effectiveHP = useMemo(() => {
    return calculateEffectiveHP(healthLevel, defenseLevel, ownedConnections, isHQ, externals);
  }, [healthLevel, defenseLevel, ownedConnections, isHQ, externals]);

  const avgDPS = useMemo(() => {
    return calculateAvgDPS(damageLevel, attackSpeedLevel, ownedConnections, isHQ, externals);
  }, [damageLevel, attackSpeedLevel, ownedConnections, isHQ, externals]);

  // Calculate total HP with bonuses
  const totalHP = useMemo(() => {
    return calculateTotalHP(healthLevel, ownedConnections, isHQ, externals);
  }, [healthLevel, ownedConnections, isHQ, externals]);

  // Calculate total damage with bonuses
  const totalDamage = useMemo(() => {
    return calculateTotalDamage(damageLevel, ownedConnections, isHQ, externals);
  }, [damageLevel, ownedConnections, isHQ, externals]);

  // Get defense tier based on upgrade levels and HQ status
  const defenseTier = useMemo(() => {
    return getDefenseTier(damageLevel, attackSpeedLevel, healthLevel, defenseLevel, auraLevel, volleyLevel, isHQ);
  }, [damageLevel, attackSpeedLevel, healthLevel, defenseLevel, auraLevel, volleyLevel, isHQ]);

  // Get treasury info
  const treasuryInfo = useMemo(() => getTreasuryTier(timeHeld), [timeHeld]);

  // Get resources
  const resources = useMemo(() => {
    if (!selectedTerritory?.territory.resources) return [];
    const res = selectedTerritory.territory.resources;
    const resourceList: { type: string; amount: string }[] = [];

    if (res.emeralds && res.emeralds !== '0') resourceList.push({ type: 'emeralds', amount: res.emeralds });
    if (res.ore && res.ore !== '0') resourceList.push({ type: 'ore', amount: res.ore });
    if (res.wood && res.wood !== '0') resourceList.push({ type: 'wood', amount: res.wood });
    if (res.fish && res.fish !== '0') resourceList.push({ type: 'fish', amount: res.fish });
    if (res.crops && res.crops !== '0') resourceList.push({ type: 'crops', amount: res.crops });

    return resourceList;
  }, [selectedTerritory?.territory.resources]);

  if (!selectedTerritory) return null;

  const { name, territory } = selectedTerritory;

  return (
    <div
      id={panelId}
      style={{
        position: 'absolute',
        top: '1rem',
        left: '1rem',
        width: '320px',
        backgroundColor: 'var(--bg-card-solid)',
        border: '2px solid var(--border-color)',
        borderRadius: '0.5rem',
        padding: '1rem',
        zIndex: 1001,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        pointerEvents: 'auto',
        maxHeight: 'calc(100vh - 8rem)',
        overflowY: 'auto',
        userSelect: 'text',
        cursor: 'default',
      }}
      onWheel={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
          width: '1.5rem',
          height: '1.5rem',
          borderRadius: '0.25rem',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-secondary)',
          fontWeight: 'bold',
          cursor: 'pointer',
          fontSize: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: '1',
        }}
      >
        ×
      </button>

      {/* Territory Name */}
      <div style={{
        fontWeight: 'bold',
        fontSize: '1.2rem',
        color: 'var(--text-primary)',
        marginBottom: '0.5rem',
        paddingRight: '2rem',
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
        {territory.guild.name || 'Unclaimed'}
        {territory.guild.prefix && ` [${territory.guild.prefix}]`}
      </div>

      {/* Resources */}
      {resources.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          {resources.map((res, i) => (
            <div key={i} style={{
              fontSize: '0.875rem',
              color: 'var(--text-primary)',
              marginBottom: '0.2rem',
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>+{res.amount}</span>{' '}
              {res.type} per hour
            </div>
          ))}
        </div>
      )}

      {/* Time Held */}
      {territory.acquired && timeHeld > 0 && (
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
      {territory.acquired && timeHeld > 0 && (
        <div style={{
          fontSize: '0.875rem',
          color: 'var(--text-primary)',
          marginBottom: '1rem'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Treasury:</span>{' '}
          <span style={{ color: treasuryInfo.color, fontWeight: '600' }}>
            {treasuryInfo.tier}
          </span>
        </div>
      )}

      {/* Divider */}
      <div style={{
        borderTop: '1px solid var(--border-color)',
        margin: '0.75rem 0',
      }} />

      {/* Tower Section */}
      <div style={{
        fontWeight: 'bold',
        fontSize: '1rem',
        color: 'var(--text-primary)',
        marginBottom: '0.75rem',
        textAlign: 'left',
      }}>
        Tower
      </div>

      {/* HQ Checkbox */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '0.75rem',
        fontSize: '0.875rem',
      }}>
        <input
          type="checkbox"
          id="hq-checkbox"
          checked={isHQ}
          onChange={(e) => setIsHQ(e.target.checked)}
          style={{
            marginRight: '0.5rem',
            width: '16px',
            height: '16px',
            cursor: 'pointer',
          }}
        />
        <label htmlFor="hq-checkbox" style={{ color: 'var(--text-primary)', cursor: 'pointer' }}>
          HQ
        </label>
      </div>

      {/* Base Stats Column Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.5rem',
        fontSize: '0.75rem',
      }}>
        <span style={{ color: 'var(--text-secondary)', minWidth: '70px' }}></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginRight: '0.5rem', minWidth: '80px', textAlign: 'right' }}>
            Base Stats
          </span>
          <span style={{ minWidth: '24px' }}></span>
          <span style={{ color: 'var(--text-secondary)', minWidth: '24px', textAlign: 'center', fontWeight: '600' }}>
            Lvl
          </span>
          <span style={{ minWidth: '24px' }}></span>
        </div>
      </div>

      {/* Tower Stats */}
      <StatRow
        label="Damage"
        level={damageLevel}
        maxLevel={MAX_TOWER_LEVEL}
        onDecrease={() => setDamageLevel(Math.max(0, damageLevel - 1))}
        onIncrease={() => setDamageLevel(Math.min(MAX_TOWER_LEVEL, damageLevel + 1))}
        displayValue={getDamageDisplay(damageLevel)}
      />

      <StatRow
        label="Attack"
        level={attackSpeedLevel}
        maxLevel={MAX_TOWER_LEVEL}
        onDecrease={() => setAttackSpeedLevel(Math.max(0, attackSpeedLevel - 1))}
        onIncrease={() => setAttackSpeedLevel(Math.min(MAX_TOWER_LEVEL, attackSpeedLevel + 1))}
        displayValue={getAttackSpeedDisplay(attackSpeedLevel)}
      />

      <StatRow
        label="Health"
        level={healthLevel}
        maxLevel={MAX_TOWER_LEVEL}
        onDecrease={() => setHealthLevel(Math.max(0, healthLevel - 1))}
        onIncrease={() => setHealthLevel(Math.min(MAX_TOWER_LEVEL, healthLevel + 1))}
        displayValue={getHealthDisplay(healthLevel)}
      />

      <StatRow
        label="Defence"
        level={defenseLevel}
        maxLevel={MAX_TOWER_LEVEL}
        onDecrease={() => setDefenseLevel(Math.max(0, defenseLevel - 1))}
        onIncrease={() => setDefenseLevel(Math.min(MAX_TOWER_LEVEL, defenseLevel + 1))}
        displayValue={getDefenseDisplay(defenseLevel)}
      />

      <StatRow
        label="Aura"
        level={auraLevel}
        maxLevel={MAX_AURA_LEVEL}
        onDecrease={() => setAuraLevel(Math.max(0, auraLevel - 1))}
        onIncrease={() => setAuraLevel(Math.min(MAX_AURA_LEVEL, auraLevel + 1))}
        displayValue={getAuraDisplay(auraLevel)}
      />

      <StatRow
        label="Volley"
        level={volleyLevel}
        maxLevel={MAX_VOLLEY_LEVEL}
        onDecrease={() => setVolleyLevel(Math.max(0, volleyLevel - 1))}
        onIncrease={() => setVolleyLevel(Math.min(MAX_VOLLEY_LEVEL, volleyLevel + 1))}
        displayValue={getVolleyDisplay(volleyLevel)}
      />

      {/* Connections with +/- controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.75rem',
        fontSize: '0.875rem',
      }}>
        <span style={{ color: 'var(--text-secondary)', minWidth: '70px' }}>Conns</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--text-primary)', fontSize: '0.75rem', marginRight: '0.5rem', minWidth: '80px', textAlign: 'right' }}>
            {ownedConnections}/{totalConnections}
          </span>
          <button
            onClick={() => {
              const current = connectionOverride !== null ? connectionOverride : calculatedConnections.owned;
              setConnectionOverride(Math.max(0, current - 1));
            }}
            disabled={ownedConnections <= 0}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              background: ownedConnections <= 0 ? 'var(--bg-secondary)' : '#6b3a3a',
              color: ownedConnections <= 0 ? 'var(--text-secondary)' : '#ffcccc',
              cursor: ownedConnections <= 0 ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
            }}
          >
            -
          </button>
          <span style={{
            minWidth: '24px',
            textAlign: 'center',
            color: 'var(--text-primary)',
            fontWeight: '600',
          }}>
            {ownedConnections}
          </span>
          <button
            onClick={() => {
              const current = connectionOverride !== null ? connectionOverride : calculatedConnections.owned;
              setConnectionOverride(Math.min(totalConnections, current + 1));
            }}
            disabled={ownedConnections >= totalConnections}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              background: ownedConnections >= totalConnections ? 'var(--bg-secondary)' : '#3a5a3a',
              color: ownedConnections >= totalConnections ? 'var(--text-secondary)' : '#ccffcc',
              cursor: ownedConnections >= totalConnections ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Externals with +/- controls - only shown when HQ is checked */}
      {isHQ && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
          fontSize: '0.875rem',
        }}>
          <span style={{ color: 'var(--text-secondary)', minWidth: '70px' }}>Externals</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-primary)', fontSize: '0.75rem', marginRight: '0.5rem', minWidth: '80px', textAlign: 'right' }}>
              (auto: {calculatedExternals})
            </span>
            <button
              onClick={() => {
                const current = externalsOverride !== null ? externalsOverride : calculatedExternals;
                setExternalsOverride(Math.max(0, current - 1));
              }}
              disabled={externals <= 0}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                background: externals <= 0 ? 'var(--bg-secondary)' : '#6b3a3a',
                color: externals <= 0 ? 'var(--text-secondary)' : '#ffcccc',
                cursor: externals <= 0 ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
              }}
            >
              -
            </button>
            <span style={{
              minWidth: '24px',
              textAlign: 'center',
              color: 'var(--text-primary)',
              fontWeight: '600',
            }}>
              {externals}
            </span>
            <button
              onClick={() => {
                const current = externalsOverride !== null ? externalsOverride : calculatedExternals;
                setExternalsOverride(current + 1);
              }}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                background: '#3a5a3a',
                color: '#ccffcc',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
              }}
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Divider */}
      <div style={{
        borderTop: '1px solid var(--border-color)',
        margin: '0.75rem 0',
      }} />

      {/* Calculated Stats */}
      <div style={{
        fontSize: '0.875rem',
        marginBottom: '0.5rem',
      }}>
        <span style={{ color: 'var(--text-secondary)' }}>Total HP:</span>{' '}
        <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
          {formatNumber(totalHP)}
        </span>
      </div>

      <div style={{
        fontSize: '0.875rem',
        marginBottom: '0.5rem',
      }}>
        <span style={{ color: 'var(--text-secondary)' }}>Damage Per Hit:</span>{' '}
        <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
          {formatNumber(totalDamage.min)}-{formatNumber(totalDamage.max)}
        </span>
      </div>

      <div style={{
        fontSize: '0.875rem',
        marginBottom: '0.5rem',
      }}>
        <span style={{ color: 'var(--text-secondary)' }}>Average DPS:</span>{' '}
        <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
          {formatNumber(Math.round(avgDPS))}
        </span>
      </div>

      <div style={{
        fontSize: '0.875rem',
        marginBottom: '0.5rem',
      }}>
        <span style={{ color: 'var(--text-secondary)' }}>Effective HP:</span>{' '}
        <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
          {formatNumber(effectiveHP)}
        </span>
      </div>

      <div style={{
        fontSize: '0.875rem',
      }}>
        <span style={{ color: 'var(--text-secondary)' }}>Defense:</span>{' '}
        <span style={{ color: defenseTier.color, fontWeight: '600' }}>
          {defenseTier.tier}
        </span>
      </div>
    </div>
  );
}
