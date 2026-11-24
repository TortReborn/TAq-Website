"use client";

import Link from 'next/link';
import { useState } from 'react';

/** The way back to the Bot Messages list from a panel or form editor: a solid
 *  button rather than bare text, so it doesn't float on the page background. */
export default function BackLink({ href = '/exec/bot-panels', label = 'Bot Messages' }: { href?: string; label?: string }) {
  const [hover, setHover] = useState(false);
  return (
    <Link href={href} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
        padding: '0.35rem 0.7rem 0.35rem 0.5rem', borderRadius: '0.375rem',
        background: hover ? 'var(--bg-card-solid-hover)' : 'var(--bg-card-solid)',
        border: '1px solid var(--border-card)',
        color: hover ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
        transition: 'background 0.15s, color 0.15s',
      }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </Link>
  );
}
