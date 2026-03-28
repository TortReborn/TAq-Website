"use client";

import { usePathname, useRouter } from 'next/navigation';
import { useExecSession } from '@/hooks/useExecSession';
import { getRankColor } from '@/lib/rank-constants';
import Link from 'next/link';
import { useEffect } from 'react';
import OnboardingTour from '@/components/OnboardingTour';
import OnboardingTrigger from '@/components/OnboardingTrigger';
import { useOnboardingTour } from '@/hooks/useOnboardingTour';

const NAV_GROUPS = [
  {
    items: [
      { href: '/exec', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
    ],
  },
  {
    category: 'Members',
    items: [
      { href: '/exec/applications', label: 'Applications', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { href: '/exec/activity', label: 'Activity', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { href: '/exec/promotions', label: 'Promotions', icon: 'M5 10l7-7m0 0l7 7m-7-7v18' },
      { href: '/exec/blacklist', label: 'Blacklist', icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
    ],
  },
  {
    category: 'Activities',
    items: [
      { href: '/exec/graid', label: 'Graid Events', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
      { href: '/exec/snipes', label: 'Snipes', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z' },
      { href: '/exec/builds', label: 'War Builds', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
      { href: '/exec/guild-bank', label: 'Guild Bank', icon: 'M4 7V4h16v3M9 20h6M12 4v16M4 7h16l-2 13H6L4 7z' },
    ],
  },
  {
    category: 'Economy',
    items: [
      { href: '/exec/shells', label: 'Shells', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      { href: '/exec/shell-exchange', label: 'Shell Exchange', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
      { href: '/exec/backgrounds', label: 'Backgrounds', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    ],
  },
  {
    category: 'Operations',
    items: [
      { href: '/exec/agenda', label: 'Agenda', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    ],
  },
];

// Auth-required pages (login and unauthorized are public)
const PUBLIC_PATHS = ['/exec/login', '/exec/unauthorized'];

export default function ExecLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, authenticated, isExec, loading } = useExecSession();

  const isPublicPage = PUBLIC_PATHS.includes(pathname);
  const tour = useOnboardingTour(authenticated && isExec && pathname === '/exec');

  useEffect(() => {
    if (!loading && !isPublicPage) {
      if (!authenticated) {
        router.push('/login');
      } else if (!isExec) {
        router.push('/profile');
      }
    }
  }, [loading, authenticated, isExec, isPublicPage, router]);

  // Public pages render without the sidebar
  if (isPublicPage) {
    return <>{children}</>;
  }

  // Loading state
  if (loading) {
    return (
      <main style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 80px)',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--border-card)',
          borderTop: '3px solid var(--color-ocean-400)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  // Not authenticated or not exec - redirect will happen via useEffect
  if (!authenticated || !isExec) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: 'calc(100vh - 80px)',
    }}>
      {/* Sidebar */}
      <aside style={{
        width: '180px',
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border-card)',
        padding: '1rem 0',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* User info */}
        {user && (
          <div style={{
            padding: '0 1.25rem 0.75rem',
            borderBottom: '1px solid var(--border-card)',
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <img
              src={user.discord_avatar}
              alt={user.discord_username}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: '2px solid var(--color-ocean-400)',
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '0.85rem',
                fontWeight: '600',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {user.ign || user.discord_username}
              </div>
              <div style={{
                fontSize: '0.7rem',
                fontWeight: '600',
                color: user.rank ? getRankColor(user.rank) : 'var(--text-secondary)',
              }}>
                {user.rank || 'Executive'}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.125rem',
          padding: '0 0.75rem',
          flex: 1,
        }}>
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.category || 'top'} data-tour={group.category ? `nav-${group.category.toLowerCase()}` : undefined}>
              {group.category && (
                <div style={{
                  fontSize: '0.65rem',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-secondary)',
                  textAlign: 'center',
                  padding: '0.25rem 0',
                  margin: groupIndex === 1 ? '0.375rem 0 0.25rem' : '0.625rem 0 0.25rem',
                  background: 'rgba(255, 255, 255, 0.06)',
                  borderRadius: '0.375rem',
                }}>
                  {group.category}
                </div>
              )}
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.45rem 0.75rem',
                      borderRadius: '0.5rem',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      fontWeight: isActive ? '600' : '500',
                      color: isActive ? 'var(--color-ocean-400)' : 'var(--text-secondary)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={item.icon} />
                    </svg>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Help & Logout */}
        <div style={{ padding: '0 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          <OnboardingTrigger onRestart={tour.restartTour} />
          <a
            href="/api/auth/discord/logout"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.45rem 0.75rem',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: 'var(--text-secondary)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              e.currentTarget.style.color = '#ef4444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Logout
          </a>
        </div>
      </aside>

      {/* Main content */}
      <main style={{
        flex: 1,
        padding: '2rem',
        overflow: 'auto',
      }}>
        {children}
      </main>

      <OnboardingTour {...tour} />
    </div>
  );
}
