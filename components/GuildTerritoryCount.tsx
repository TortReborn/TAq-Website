"use client";

import { useMemo, useState, useEffect } from "react";
import { Territory, getContrastColor } from "@/lib/utils";

interface GuildTerritoryCountProps {
  territories: Record<string, Territory>;
  onGuildClick?: (guildName: string) => void;
  guildColors: Record<string, string>;
}

interface GuildStats {
  name: string;
  originalName: string;
  count: number;
  color: string;
}

export default function GuildTerritoryCount({ territories, onGuildClick, guildColors }: GuildTerritoryCountProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
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

  // Check if device is mobile and set default collapsed state only once
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      // Only set default collapsed state on first load
      if (!hasInitialized) {
        setIsCollapsed(mobile);
        setHasInitialized(true);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []); // Remove isCollapsed from dependencies


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

    // Validate hex color format
    const isValidHexColor = (color: string | undefined): boolean => {
      if (!color) return false;
      return /^#[0-9A-Fa-f]{6}$/.test(color);
    };

    const stats: GuildStats[] = Object.entries(counts).map(([name, data]) => {
      // Try multiple key matching strategies like in TerritoryOverlay
      // Only use color if it's a valid hex color
      const candidates = [
        guildColors[data.prefix],
        guildColors[name],
        guildColors[data.prefix?.toLowerCase()],
        guildColors[name.toLowerCase()]
      ];

      let color = '#FFFFFF';
      for (const c of candidates) {
        if (isValidHexColor(c)) {
          color = c;
          break;
        }
      }
      
      return {
        name: data.prefix ? `${name} [${data.prefix}]` : name,
        originalName: name,
        count: data.count,
        color: color
      };
    });

    // Sort by territory count descending
    stats.sort((a, b) => b.count - a.count);

    return stats;
  }, [territories, guildColors]);

  // Calculate dynamic font size based on number of guilds
  const baseFontSize = 0.875; // 0.875rem base
  const maxGuildsForBaseFontSize = 15;
  const minFontSize = 0.6; // minimum font size in rem
  
  const dynamicFontSize = guildStats.length <= maxGuildsForBaseFontSize 
    ? baseFontSize 
    : Math.max(minFontSize, baseFontSize * (maxGuildsForBaseFontSize / guildStats.length));

  return (
    <>
      {/* Toggle button when collapsed */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '0',
            width: '40px',
            height: 'calc(2.5rem + 1.1rem + 4px)', // Increased to match visual header height
            background: 'var(--bg-card)',
            border: '2px solid var(--border-color)',
            borderRight: 'none',
            borderRadius: '8px 0 0 8px',
            zIndex: 10,
            boxShadow: '-4px 0 12px rgba(0,0,0,0.25)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)',
            fontSize: '1.2rem',
            backdropFilter: 'blur(8px)',
            transition: 'none'
          }}
          aria-label="Show territory owners"
        >
          ←
        </button>
      )}
      
      {/* Main panel when expanded */}
      {!isCollapsed && (
        <div 
          style={{
            position: 'absolute',
            top: '1rem',
            right: '0',
            width: isMobile ? '90vw' : '280px',
            maxWidth: '320px',
            maxHeight: isMobile ? '60vh' : '70vh',
            background: 'var(--bg-card)',
            border: '2px solid var(--border-color)',
            borderRight: 'none',
            borderRadius: '0.75rem 0 0 0.75rem',
            zIndex: 10,
            boxShadow: '-4px 0 24px rgba(0,0,0,0.25)',
            color: 'var(--text-primary)',
            backdropFilter: 'blur(8px)',
            transform: isCollapsed ? 'translateX(100%)' : 'translateX(0)',
            transition: 'transform 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            touchAction: 'pan-y', // Allow vertical touch actions
            overscrollBehavior: 'contain'
          }}
          onMouseDown={(e) => {
            // Stop propagation to prevent map interaction
            e.stopPropagation();
          }}
          onMouseMove={(e) => {
            // Stop propagation to prevent map panning
            e.stopPropagation();
          }}
          onMouseUp={(e) => {
            // Stop propagation to prevent map interaction
            e.stopPropagation();
          }}
          onTouchStart={(e) => {
            // Stop propagation to prevent map interaction
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            // Stop propagation to prevent map panning
            e.stopPropagation();
          }}
          onTouchEnd={(e) => {
            // Stop propagation to prevent map interaction
            e.stopPropagation();
          }}
          className="guild-territory-count"
        >
          {/* Header with close button - fixed, non-scrollable */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.25rem 0.75rem 1.25rem',
            borderBottom: '2px solid var(--border-color)',
            flexShrink: 0
          }}>
            <h3 style={{ 
              margin: 0,
              textAlign: 'center', 
              fontWeight: 'bold', 
              fontSize: '1.1rem',
              color: 'var(--accent-color)',
              flex: 1
            }}>Territory Leaders</h3>
            <button
              onClick={() => setIsCollapsed(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '1.2rem',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-secondary)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              aria-label="Hide territory owners"
            >
              →
            </button>
          </div>
          
          {/* Scrollable content area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.25rem',
            paddingTop: '1rem',
            touchAction: 'pan-y', // Allow only vertical scrolling
            overscrollBehavior: 'contain', // Prevent scroll chaining
            userSelect: 'none', // Disable text selection
            WebkitUserSelect: 'none', // Safari
            MozUserSelect: 'none', // Firefox
            msUserSelect: 'none' // IE/Edge
          }}
          onMouseDown={(e) => {
            // Stop propagation to prevent map panning
            e.stopPropagation();
            // Prevent text selection
            e.preventDefault();
          }}
          onMouseMove={(e) => {
            // Stop propagation to prevent map panning
            e.stopPropagation();
          }}
          onMouseUp={(e) => {
            // Stop propagation to prevent map panning
            e.stopPropagation();
          }}
          onTouchStart={(e) => {
            // Stop propagation to prevent map from receiving touch events
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            // Stop propagation to prevent map panning
            e.stopPropagation();
          }}
          onTouchEnd={(e) => {
            // Stop propagation to prevent map from receiving touch events
            e.stopPropagation();
          }}
          className="guild-list-container"
          >
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
                  color: getContrastColor(guild.color, isDarkMode),
                  fontWeight: 'bold',
                  cursor: onGuildClick ? 'pointer' : 'default',
                  textDecoration: 'none',
                  flex: 1,
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
          </div>
      
      <style jsx>{`
        .guild-list-container {
          scroll-behavior: auto !important;
          overscroll-behavior: auto !important;
          -webkit-overflow-scrolling: touch !important;
        }
        
        .guild-list-container::-webkit-scrollbar {
          width: 8px;
        }
        
        .guild-list-container::-webkit-scrollbar-track {
          background: var(--bg-secondary);
          border-radius: 8px;
          margin: 4px 0;
        }
        
        .guild-list-container::-webkit-scrollbar-thumb {
          background: var(--border-color);
          border-radius: 8px;
          transition: background-color 0.2s ease;
        }
        
        .guild-list-container::-webkit-scrollbar-thumb:hover {
          background: var(--accent-color);
        }
        
        .guild-list-container::-webkit-scrollbar-thumb:active {
          background: var(--accent-color);
          opacity: 0.8;
        }
        
        /* Firefox scrollbar styling */
        .guild-list-container {
          scrollbar-width: thin;
          scrollbar-color: var(--border-color) var(--bg-secondary);
        }
      `}</style>
        </div>
      )}
    </>
  );
}
