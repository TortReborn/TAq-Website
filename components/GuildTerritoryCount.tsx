"use client";

import { useMemo } from "react";
import { Territory, getGuildColor } from "@/lib/utils";

interface GuildTerritoryCountProps {
  territories: Record<string, Territory>;
  onGuildClick?: (guildName: string) => void;
}

interface GuildStats {
  name: string;
  originalName: string;
  count: number;
  color: string;
}

export default function GuildTerritoryCount({ territories, onGuildClick }: GuildTerritoryCountProps) {
  const guildStats = useMemo(() => {
    const counts: Record<string, { count: number, prefix: string }> = {};

    Object.values(territories).forEach(territory => {
      if (territory.guild && territory.guild.name) {
        if (!counts[territory.guild.name]) {
          counts[territory.guild.name] = { count: 0, prefix: territory.guild.prefix };
        }
        counts[territory.guild.name].count++;
      }
    });

    const stats: GuildStats[] = Object.entries(counts).map(([name, data]) => ({
      name: data.prefix ? `${name} [${data.prefix}]` : name,
      originalName: name,
      count: data.count,
      color: getGuildColor(name, data.prefix)
    }));

    // Sort by territory count descending
    stats.sort((a, b) => b.count - a.count);

    return stats;
  }, [territories]);

  // Calculate dynamic font size based on number of guilds
  const baseFontSize = 0.875; // 0.875rem base
  const maxGuildsForBaseFontSize = 15;
  const minFontSize = 0.6; // minimum font size in rem
  
  const dynamicFontSize = guildStats.length <= maxGuildsForBaseFontSize 
    ? baseFontSize 
    : Math.max(minFontSize, baseFontSize * (maxGuildsForBaseFontSize / guildStats.length));

  return (
    <div 
      style={{
        position: 'absolute',
        top: '1rem',
        right: '1rem',
        width: '280px',
        maxHeight: '70vh',
        background: 'var(--bg-card)',
        border: '2px solid var(--border-color)',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        zIndex: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        overflowY: 'auto',
        color: 'var(--text-primary)',
        backdropFilter: 'blur(8px)',
      }}
      onWheel={(e) => e.stopPropagation()}
      className="guild-territory-count"
    >
      <h3 style={{ 
        marginTop: 0, 
        marginBottom: '1.25rem', 
        textAlign: 'center', 
        fontWeight: 'bold', 
        fontSize: '1.1rem',
        color: 'var(--accent-color)',
        borderBottom: '2px solid var(--border-color)',
        paddingBottom: '0.75rem'
      }}>Territory Leaders</h3>
      {guildStats.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {guildStats.map((guild, index) => (
            <li 
              key={guild.name} 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '0.25rem', 
                fontSize: `${dynamicFontSize}rem`,
                padding: '0.35rem 0.75rem',
                borderRadius: '0.5rem',
                background: 'var(--bg-secondary)',
                border: '1px solid transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.transform = 'translateX(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-secondary)';
                e.currentTarget.style.borderColor = 'transparent';
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <span 
                style={{ 
                  color: guild.color, 
                  fontWeight: 'bold', 
                  cursor: onGuildClick ? 'pointer' : 'default',
                  textDecoration: 'none',
                  flex: 1
                }}
                onMouseEnter={(e) => {
                  if (onGuildClick) {
                    e.currentTarget.style.textShadow = '0 0 8px currentColor';
                  }
                }}
                onMouseLeave={(e) => {
                  if (onGuildClick) {
                    e.currentTarget.style.textShadow = 'none';
                  }
                }}
                onClick={() => onGuildClick && onGuildClick(guild.originalName)}
              >
                {guild.name}
              </span>
              <span style={{ 
                color: 'var(--text-secondary)',
                fontWeight: '600',
                backgroundColor: 'var(--bg-tertiary)',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.85em',
                minWidth: '2rem',
                textAlign: 'center'
              }}>
                {guild.count}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', margin: 0 }}>No guilds hold territory.</p>
      )}
      
      <style jsx>{`
        .guild-territory-count {
          scroll-behavior: auto !important;
          overscroll-behavior: auto !important;
          -webkit-overflow-scrolling: touch !important;
        }
        
        .guild-territory-count::-webkit-scrollbar {
          width: 8px;
        }
        
        .guild-territory-count::-webkit-scrollbar-track {
          background: var(--bg-secondary);
          border-radius: 8px;
          margin: 4px 0;
        }
        
        .guild-territory-count::-webkit-scrollbar-thumb {
          background: var(--border-color);
          border-radius: 8px;
          transition: background-color 0.2s ease;
        }
        
        .guild-territory-count::-webkit-scrollbar-thumb:hover {
          background: var(--accent-color);
        }
        
        .guild-territory-count::-webkit-scrollbar-thumb:active {
          background: var(--accent-color);
          opacity: 0.8;
        }
        
        /* Firefox scrollbar styling */
        .guild-territory-count {
          scrollbar-width: thin;
          scrollbar-color: var(--border-color) var(--bg-secondary);
        }
      `}</style>
    </div>
  );
}
