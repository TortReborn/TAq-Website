"use client";

/**
 * Channel dropdown for the panel editor. The browser's own <select> can't be
 * themed (its category headers render white on white), so this is a button
 * that opens a searchable list grouped by category.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PanelRegistry } from '@/lib/bot-panels';
import { inputStyle } from './PanelEditor';

type Channel = PanelRegistry['channels'][number];

export default function ChannelPicker({ value, onChange, registry }: {
  value: string; onChange: (id: string) => void; registry: PanelRegistry | null;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const postable = useMemo(() => (registry?.channels ?? []).filter(c => c.postable), [registry]);
  const current = postable.find(c => c.id === value);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? postable.filter(c => c.name.toLowerCase().includes(q) || (c.category ?? '').toLowerCase().includes(q)) : postable;
  }, [postable, search]);

  // Close on a click anywhere else.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Keep the highlighted row in view while arrowing through the list.
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (c: Channel) => { onChange(c.id); setOpen(false); setSearch(''); };
  const openList = () => {
    setOpen(true);
    setSearch('');
    setActive(Math.max(0, postable.findIndex(c => c.id === value)));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = matches.length;
      if (n) setActive(a => (a + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches[active]) choose(matches[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  let lastCategory: string | null | undefined;
  return (
    <div ref={root} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button type="button" onClick={() => (open ? setOpen(false) : openList())}
        style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: current || value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {current ? `#${current.name}` : value ? `Channel id ${value}` : 'Choose a channel…'}
        </span>
        {current?.category && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '40%' }}>{current.category}</span>}
        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 30,
          background: 'var(--bg-card-solid)', border: '1px solid var(--border-card)', borderRadius: '0.5rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)', overflow: 'hidden',
        }}>
          <div style={{ padding: '0.4rem', borderBottom: '1px solid var(--border-card)' }}>
            <input autoFocus value={search} placeholder="Search channels or categories"
              onChange={e => { setSearch(e.target.value); setActive(0); }} onKeyDown={onKeyDown} style={inputStyle} />
          </div>
          <div ref={list} role="listbox" style={{ maxHeight: '20rem', overflowY: 'auto', padding: '0.25rem' }}>
            {matches.length === 0 && (
              <div style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No channel matches &ldquo;{search}&rdquo;.</div>
            )}
            {matches.map((c, i) => {
              const header = c.category !== lastCategory;
              lastCategory = c.category;
              return (
                <div key={c.id}>
                  {header && (
                    <div style={{ padding: '0.55rem 0.5rem 0.2rem', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      {c.category ?? 'No category'}
                    </div>
                  )}
                  <div role="option" aria-selected={c.id === value} data-index={i}
                    onMouseDown={e => { e.preventDefault(); choose(c); }}
                    onMouseEnter={() => setActive(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '0.3rem',
                      cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-primary)',
                      background: i === active ? 'var(--bg-secondary)' : 'transparent',
                    }}>
                    <span style={{ color: 'var(--text-muted)' }}>#</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    {c.id === value && <span style={{ marginLeft: 'auto', color: '#3b82f6', fontSize: '0.75rem' }}>✓</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
