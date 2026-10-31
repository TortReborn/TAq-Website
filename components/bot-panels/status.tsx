"use client";

import type { PanelRegistry, RevisionStatus } from '@/lib/bot-panels';

const STATUS: Record<RevisionStatus, { label: string; color: string }> = {
  pending: { label: 'Waiting for bot', color: '#eab308' },
  publishing: { label: 'Publishing', color: '#3b82f6' },
  published: { label: 'Live', color: '#22c55e' },
  failed: { label: 'Failed', color: '#ef4444' },
  superseded: { label: 'Skipped', color: '#6b7280' },
};

// Imported revisions count as published but have never been posted from the site;
// older published revisions were live once and have since been replaced.
const NOT_POSTED = { label: 'Not posted', color: '#eab308' };
const REPLACED = { label: 'Replaced', color: '#6b7280' };

export function StatusBadge({ status, posted = true, current = true }: { status: RevisionStatus; posted?: boolean; current?: boolean }) {
  const s = status !== 'published' ? STATUS[status] : !current ? REPLACED : !posted ? NOT_POSTED : STATUS.published;
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: '0.25rem',
      background: `${s.color}26`, color: s.color, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

export function channelLabel(id: string | null, registry: PanelRegistry | null): string {
  if (!id) return 'Not placed';
  const ch = registry?.channels.find(c => c.id === id);
  return ch ? (ch.parent_id ? `${ch.name} (forum post)` : `#${ch.name}`) : `#${id}`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
