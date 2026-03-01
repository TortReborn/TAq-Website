"use client";

import Link from 'next/link';

export default function UnauthorizedPage() {
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
        <div style={{
          fontSize: '3rem',
          marginBottom: '1rem',
        }}>
          &#x1F6AB;
        </div>

        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          color: '#ef4444',
          margin: '0 0 1rem',
        }}>
          Access Denied
        </h1>

        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '0.9rem',
          margin: '0 0 2rem',
          lineHeight: '1.5',
        }}>
          Your Discord account does not have the Executive role required to access this panel. If you believe this is an error, contact a guild leader.
        </p>

        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            background: 'var(--color-ocean-500)',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '0.5rem',
            fontSize: '0.9rem',
            fontWeight: '600',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          Return Home
        </Link>
      </div>
    </main>
  );
}
