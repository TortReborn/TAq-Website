"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/hooks/fetcher';
import { SLUG_RE, type PanelRegistry, type PanelSummary } from '@/lib/bot-panels';
import { StatusBadge, channelLabel, timeAgo } from '@/components/bot-panels/status';
import { btnStyle, inputStyle, labelStyle, smallBtn } from '@/components/bot-panels/PanelEditor';

interface ListResponse { panels: PanelSummary[]; registry: PanelRegistry | null }

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

export default function BotPanelsPage() {
  const router = useRouter();
  const { data, error, isLoading } = useSWR<ListResponse>('/api/exec/bot-panels', fetcher, {
    refreshInterval: 15000, revalidateOnFocus: true,
  });
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true); setCreateError(null);
    const res = await fetch('/api/exec/bot-panels', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), slug }),
    });
    const body = await res.json();
    setCreating(false);
    if (!res.ok) return setCreateError(body.error || 'Failed to create panel');
    router.push(`/exec/bot-panels/${body.slug}`);
  };

  if (isLoading) return <div style={{ color: 'var(--text-secondary)', padding: '2rem' }}>Loading bot panels…</div>;
  if (error || !data) return <div style={{ color: '#ef4444', padding: '2rem' }}>Error: {error?.message ?? 'no data'}</div>;

  const th: React.CSSProperties = { padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' };
  const td: React.CSSProperties = { padding: '0.6rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-primary)', borderTop: '1px solid var(--border-card)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Bot Messages</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            The bot&apos;s info panels in Discord. Edit one and publish, and the bot updates the live message within a few seconds.
          </p>
        </div>
        <button onClick={() => setShowNew(v => !v)} style={{ ...btnStyle, background: showNew ? 'var(--bg-card)' : 'rgba(34, 197, 94, 0.15)', color: showNew ? 'var(--text-secondary)' : '#22c55e' }}>
          {showNew ? 'Cancel' : '+ New panel'}
        </button>
      </div>

      {!data.registry && (
        <div style={{ padding: '0.75rem', borderRadius: '0.375rem', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', color: '#eab308', fontSize: '0.85rem' }}>
          The bot hasn&apos;t reported its channels and buttons yet. Pickers stay empty until it has been online once with this update.
        </div>
      )}

      {showNew && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.5rem', padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input value={name} autoFocus placeholder="Event rules" style={inputStyle}
              onChange={e => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} />
          </div>
          <div>
            <label style={labelStyle}>Short id (used in the page address)</label>
            <input value={slug} placeholder="event-rules" style={inputStyle}
              onChange={e => { setSlug(slugify(e.target.value)); setSlugTouched(true); }} />
          </div>
          <button onClick={create} disabled={creating || !name.trim() || !SLUG_RE.test(slug)}
            style={{ ...btnStyle, background: '#3b82f6', color: '#fff', opacity: creating || !name.trim() || !SLUG_RE.test(slug) ? 0.5 : 1 }}>
            {creating ? 'Creating…' : 'Create'}
          </button>
          {createError && <div style={{ gridColumn: '1 / -1', color: '#ef4444', fontSize: '0.8rem' }}>{createError}</div>}
        </div>
      )}

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.5rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th style={th}>Panel</th><th style={th}>Channel</th><th style={th}>Status</th><th style={th}>Last change</th><th style={th} /></tr>
          </thead>
          <tbody>
            {data.panels.map(p => (
              <tr key={p.slug}>
                <td style={td}>
                  <Link href={`/exec/bot-panels/${p.slug}`} style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>{p.name}</Link>
                </td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{channelLabel(p.channel_id, data.registry)}</td>
                <td style={td}>
                  {p.latest_status
                    ? <span title={p.message_ids.length ? undefined : 'Imported from the old /generate command. Link the messages already in Discord, or publish to post new ones.'}>
                        <StatusBadge status={p.latest_status} posted={p.message_ids.length > 0} />
                      </span>
                    : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Empty</span>}
                </td>
                <td style={{ ...td, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  {p.latest_rev ? <>rev {p.latest_rev} · {p.latest_author ?? 'unknown'} · {timeAgo(p.latest_at)}</> : '—'}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <Link href={`/exec/bot-panels/${p.slug}`} style={{ ...smallBtn, background: 'var(--bg-secondary)', color: 'var(--text-primary)', textDecoration: 'none', display: 'inline-block' }}>Edit</Link>
                </td>
              </tr>
            ))}
            {data.panels.length === 0 && (
              <tr><td colSpan={5} style={{ ...td, color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No panels yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
