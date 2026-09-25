"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import AnimatedCounter from '@/components/AnimatedCounter';

interface PublicStats {
  guild: {
    level: number | null;
    levelPlacement: number | null;
    wars: number | null;
    warsPlacement: number | null;
    raids: number | null;
    raidsPlacement: number | null;
    territories: number | null;
  };
  hqSnipes: {
    season: number | null;
    count: number;
  };
}

export default function HomePage() {
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  const [stats, setStats] = useState<PublicStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/public-stats')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setStats(data);
      })
      .catch(() => {
        // stats tiles just stay in their loading state
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Check if user has already scrolled this session
    const hasScrolled = sessionStorage.getItem('homeScrolled');
    if (hasScrolled) {
      setShowScrollIndicator(false);
      return;
    }

    const handleScroll = () => {
      if (window.scrollY > 50) {
        setShowScrollIndicator(false);
        sessionStorage.setItem('homeScrolled', 'true');
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <main className="home-page">
      {/* Hero Section - Side by Side */}
      <section className="home-hero">
        <div className="home-hero-split">
          <div className="home-hero-left">
            <div className="home-hero-logo">
              <Image
                src="/images/guildimages/icontransparent.png"
                alt="The Aquarium"
                fill
                sizes="280px"
                style={{ objectFit: 'contain' }}
                priority
              />
            </div>
          </div>
          <div className="home-hero-right">
            <h1 className="home-hero-title">The Aquarium</h1>
            <p className="home-hero-description">
              Dive into Wynncraft's most established aquatic guild! Whether it's sniping HQs,
              wiping claims, completing guild raids, participating in events, or just hanging
              out with an active, welcoming and stress-free community, there's a place for
              you here.
            </p>
            <a
              href="https://discord.gg/njRpZwKVaa"
              target="_blank"
              rel="noopener noreferrer"
              className="home-cta-button"
            >
              Join Discord
            </a>
          </div>
        </div>

        {/* Scroll Indicator */}
        {showScrollIndicator && (
          <div className="scroll-indicator">
            <span>Scroll</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </div>
        )}
      </section>

      {/* Stats Section - animated counters */}
      <section className="home-section home-stats-section">
        <div className="home-section-content">
          <h2 className="home-section-title">Guild Stats</h2>
          <div className="home-stats-grid">
            <div className="home-stat-card">
              <AnimatedCounter
                value={stats?.guild.wars ?? null}
                className="home-stat-value"
              />
              <span className="home-stat-label">Total Wars</span>
              {stats?.guild.warsPlacement && (
                <span className="home-stat-badge">Server Rank #{stats.guild.warsPlacement}</span>
              )}
            </div>
            <div className="home-stat-card">
              <AnimatedCounter
                value={stats?.guild.raids ?? null}
                className="home-stat-value"
              />
              <span className="home-stat-label">Guild Raids</span>
              {stats?.guild.raidsPlacement && (
                <span className="home-stat-badge">Server Rank #{stats.guild.raidsPlacement}</span>
              )}
            </div>
            <div className="home-stat-card">
              <AnimatedCounter
                value={stats?.guild.level ?? null}
                className="home-stat-value"
              />
              <span className="home-stat-label">Guild Level</span>
              {stats?.guild.levelPlacement && (
                <span className="home-stat-badge">Server Rank #{stats.guild.levelPlacement}</span>
              )}
            </div>
            <div className="home-stat-card">
              <AnimatedCounter
                value={stats?.hqSnipes.count ?? null}
                className="home-stat-value"
              />
              <span className="home-stat-label">HQ Snipes</span>
              <span className="home-stat-badge">
                {stats?.hqSnipes.season ? `Season ${stats.hqSnipes.season}` : 'This Season'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="home-section home-section-dark">
        <div className="home-section-content">
          <h2 className="home-section-title">Inside TAq</h2>
          <div className="home-features">
            <div className="home-feature">
              <div className="home-feature-icon">
                <Image
                  src="/images/home/tort-reborn-avatar.webp"
                  alt="Tort Reborn"
                  width={64}
                  height={64}
                  style={{ objectFit: 'contain', borderRadius: '50%' }}
                />
              </div>
              <h3>Guild Tools</h3>
              <p>This website, our Discord Bot Tort and our own guild mod provide a lot of utility for you and come together in a big ecosystem.</p>
            </div>
            <div className="home-feature">
              <div className="home-feature-icon">
                <Image
                  src="/images/mythics/spear.fire3.png"
                  alt="Wars & Raids"
                  width={64}
                  height={64}
                  style={{ objectFit: 'contain' }}
                />
              </div>
              <h3>Wars &amp; Raids</h3>
              <p>Join regular war and raid parties, find builds, comprehensive guides and learn from experienced players.</p>
            </div>
            <div className="home-feature">
              <div className="home-feature-icon">
                <Image
                  src="/images/home/community-icon.png"
                  alt="Active Community"
                  width={64}
                  height={64}
                  style={{ objectFit: 'contain', imageRendering: 'pixelated' }}
                />
              </div>
              <h3>Active Community</h3>
              <p>Meet new people and chat around, participate in regular events, or just play along while the guild chat plays like a podcast.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Links Section */}
      <section className="home-section">
        <div className="home-section-content">
          <h2 className="home-section-title">Guild Tools</h2>
          <div className="home-links">
            <a href="/map" className="home-link">
              <div className="home-link-content">
                <span className="home-link-title">Territory Map</span>
                <span className="home-link-desc">View live territory, history, and custom map layers</span>
              </div>
              <span className="home-link-arrow">→</span>
            </a>
            <Link href="/members" className="home-link">
              <div className="home-link-content">
                <span className="home-link-title">Members</span>
                <span className="home-link-desc">Browse the roster and member profiles</span>
              </div>
              <span className="home-link-arrow">→</span>
            </Link>
            <Link href="/leaderboard" className="home-link">
              <div className="home-link-content">
                <span className="home-link-title">Leaderboard</span>
                <span className="home-link-desc">Rank members by contribution</span>
              </div>
              <span className="home-link-arrow">→</span>
            </Link>
            <Link href="/graid-event" className="home-link">
              <div className="home-link-content">
                <span className="home-link-title">Guild Raid Events</span>
                <span className="home-link-desc">Follow current and past graid events</span>
              </div>
              <span className="home-link-arrow">→</span>
            </Link>
            <Link href="/lootpools" className="home-link">
              <div className="home-link-content">
                <span className="home-link-title">Lootpools</span>
                <span className="home-link-desc">Check weekly lootrun and raid rotations</span>
              </div>
              <span className="home-link-arrow">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="home-section home-section-cta">
        <div className="home-section-content">
          <h2 className="home-cta-title">Want to join TAq?</h2>
          <p className="home-cta-text">Apply through our Discord.</p>
          <a
            href="https://discord.gg/njRpZwKVaa"
            target="_blank"
            rel="noopener noreferrer"
            className="home-cta-button"
          >
            Open Discord
          </a>
        </div>
      </section>
    </main>
  );
}
