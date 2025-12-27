"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);

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
                style={{ objectFit: 'contain' }}
                priority
              />
            </div>
          </div>
          <div className="home-hero-right">
            <h1 className="home-hero-title">The Aquarium</h1>
            <p className="home-hero-description">
              Dive into Wynncraft's most active aquatic guild! Whether it be sniping the most
              powerful guilds on the map, slaying raid bosses, or just
              hanging out with an active and welcoming community, there's a place for you here.
            </p>
            <a
              href="https://discord.gg/njRpZwKVaa"
              target="_blank"
              rel="noopener noreferrer"
              className="home-cta-button"
            >
              Join Our Discord
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

      {/* Features Section */}
      <section className="home-section home-section-dark">
        <div className="home-section-content">
          <h2 className="home-section-title">What We Offer</h2>
          <div className="home-features">
            <div className="home-feature">
              <div className="home-feature-icon">
                <Image
                  src="/images/mythics/spear.fire3.png"
                  alt="Territory Wars"
                  width={64}
                  height={64}
                  style={{ objectFit: 'contain' }}
                />
              </div>
              <h3>Guild Wars</h3>
              <p>Fight for honor and glory across the map of Wynncraft! We still require members
                to get a healthy amount of sleep.
              </p>
            </div>
            <div className="home-feature">
              <div className="home-feature-icon">
                <Image
                  src="/images/raids/aspect_warrior.png"
                  alt="Guild Raids"
                  width={64}
                  height={64}
                  style={{ objectFit: 'contain' }}
                />
              </div>
              <h3>Guild Raids</h3>
              <p>Join our seasoned veterans in consistent graids! Regardless of if it's pummelling the 
                grootslang or outrunning Greg, we got your back.
              </p>
            </div>
            <div className="home-feature">
              <div className="home-feature-icon">👥</div>
              <h3>Active Community</h3>
              <p>150 members, experienced leadership, and (semi)regular events to fulfill 
                all your community needs!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Links Section */}
      <section className="home-section">
        <div className="home-section-content">
          <h2 className="home-section-title">Explore</h2>
          <div className="home-links">
            <Link href="/map" className="home-link">
              <div className="home-link-content">
                <span className="home-link-title">Territory Map</span>
                <span className="home-link-desc">Various views of the Wynncraft map</span>
              </div>
              <span className="home-link-arrow">→</span>
            </Link>
            <Link href="/members" className="home-link">
              <div className="home-link-content">
                <span className="home-link-title">Members</span>
                <span className="home-link-desc">Browse our roster and member profiles</span>
              </div>
              <span className="home-link-arrow">→</span>
            </Link>
            <Link href="/leaderboard" className="home-link">
              <div className="home-link-content">
                <span className="home-link-title">Leaderboard</span>
                <span className="home-link-desc">See our top contributors ranked</span>
              </div>
              <span className="home-link-arrow">→</span>
            </Link>
            <Link href="/graid-event" className="home-link">
              <div className="home-link-content">
                <span className="home-link-title">Guild Raid Events</span>
                <span className="home-link-desc">Track ongoing and previous graid events</span>
              </div>
              <span className="home-link-arrow">→</span>
            </Link>
            <Link href="/lootpools" className="home-link">
              <div className="home-link-content">
                <span className="home-link-title">Lootpools</span>
                <span className="home-link-desc">View raid loot distributions and drops</span>
              </div>
              <span className="home-link-arrow">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="home-section home-section-cta">
        <div className="home-section-content">
          <h2 className="home-cta-title">Ready to Dive In?</h2>
          <p className="home-cta-text">Join our Discord and become part of the crew.</p>
          <a
            href="https://discord.gg/njRpZwKVaa"
            target="_blank"
            rel="noopener noreferrer"
            className="home-cta-button"
          >
            Apply Now
          </a>
        </div>
      </section>
    </main>
  );
}
