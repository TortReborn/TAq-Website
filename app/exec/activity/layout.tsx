"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Shell for the two views of guild activity: the member roster and the
 * guild-wide trends. They answer the same question at different zoom levels —
 * "who is active" and "how active are we" — so they share a heading and a tab
 * bar rather than sitting in separate sidebar entries.
 *
 * These are real routes rather than tab state so each view is linkable, the
 * back button works, and the chart code only loads for the tab that draws it.
 */
const TABS = [
  { href: '/exec/activity', label: 'Members', desc: 'Per-member activity and the kick list' },
  { href: '/exec/activity/trends', label: 'Trends', desc: 'Guild-wide activity over time' },
];

export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Longest matching prefix, so a future nested route highlights its parent
  // tab instead of falling back to the first one.
  const active = TABS.map((t) => t.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0] ?? TABS[0].href;

  return (
    <div>
      <h1 style={{
        fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)',
        margin: '0 0 0.75rem',
      }}>
        Activity
      </h1>

      <div
        role="tablist"
        aria-label="Activity views"
        style={{
          display: 'flex', gap: '0.375rem', flexWrap: 'wrap',
          borderBottom: '1px solid var(--border-card)',
          marginBottom: '1.25rem', paddingBottom: '0.6rem',
        }}
      >
        {TABS.map((tab) => {
          const isActive = tab.href === active;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              role="tab"
              aria-selected={isActive}
              title={tab.desc}
              style={{
                fontSize: '0.85rem',
                fontWeight: isActive ? 700 : 500,
                padding: '0.4rem 0.9rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                border: `1px solid ${isActive ? 'var(--color-ocean-400)' : 'transparent'}`,
                background: isActive ? 'var(--color-ocean-600)' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
