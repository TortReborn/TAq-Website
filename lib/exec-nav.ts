import { ANALYTICS_DISCORD_ID } from '@/lib/analytics-auth';

/**
 * Single source of truth for the exec section taxonomy. The sidebar
 * (app/exec/layout.tsx) renders getNavGroups(); the dashboard quick-links
 * grid (app/exec/page.tsx) renders EXEC_NAV directly, skipping the
 * uncategorized group and permission-gated items.
 */

// Client-safe copy: lib/exec-auth.ts exports the canonical NARWHAL_RANKS but
// is server-only (imports crypto and next/server). Keep the two lists in sync.
const NARWHAL_RANKS = new Set(['Narwhal', 'Hydra', '✫✪✫ Hydra - Leader']);

export interface ExecNavItem {
  href: string;
  label: string;
  /** Shown in the dashboard quick-links grid */
  desc: string;
  icon?: string;
  iconImage?: string;
  iconLarge?: boolean;
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
      { href: '/exec', label: 'Dashboard', desc: 'Exec command center', iconImage: '/images/icons/exec/dashboard.png' },
    ],
  },
  {
    category: 'Members',
    items: [
      { href: '/exec/applications', label: 'Applications', desc: 'Review and vote on applications', iconImage: '/images/icons/exec/applications.png' },
      { href: '/exec/activity', label: 'Activity', desc: 'Track activity and update kick list', iconImage: '/images/icons/exec/activity.png' },
      { href: '/exec/promotions', label: 'Promotions', desc: 'Manage and suggest promotions', iconImage: '/images/icons/exec/promotions.png' },
      { href: '/exec/blacklist', label: 'Blacklist', desc: 'View and add banned players', iconImage: '/images/icons/exec/blacklist.png' },
    ],
  },
  {
    category: 'Activities',
    items: [
      { href: '/exec/guild-raids', label: 'Guild Raids', desc: 'Log raids and manage guild raid events', iconImage: '/images/icons/exec/guild-raids.png', iconLarge: true },
      { href: '/exec/snipes', label: 'Guild Wars', desc: 'Track territory snipe attempts', iconImage: '/images/icons/exec/guild-wars.png' },
      { href: '/exec/guild-bank', label: 'Guild Bank', desc: 'Track war consumables and items', iconImage: '/images/icons/exec/guild-bank.png' },
    ],
  },
  {
    category: 'Economy',
    items: [
      { href: '/exec/inventory', label: 'Inventory', desc: 'Track ingredient, consumable, and material stock', iconImage: '/images/icons/exec/inventory.png', iconLarge: true },
      { href: '/exec/accounting', label: 'Accounting', desc: 'Track guild funds and transactions', iconImage: '/images/icons/exec/accounting.png' },
      { href: '/exec/shells', label: 'Shells', desc: 'Manage member shell balances', iconImage: '/images/icons/exec/shells.png' },
      { href: '/exec/shell-exchange', label: 'Shell Exchange', desc: 'Update exchange rates', iconImage: '/images/icons/exec/shell-exchange.png' },
      { href: '/exec/backgrounds', label: 'Backgrounds', desc: 'Manage profile backgrounds', iconImage: '/images/icons/exec/backgrounds.png' },
    ],
  },
  {
    category: 'Operations',
    items: [
      { href: '/exec/agenda', label: 'Agenda', desc: 'View and manage meeting agenda', iconImage: '/images/icons/exec/agenda.png' },
      { href: '/exec/requests', label: 'Requests', desc: 'Report bugs and request features', iconImage: '/images/icons/exec/requests.png' },
      { href: '/exec/analytics', label: 'Analytics', desc: 'Site usage analytics', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', requires: 'analytics' },
      { href: '/exec/externals', label: 'Externals', desc: 'Manage externals and alliances', iconImage: '/images/icons/exec/externals.png', requires: 'narwhal' },
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
