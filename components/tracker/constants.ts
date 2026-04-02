import type { TicketStatus, TicketPriority } from '@/hooks/useExecTracker';

/* ─── Column order ─── */

export const COLUMN_ORDER: TicketStatus[] = [
  'untriaged',
  'todo',
  'in_progress',
  'deployed',
  'declined',
];

/* ─── Labels ─── */

export const STATUS_LABELS: Record<string, string> = {
  untriaged: 'Untriaged',
  todo: 'Todo',
  in_progress: 'In Progress',
  deployed: 'Deployed',
  declined: 'Declined',
};

export const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const TYPE_LABELS: Record<string, string> = {
  bug: 'Bug',
  feature: 'Feature',
};

export const SYSTEM_LABELS: Record<string, string> = {
  discord_bot: 'Discord Bot',
  minecraft_mod: 'Minecraft Mod',
  website: 'Website',
};

/* ─── Colors ─── */

export const COLUMN_COLORS: Record<string, string> = {
  untriaged: '#3b82f6',
  todo: '#a855f7',
  in_progress: '#f59e0b',
  deployed: '#22c55e',
  declined: '#6b7280',
};

export const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#6b7280',
};

export const TYPE_COLORS: Record<string, string> = {
  bug: '#ef4444',
  feature: '#8b5cf6',
};

/* ─── Shared styles ─── */

export const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-card)',
  borderRadius: '0.375rem',
  padding: '0.5rem 0.75rem',
  color: 'var(--text-primary)',
  fontSize: '0.875rem',
  outline: 'none',
  width: '100%',
};

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  width: 'auto',
  minWidth: '120px',
};

export const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.375rem',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: '600',
  transition: 'opacity 0.15s',
};

export const btnPrimary: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--color-ocean-500)',
  color: '#fff',
};

export const btnDanger: React.CSSProperties = {
  ...btnStyle,
  background: '#ef4444',
  color: '#fff',
};

export const btnSecondary: React.CSSProperties = {
  ...btnStyle,
  background: 'transparent',
  border: '1px solid var(--border-card)',
  color: 'var(--text-secondary)',
};

/* ─── Helpers ─── */

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

export const ASSIGNEE_FILTER_IGNS = ['Thundderr', 'LordGonner', 'Kenji121'];
