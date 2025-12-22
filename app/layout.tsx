"use client";
import "./globals.css";
import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import BottomBar from '@/components/BottomBar';
import { Analytics } from "@vercel/analytics/react";

export default function RootLayout({ children }: { children: ReactNode }) {
  const [darkMode, setDarkMode] = useState(false);
  const [showSplash, setShowSplash] = useState(false); // Start with false
  const [splashFading, setSplashFading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Toggle dark mode and update document
  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    
    // Update the document attribute
    if (newDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  };
  
  // Load theme preference on mount and handle splash screen
  useEffect(() => {
    setMounted(true);
    
    // Sync React state with the theme that was already applied by the script
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    
    setDarkMode(shouldBeDark);
    
    // Apply theme immediately to prevent flash
    if (shouldBeDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    
    // Use performance.getEntriesByType to detect navigation type
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    // Show splash screen in these cases:
    // 1. Page refresh/reload
    // 2. New visit (no referrer)
    // 3. Coming from external site (different origin)
    const isPageRefresh = navigation.type === 'reload';
    const isFromExternalSite = document.referrer && 
                              new URL(document.referrer).origin !== window.location.origin;
    const isNewVisit = !document.referrer;
    
    const shouldShowSplash = isPageRefresh || isFromExternalSite || isNewVisit;
    
    if (shouldShowSplash) {
      setShowSplash(true);
      
      // Hide splash screen after 1000ms (1 second)
      const fadeTimer = setTimeout(() => {
        setSplashFading(true);
        // Actually remove after fade completes
        setTimeout(() => {
          setShowSplash(false);
        }, 300);
      }, 1000);
      
      return () => clearTimeout(fadeTimer);
    }
    // If it's client-side navigation within the app, showSplash stays false
  }, []);
  
  return (
    <html lang="en" data-theme={mounted && darkMode ? 'dark' : undefined}>
      <head>
        <title>The Aquarium</title>
        <meta name="description" content="The Aquarium - Wynncraft guild territory map, leaderboards, and member statistics" />

        {/* Open Graph */}
        <meta property="og:title" content="The Aquarium" />
        <meta property="og:description" content="Wynncraft guild territory map, leaderboards, and member statistics" />
        <meta property="og:image" content="https://the-aquarium.com/images/guildimages/icontransparent.png" />
        <meta property="og:url" content="https://the-aquarium.com" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="The Aquarium" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="The Aquarium" />
        <meta name="twitter:description" content="Wynncraft guild territory map and statistics" />
        <meta name="twitter:image" content="https://the-aquarium.com/images/guildimages/icontransparent.png" />

        {/* SEO */}
        <meta name="keywords" content="Wynncraft, The Aquarium, guild, territory map, leaderboard, Minecraft, MMORPG, guild wars, Tort Reborn, Wynn, guild stats" />
        <link rel="canonical" href="https://the-aquarium.com/" />

        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "The Aquarium",
              "description": "Wynncraft guild territory tracking and statistics",
              "url": "https://the-aquarium.com"
            })
          }}
        />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&display=swap" rel="stylesheet" />
      </head>
      <body style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        margin: 0,
        color: 'var(--text-primary)',
        background: 'var(--bg-gradient)',
        fontFamily: "'Roboto', ui-sans-serif, system-ui, sans-serif"
      }}>
        {/* Splash Screen */}
        {showSplash && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 50%, #1e3a8a 100%)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 9999,
              opacity: splashFading ? 0 : 1,
              transition: 'opacity 0.3s ease-out'
            }}
          >
            <div style={{
              textAlign: 'center',
              animation: 'fadeInUp 0.4s ease-out',
              height: '80vh',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '2rem'
            }}>
              {/* Guild Icon */}
              <img 
                src="/images/guildimages/icontransparent.png" 
                alt="The Aquarium Guild Icon"
                style={{
                  width: '450px',
                  height: '450px',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))'
                }}
              />
              
              {/* Guild Name */}
              <h1 style={{
                fontSize: '3.5rem',
                fontWeight: '900',
                color: '#ffffff',
                margin: 0,
                textShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }}>
                The Aquarium
              </h1>
              
              {/* Pulsing Loading Bar */}
              <div style={{
                width: '120px',
                height: '8px',
                background: '#60a5fa',
                borderRadius: '4px',
                animation: 'pulse 1s ease-in-out infinite'
              }}></div>
            </div>
          </div>
        )}
        
        {/* Navigation Bar - mobile responsive */}
        <nav className="nav-font" style={{
          width: '100%',
          background: 'var(--bg-nav)',
          padding: '1rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          position: 'relative'
        }}>
          {/* Left side - Logo and Navigation Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <a 
              href="/" 
              style={{ 
                textDecoration: 'none',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15), inset 0 1px 2px rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25), inset 0 1px 2px rgba(255,255,255,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15), inset 0 1px 2px rgba(255,255,255,0.1)';
              }}
            >
              <img 
                src="/images/guildimages/icontransparent.png" 
                alt="Home"
                style={{
                  width: '42px',
                  height: '42px',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))'
                }}
              />
            </a>

            {/* Desktop Navigation Links */}
            <div className="desktop-nav" style={{
              display: 'flex',
              gap: '1.5rem',
              alignItems: 'center'
            }}>
            <a
              href="/members"
              style={{
                color: 'var(--text-primary)',
                fontWeight: 'bold',
                fontSize: '1.125rem',
                textDecoration: 'none',
                transition: 'all 0.3s ease',
                padding: '8px 12px',
                borderRadius: '6px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >Members</a>
            <a
              href="/leaderboard"
              style={{
                color: 'var(--text-primary)',
                fontWeight: 'bold',
                fontSize: '1.125rem',
                textDecoration: 'none',
                transition: 'all 0.3s ease',
                padding: '8px 12px',
                borderRadius: '6px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >Leaderboard</a>
            <a
              href="/graid-event"
              style={{
                color: 'var(--text-primary)',
                fontWeight: 'bold',
                fontSize: '1.125rem',
                textDecoration: 'none',
                transition: 'all 0.3s ease',
                padding: '8px 12px',
                borderRadius: '6px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >Graid Event</a>
            <a
              href="/map"
              style={{
                color: 'var(--text-primary)',
                fontWeight: 'bold',
                fontSize: '1.125rem',
                textDecoration: 'none',
                transition: 'all 0.3s ease',
                padding: '8px 12px',
                borderRadius: '6px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >Map</a>
            <a
              href="/lootpools"
              style={{
                color: 'var(--text-primary)',
                fontWeight: 'bold',
                fontSize: '1.125rem',
                textDecoration: 'none',
                transition: 'all 0.3s ease',
                padding: '8px 12px',
                borderRadius: '6px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >Lootpools</a>
            </div>
          </div>

          {/* Right side controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Apply button */}
            <a
              href="https://discord.gg/njRpZwKVaa"
              target="_blank"
              rel="noopener noreferrer"
              className="mobile-apply-button"
              style={{
                padding: '8px 16px',
                background: 'linear-gradient(135deg, #5865f2 0%, #4752c4 100%)',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '600',
                transition: 'all 0.3s ease',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(88, 101, 242, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(88, 101, 242, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(88, 101, 242, 0.3)';
              }}
            >
              📝 Apply
            </a>
            
            {/* Dark mode toggle pill */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
              type="button"
              aria-label="Toggle dark mode"
              onClick={toggleDarkMode}
              style={{
                position: 'relative',
                width: '64px',
                height: '32px',
                background: darkMode ? '#374151' : '#b2e9f7',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 8px',
                transition: 'all 0.3s',
                border: `1px solid ${darkMode ? '#4b5563' : '#82d8f1'}`,
                cursor: 'pointer'
              }}
            >
              {/* Sun icon */}
              <span style={{ 
                flex: 1, 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                opacity: darkMode ? 0.4 : 1,
                transition: 'opacity 0.3s'
              }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="4" fill="#FBBF24" />
                  <g stroke="#FBBF24" strokeWidth="2">
                    <line x1="10" y1="1" x2="10" y2="3" />
                    <line x1="10" y1="17" x2="10" y2="19" />
                    <line x1="1" y1="10" x2="3" y2="10" />
                    <line x1="17" y1="10" x2="19" y2="10" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="14.36" y1="14.36" x2="15.78" y2="15.78" />
                    <line x1="4.22" y1="15.78" x2="5.64" y2="14.36" />
                    <line x1="14.36" y1="5.64" x2="15.78" y2="4.22" />
                  </g>
                </svg>
              </span>
              {/* Moon icon */}
              <span style={{ 
                flex: 1, 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                opacity: darkMode ? 1 : 0.4,
                transition: 'opacity 0.3s'
              }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.293 13.293A8 8 0 0 1 6.707 2.707a8.001 8.001 0 1 0 10.586 10.586z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
                </svg>
              </span>
              {/* Sliding white circle (toggle indicator) */}
              <span
                style={{
                  position: 'absolute',
                  left: darkMode ? '4px' : '36px',
                  width: '24px',
                  height: '24px',
                  background: 'white',
                  borderRadius: '50%',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  transition: 'left 0.3s ease'
                }}
              />
            </button>
            </div>

            {/* Mobile hamburger menu */}
            <button
              type="button"
              aria-label="Toggle mobile menu"
              className="mobile-menu-button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                width: '40px',
                height: '40px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                gap: '4px'
              }}
            >
              <span style={{
                width: '24px',
                height: '2px',
                background: 'var(--text-primary)',
                transition: 'all 0.3s ease',
                transform: mobileMenuOpen ? 'rotate(45deg) translateY(6px)' : 'none'
              }} />
              <span style={{
                width: '24px',
                height: '2px',
                background: 'var(--text-primary)',
                transition: 'all 0.3s ease',
                opacity: mobileMenuOpen ? 0 : 1
              }} />
              <span style={{
                width: '24px',
                height: '2px',
                background: 'var(--text-primary)',
                transition: 'all 0.3s ease',
                transform: mobileMenuOpen ? 'rotate(-45deg) translateY(-6px)' : 'none'
              }} />
            </button>
          </div>

          {/* Mobile dropdown menu */}
          {mobileMenuOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              background: 'var(--bg-nav)',
              border: '1px solid var(--border-color)',
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              zIndex: 1000,
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <a
                href="/members"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  color: 'var(--text-primary)',
                  fontWeight: 'bold',
                  fontSize: '1.125rem',
                  textDecoration: 'none',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >Members</a>
              <a
                href="/leaderboard"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  color: 'var(--text-primary)',
                  fontWeight: 'bold',
                  fontSize: '1.125rem',
                  textDecoration: 'none',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >Leaderboard</a>
              <a
                href="/graid-event"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  color: 'var(--text-primary)',
                  fontWeight: 'bold',
                  fontSize: '1.125rem',
                  textDecoration: 'none',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >Graid Event</a>
              <a
                href="/map"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  color: 'var(--text-primary)',
                  fontWeight: 'bold',
                  fontSize: '1.125rem',
                  textDecoration: 'none',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >Map</a>
              <a
                href="/lootpools"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  color: 'var(--text-primary)',
                  fontWeight: 'bold',
                  fontSize: '1.125rem',
                  textDecoration: 'none',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >Lootpools</a>
            </div>
          )}
        </nav>
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
        <Analytics />
        <BottomBar />
      </body>
    </html>
  );
}
