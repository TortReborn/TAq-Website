"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { WikiSubmission, WIKI_TYPE_LABELS } from "@/lib/wiki";
import { diffCollapsed } from "@/lib/wiki-diff";

/**
 * Exec review queue for Chronicle wiki suggestions: pending list, per-item
 * rendered line diff against the current page (or full body for new pages),
 * approve / reject with note. Rendered inside /exec/chronicle.
 */

interface QueueItem extends WikiSubmission {
  current: { slug: string; title: string; summary: string; infobox: unknown; body: string } | null;
}

const DT_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function WikiReviewQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/wiki/review?status=pending');
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return; }
      setItems(data.submissions ?? []);
      setError(null);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: number, approve: boolean) => {
    const note = approve ? '' : (window.prompt('Reason for rejection (optional):') ?? '');
    setBusyId(id);
    try {
      const res = await fetch('/api/wiki/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approve, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error ?? `Decision failed (${res.status})`); return; }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading wiki queue…</div>;
  if (error) return <div style={{ color: '#e57373', fontSize: '0.85rem' }}>{error}</div>;

  return (
    <div>
      {items.length === 0 && (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No pending wiki suggestions.</div>
      )}
      {items.map((s) => {
        const open = openId === s.id;
        const isNew = s.targetPageId === null || s.current === null;
        return (
          <div key={s.id} style={{
            border: '1px solid var(--border-color)', borderRadius: '0.5rem',
            marginBottom: '0.6rem', background: 'var(--bg-card)', overflow: 'hidden',
          }}>
            <div
              onClick={() => setOpenId(open ? null : s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', cursor: 'pointer' }}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                {isNew ? 'New page' : 'Edit'}: {s.payload.title}
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                {WIKI_TYPE_LABELS[s.payload.pageType]}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                {s.submittedName} · {DT_FMT.format(new Date(s.submittedAt))}
              </span>
            </div>

            {open && (
              <div style={{ padding: '0 0.75rem 0.75rem' }}>
                {s.note && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                    “{s.note}”
                  </div>
                )}
                {!isNew && s.current && s.current.title !== s.payload.title && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
                    Title: “{s.current.title}” → “{s.payload.title}”
                  </div>
                )}
                {!isNew && s.current && s.current.summary !== s.payload.summary && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
                    Summary: “{s.current.summary || '—'}” → “{s.payload.summary || '—'}”
                  </div>
                )}
                <div style={{
                  border: '1px solid var(--border-color)', borderRadius: '0.375rem', overflow: 'hidden',
                  fontFamily: 'monospace', fontSize: '0.72rem', lineHeight: 1.5, maxHeight: '22rem', overflowY: 'auto',
                }}>
                  {diffCollapsed(isNew ? '' : (s.current?.body ?? ''), s.payload.body).map((row, i) => (
                    <div key={i} style={{
                      padding: '0.05rem 0.6rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      background: row.kind === 'add' ? 'rgba(67,160,71,0.15)' : row.kind === 'del' ? 'rgba(229,57,53,0.15)' : 'transparent',
                      color: row.kind === 'skip' ? 'var(--text-secondary)' : 'var(--text-primary)',
                      borderLeft: row.kind === 'add' ? '3px solid #43a047' : row.kind === 'del' ? '3px solid #e53935' : '3px solid transparent',
                      textAlign: row.kind === 'skip' ? 'center' : 'left',
                    }}>
                      {row.kind === 'add' ? '+ ' : row.kind === 'del' ? '− ' : row.kind === 'skip' ? '' : '  '}{row.text}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', alignItems: 'center' }}>
                  <button type="button" disabled={busyId === s.id} onClick={() => decide(s.id, true)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer',
                      padding: '0.35rem 0.9rem', borderRadius: '0.375rem', border: 'none', fontWeight: 700, fontSize: '0.78rem',
                      background: '#43a047', color: '#fff', opacity: busyId === s.id ? 0.6 : 1,
                    }}>
                    <Check size={13} /> Approve & publish
                  </button>
                  <button type="button" disabled={busyId === s.id} onClick={() => decide(s.id, false)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer',
                      padding: '0.35rem 0.9rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)',
                      fontWeight: 700, fontSize: '0.78rem', background: 'var(--bg-secondary)', color: '#e57373',
                      opacity: busyId === s.id ? 0.6 : 1,
                    }}>
                    <X size={13} /> Reject
                  </button>
                  {!isNew && s.current && (
                    <Link href={`/chronicle/${s.current.slug}`} target="_blank"
                      style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--accent-primary)', textDecoration: 'none' }}>
                      View current page →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
