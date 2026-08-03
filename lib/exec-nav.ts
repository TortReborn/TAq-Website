import { ANALYTICS_DISCORD_ID } from '@/lib/analytics-auth';

/**
 * Single source of truth for the exec section taxonomy. The sidebar
 * (app/exec/layout.tsx) renders getNavGroups(); the dashboard quick-links
 * grid (app/exec/page.tsx) renders EXEC_NAV directly, skipping the
 * uncategorized group and permission-gated items.
 */

// Client-safe copy: lib/exec-auth.ts exports the canonical NARWHAL_RANKS but
// is server-only (imports crypto/next-server). Keep the two lists in sync.
const NARWHAL_RANKS = new Set(['Narwhal', 'Hydra', '✫✪✫ Hydra - Leader']);

export interface ExecNavItem {
  href: string;
  label: string;
  /** Shown in the dashboard quick-links grid */
  desc: string;
  /** SVG path `d`, shown in the sidebar */
  icon: string;
  /** Permission gate; gated items appear in the sidebar only */
  requires?: 'analytics' | 'narwhal';
}

export interface ExecNavGroup {
  category?: string;
  items: ExecNavItem[];
}

export const EXEC_NAV: ExecNavGroup[] = [
  {
    items: [
      { href: '/exec', label: 'Dashboard', desc: 'Exec command center', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
    ],
  },
  {
    category: 'Members',
    items: [
      { href: '/exec/applications', label: 'Applications', desc: 'Review and vote on applications', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { href: '/exec/activity', label: 'Activity', desc: 'Track activity and update kick list', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { href: '/exec/promotions', label: 'Promotions', desc: 'Manage and suggest promotions', icon: 'M5 10l7-7m0 0l7 7m-7-7v18' },
      { href: '/exec/blacklist', label: 'Blacklist', desc: 'View and add banned players', icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
    ],
  },
  {
    category: 'Activities',
    items: [
      { href: '/exec/guild-raids', label: 'Guild Raids', desc: 'Log raids and manage guild raid events', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { href: '/exec/snipes', label: 'Guild Wars', desc: 'Track territory snipe attempts', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z' },
      { href: '/exec/guild-bank', label: 'Guild Bank', desc: 'Track war consumables and items', icon: 'M4 7V4h16v3M9 20h6M12 4v16M4 7h16l-2 13H6L4 7z' },
    ],
  },
  {
    category: 'Economy',
    items: [
      { href: '/exec/inventory', label: 'Stock', desc: 'Track ingredient and consumable stock', icon: 'M20 7l-8-4-8 4m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10m-8-14v10l8 4' },
      { href: '/exec/accounting', label: 'Accounting', desc: 'Track guild funds and transactions', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M4 4h16v16H4z' },
      { href: '/exec/shells', label: 'Shells', desc: 'Manage member shell balances', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      { href: '/exec/shell-exchange', label: 'Shell Exchange', desc: 'Update exchange rates', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
      { href: '/exec/backgrounds', label: 'Backgrounds', desc: 'Manage profile backgrounds', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    ],
  },
  {
    category: 'Operations',
    items: [
      { href: '/exec/agenda', label: 'Agenda', desc: 'View and manage meeting agenda', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
      { href: '/exec/requests', label: 'Requests', desc: 'Report bugs and request features', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { href: '/exec/analytics', label: 'Analytics', desc: 'Site usage analytics', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', requires: 'analytics' },
      { href: '/exec/externals', label: 'Externals', desc: 'Manage externals and alliances', icon: 'M17 20h5v-2a4 4 0 00-4-4h-1M9 20H2v-2a4 4 0 014-4h3m3-2a4 4 0 100-8 4 4 0 000 8zm6-2a3 3 0 10-2.83-4', requires: 'narwhal' },
    ],
  },
];

function hasAccess(item: ExecNavItem, discordId?: string, rank?: string): boolean {
  switch (item.requires) {
    case 'analytics':
      return discordId === ANALYTICS_DISCORD_ID;
    case 'narwhal':
      return NARWHAL_RANKS.has(rank ?? '');
    default:
      return true;
  }
}

/** Sidebar nav groups, with permission-gated items filtered for this user. */
export function getNavGroups(discordId?: string, rank?: string): ExecNavGroup[] {
  return EXEC_NAV
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasAccess(item, discordId, rank)),
    }))
    .filter((group) => group.items.length > 0);
}
