"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface GuildData {
  guild: {
    name: string;
    prefix: string;
    level: number;
    territories: number;
    totalMembers: number;
    onlineMembers: number;
  };
}

export default function BottomBar() {
  const pathname = usePathname();
  const [guildData, setGuildData] = useState<GuildData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Don't render on map page
  if (pathname === '/map') {
    return null;
  }

  useEffect(() => {
    const fetchGuildData = async () => {
      try {
        const response = await fetch('/api/members', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          setGuildData(data);
          setLastUpdated(new Date().toLocaleString());
        }
      } catch (error) {
        console.error('Failed to fetch guild data for footer:', error);
      }
    };

    fetchGuildData();
  }, []);

  return (
    <footer style={{
      position: 'relative',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'var(--bg-card)',
      backdropFilter: 'blur(12px)',
      borderTop: '1px solid var(--border-card)',
      padding: '0.75rem 1rem',
      fontSize: '0.875rem',
      marginTop: '2rem'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1.5rem',
        alignItems: 'center'
      }}>
        {/* Guild Information Section */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '0.25rem'
        }}>
          <div style={{
            fontWeight: '700',
            color: 'var(--text-primary)',
            fontSize: '1rem'
          }}>
            The Aquarium
          </div>
          <div style={{
            color: 'var(--text-muted)',
            fontSize: '0.75rem'
          }}>
            Wynncraft's premier aquatic-themed guild
          </div>
        </div>

        {/* Quick Navigation Links */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          justifyContent: 'center'
        }}>
          <Link 
            href="/members" 
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontWeight: '500',
              transition: 'color 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            Members
          </Link>
          <Link 
            href="/map" 
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontWeight: '500',
              transition: 'color 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            Map
          </Link>
          <Link 
            href="/lootpools" 
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontWeight: '500',
              transition: 'color 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            Lootpools
          </Link>
          <a 
            href="https://discord.gg/njRpZwKVaa" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              color: 'var(--color-ocean-500)',
              textDecoration: 'none',
              fontWeight: '600',
              transition: 'color 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-ocean-400)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ocean-500)'}
          >
            Join Discord
          </a>
        </div>

        {/* Site Information */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '0.25rem',
          textAlign: 'right'
        }}>
          {lastUpdated && (
            <div style={{
              color: 'var(--text-muted)',
              fontSize: '0.75rem'
            }}>
              Updated: {lastUpdated}
            </div>
          )}
        </div>
      </div>

      {/* Mobile-specific styles */}
      <style jsx>{`
        @media (max-width: 640px) {
          footer {
            padding: 0.5rem;
            font-size: 0.75rem;
          }
          
          footer > div {
            grid-template-columns: 1fr;
            gap: 1rem;
            text-align: center;
          }
          
          footer > div > div:last-child {
            align-items: center;
            text-align: center;
          }
        }
        
        @media (max-width: 480px) {
          footer {
            display: none;
          }
        }
      `}</style>
    </footer>
  );
}