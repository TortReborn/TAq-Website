"use client";

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const errorMessages: Record<string, string> = {
    denied: 'You cancelled the Discord authorization.',
    missing_params: 'Invalid callback parameters. Please try again.',
    invalid_state: 'Session expired. Please try again.',
    auth_failed: 'Authentication failed. Please try again.',
    config: 'Server configuration error. Contact an admin.',
  };

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 'calc(100vh - 80px)',
      padding: '2rem',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '1rem',
        padding: '3rem',
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        border: '1px solid var(--border-card)',
      }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-ocean-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>

        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: '800',
          background: 'linear-gradient(135deg, var(--color-ocean-400), var(--color-ocean-600))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          margin: '0 0 0.5rem',
        }}>
          Executive Panel
        </h1>

        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '0.9rem',
          margin: '0 0 2rem',
          lineHeight: '1.5',
        }}>
          Sign in with your Discord account to access the executive dashboard. You must have the Executive role.
        </p>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
            color: '#ef4444',
            fontSize: '0.85rem',
          }}>
            {errorMessages[error] || 'An unknown error occurred.'}
          </div>
        )}

        <a
          href="/api/auth/discord"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.875rem 2rem',
            background: 'linear-gradient(135deg, #5865f2 0%, #4752c4 100%)',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '0.75rem',
            fontSize: '1rem',
            fontWeight: '600',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 12px rgba(88, 101, 242, 0.4)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(88, 101, 242, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(88, 101, 242, 0.4)';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 71 55" fill="white">
            <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.5 37.5 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 4.9a.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.1a58.7 58.7 0 0017.9 9.1.2.2 0 00.3-.1 42.1 42.1 0 003.6-5.9.2.2 0 00-.1-.3 38.7 38.7 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 41.9 41.9 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4c-1.8 1-3.6 1.9-5.5 2.7a.2.2 0 00-.1.3 47.3 47.3 0 003.6 5.9.2.2 0 00.3.1A58.5 58.5 0 0070.3 45.6v-.1c1.4-15-2.3-28-9.8-39.6a.2.2 0 00-.1-.1zM23.7 37.3c-3.4 0-6.3-3.2-6.3-7s2.8-7 6.3-7c3.5 0 6.4 3.1 6.3 7 0 3.9-2.8 7-6.3 7zm23.2 0c-3.4 0-6.3-3.2-6.3-7s2.8-7 6.3-7c3.5 0 6.4 3.1 6.3 7 0 3.9-2.8 7-6.3 7z" />
          </svg>
          Sign in with Discord
        </a>
      </div>
    </main>
  );
}

export default function ExecLoginPage() {
  return (
    <Suspense fallback={
      <main style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 80px)',
      }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </main>
    }>
      <LoginContent />
    </Suspense>
  );
}
