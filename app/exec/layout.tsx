"use client";

import { usePathname, useRouter } from 'next/navigation';
import { useExecSession } from '@/hooks/useExecSession';
import { getRankColor } from '@/lib/rank-constants';
import { getNavGroups } from '@/lib/exec-nav';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import OnboardingTour from '@/components/OnboardingTour';
import OnboardingTrigger from '@/components/OnboardingTrigger';
import { useOnboardingTour } from '@/hooks/useOnboardingTour';

// Auth-required pages (login and unauthorized are public)
const PUBLIC_PATHS = ['/exec/login', '/exec/unauthorized'];

export default function ExecLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, authenticated, isExec, loading } = useExecSession();

  const isPublicPage = PUBLIC_PATHS.includes(pathname);
  const tour = useOnboardingTour(authenticated && isExec && pathname === '/exec');
  const navGroups = useMemo(() => getNavGroups(user?.discord_id, user?.rank), [user?.discord_id, user?.rank]);

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
        width: 'clamp(180px, 12vw, 260px)',
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
                width: 'clamp(36px, 2.5vw, 48px)',
                height: 'clamp(36px, 2.5vw, 48px)',
                borderRadius: '50%',
                border: '2px solid var(--color-ocean-400)',
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 'clamp(0.85rem, 0.6vw, 1.05rem)',
                fontWeight: '600',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {user.ign || user.discord_username}
              </div>
              <div style={{
                fontSize: 'clamp(0.7rem, 0.5vw, 0.85rem)',
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
          {navGroups.map((group, groupIndex) => (
            <div key={group.category || 'top'} data-tour={group.category ? `nav-${group.category.toLowerCase()}` : undefined}>
              {group.category && (
                <div style={{
                  fontSize: 'clamp(0.65rem, 0.45vw, 0.8rem)',
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
                      fontSize: 'clamp(0.875rem, 0.6vw, 1.05rem)',
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
                    <svg style={{ width: 'clamp(18px, 1.2vw, 24px)', height: 'clamp(18px, 1.2vw, 24px)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <OnboardingTrigger onRestart={() => {
            if (pathname !== '/exec') {
              router.push('/exec');
              // Wait for dashboard to render before starting tour
              const waitForDashboard = () => {
                const el = document.querySelector('[data-tour="stats"]');
                if (el) {
                  tour.restartTour();
                } else {
                  requestAnimationFrame(waitForDashboard);
                }
              };
              // Start checking after a brief delay for navigation
              setTimeout(waitForDashboard, 100);
            } else {
              tour.restartTour();
            }
          }} />
          <a
            href="/api/auth/discord/logout"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.45rem 0.75rem',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              fontSize: 'clamp(0.875rem, 0.6vw, 1.05rem)',
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
            <svg style={{ width: 'clamp(18px, 1.2vw, 24px)', height: 'clamp(18px, 1.2vw, 24px)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
