"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Plus, Trash2, Users } from "lucide-react";
import { useWikiSession } from "@/hooks/useWikiSession";

interface Chronicler {
  discordId: string;
  displayName: string;
  note: string;
  active: boolean;
  addedBy: string;
  addedAt: string;
}

/**
 * The chronicler roster, shared by /exec/chronicle and /chronicle/admin.
 *
 * Chroniclers publish without review and decide on suggestions, and need no
 * guild rank or membership to do it — the people who remember this history are
 * often not in the guild. Adding and removing them stays with exec, so the
 * trusted set can only ever be widened by the guild rather than by chroniclers
 * appointing one another.
 */
export default function ChroniclerManager() {
  const { canReview, canManageChroniclers } = useWikiSession();
  const [list, setList] = useState<Chronicler[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/wiki/chroniclers');
    if (!res.ok) return;
    const data = await res.json();
    setList(data.chroniclers ?? []);
  }, []);

  useEffect(() => { if (canReview) load(); }, [canReview, load]);

  if (!canReview) return null;

  const input: React.CSSProperties = {
    height: '32px', padding: '0 0.6rem', borderRadius: '0.375rem',
    border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: '0.82rem',
  };

  const add = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/wiki/chroniclers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId: id.trim(), displayName: name.trim(), note: note.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not add'); return; }
      setId(''); setName(''); setNote('');
      await load();
    } catch { setError('Network error'); } finally { setBusy(false); }
  };

  const remove = async (discordId: string, who: string) => {
    if (!window.confirm(`Remove ${who} as a chronicler? Their past edits and vouches stay attributed.`)) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/wiki/chroniclers?discordId=${encodeURIComponent(discordId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Could not remove');
        return;
      }
      await load();
    } catch { setError('Network error'); } finally { setBusy(false); }
  };

  return (
    <div>
      <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Users size={15} /> Chroniclers ({list.filter((c) => c.active).length})
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
        Chroniclers publish without review and decide on suggested edits. They need no guild rank
        and no guild membership — only a Discord account. Adding and removing them is exec-only.
      </p>

      {error && <div style={{ color: '#ef5350', fontSize: '0.8rem', marginBottom: '0.6rem' }}>{error}</div>}

      {canManageChroniclers && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.8rem' }}>
          <input style={{ ...input, width: '185px', fontFamily: 'monospace' }} placeholder="Discord user ID"
            value={id} onChange={(e) => setId(e.target.value)} />
          <input style={{ ...input, width: '140px' }} placeholder="Name to show"
            value={name} onChange={(e) => setName(e.target.value)} />
          <input style={{ ...input, flex: 1, minWidth: '170px' }} placeholder="Why (optional)"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <button
            onClick={add}
            disabled={busy || !id.trim()}
            style={{
              height: '32px', padding: '0 0.9rem', borderRadius: '0.375rem', border: 'none',
              background: '#2e7d32', color: '#fff', fontSize: '0.8rem', fontWeight: 600,
              cursor: busy || !id.trim() ? 'default' : 'pointer', opacity: busy || !id.trim() ? 0.6 : 1,
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            }}
          >
            {busy ? <Loader2 size={13} /> : <Plus size={13} />} Add
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0 }}>
          No chroniclers yet.{canManageChroniclers
            ? ' Add one above — you will need their Discord user ID (Developer Mode → right-click → Copy User ID).'
            : ''}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.35rem' }}>
          {list.map((c) => (
            <li key={c.discordId} style={{
              display: 'flex', alignItems: 'center', gap: '0.55rem',
              fontSize: '0.82rem', opacity: c.active ? 1 : 0.5,
            }}>
              <Check size={13} style={{ color: c.active ? '#2e7d32' : 'var(--text-secondary)', flexShrink: 0 }} />
              <strong>{c.displayName || c.discordId}</strong>
              {c.note && <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{c.note}</span>}
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.68rem', fontFamily: 'monospace' }}>{c.discordId}</span>
              {!c.active && <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>removed</span>}
              {canManageChroniclers && c.active && (
                <button
                  onClick={() => remove(c.discordId, c.displayName || c.discordId)}
                  disabled={busy}
                  title="Revoke — past edits and vouches stay attributed"
                  style={{
                    marginLeft: 'auto', height: '25px', padding: '0 0.55rem', borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)', fontSize: '0.72rem', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                  }}
                >
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
