"use client";

import { usePathname, useRouter } from 'next/navigation';
import { useExecSession } from '@/hooks/useExecSession';
import { getRankColor } from '@/lib/rank-constants';
import Link from 'next/link';
import { useEffect } from 'react';

const NAV_ITEMS = [
  { href: '/exec', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { href: '/exec/activity', label: 'Activity', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { href: '/exec/applications', label: 'Applications', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { href: '/exec/promotions', label: 'Promotions', icon: 'M5 10l7-7m0 0l7 7m-7-7v18' },
  { href: '/exec/blacklist', label: 'Blacklist', icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
  { href: '/exec/graid', label: 'Graid Events', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { href: '/exec/agenda', label: 'Agenda', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
];

// Auth-required pages (login and unauthorized are public)
const PUBLIC_PATHS = ['/exec/login', '/exec/unauthorized'];

export default function ExecLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, authenticated, loading } = useExecSession();

  const isPublicPage = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (!loading && !authenticated && !isPublicPage) {
      router.push('/exec/login');
    }
  }, [loading, authenticated, isPublicPage, router]);

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

  // Not authenticated - redirect will happen via useEffect
  if (!authenticated) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: 'calc(100vh - 80px)',
    }}>
      {/* Sidebar */}
      <aside style={{
        width: '240px',
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border-card)',
        padding: '1.5rem 0',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* User info */}
        {user && (
          <div style={{
            padding: '0 1.25rem 1.25rem',
            borderBottom: '1px solid var(--border-card)',
            marginBottom: '1rem',
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
          gap: '0.25rem',
          padding: '0 0.75rem',
          flex: 1,
        }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.625rem 0.75rem',
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
        </nav>

        {/* Logout */}
        <div style={{ padding: '0 0.75rem' }}>
          <a
            href="/api/auth/discord/logout"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.625rem 0.75rem',
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
    </div>
  );
}
