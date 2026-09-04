"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { WIKI_TYPE_LABELS, WIKI_VALIDATIONS_REQUIRED, WikiPageSummary } from "@/lib/wiki";
import { useWikiSession } from "@/hooks/useWikiSession";
import WikiReviewQueue from "./WikiReviewQueue";

interface Chronicler {
  discordId: string;
  displayName: string;
  note: string;
  active: boolean;
  addedBy: string;
  addedAt: string;
}

type UnverifiedPageRow = WikiPageSummary & { validations: number; revisions: number };

interface Stats {
  pages: number;
  pagesWithHumanRevision: number;
  revisions: number;
  aiRevisions: number;
  humanRevisions: number;
}

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '0.75rem',
  padding: '1rem 1.25rem',
  marginBottom: '1.25rem',
};

const input: React.CSSProperties = {
  height: '34px',
  padding: '0 0.6rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
};

const btn = (kind: 'go' | 'plain' | 'danger'): React.CSSProperties => ({
  height: '34px',
  padding: '0 0.9rem',
  borderRadius: '0.375rem',
  border: kind === 'plain' ? '1px solid var(--border-color)' : 'none',
  background: kind === 'go' ? '#2e7d32' : kind === 'danger' ? '#c62828' : 'var(--bg-secondary)',
  color: kind === 'plain' ? 'var(--text-primary)' : '#fff',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
});

export default function ChroniclesAdmin() {
  const { user, authenticated, canReview, canManageChroniclers } = useWikiSession();

  const [chroniclers, setChroniclers] = useState<Chronicler[]>([]);
  const [unverified, setUnverified] = useState<UnverifiedPageRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newNote, setNewNote] = useState('');

  const loadChroniclers = useCallback(async () => {
    const res = await fetch('/api/wiki/chroniclers');
    if (!res.ok) return;
    const data = await res.json();
    setChroniclers(data.chroniclers ?? []);
  }, []);

  const loadUnverified = useCallback(async () => {
    const res = await fetch('/api/wiki/unverified');
    if (!res.ok) return;
    const data = await res.json();
    setUnverified(data.pages ?? []);
    setStats(data.stats ?? null);
  }, []);

  useEffect(() => {
    if (!canReview) return;
    loadChroniclers();
  }, [canReview, loadChroniclers]);

  useEffect(() => { loadUnverified(); }, [loadUnverified]);

  const addChronicler = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/wiki/chroniclers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId: newId.trim(), displayName: newName.trim(), note: newNote.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not add'); return; }
      setNewId(''); setNewName(''); setNewNote('');
      await loadChroniclers();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  const removeChronicler = async (discordId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/wiki/chroniclers?discordId=${encodeURIComponent(discordId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Could not remove');
        return;
      }
      await loadChroniclers();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  // Deliberately not gated on `loading`: the work-list is public, and blocking
  // the whole page on a session check would leave a reader staring at a spinner
  // to see a list that needed no permission in the first place. The chronicler
  // sections below simply do not render until the session resolves.
  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Chronicles editorial</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
        {canReview
          ? <>Signed in as <strong>{user?.name}</strong>{user?.isChronicler && !user?.isExec ? ' (chronicler)' : user?.isExec ? ' (exec)' : ''}.</>
          : <>You are reading this as a visitor. Anyone can see what still needs checking; approving changes needs a chronicler role.</>}
      </p>

      {error && (
        <div style={{ ...card, borderColor: '#c62828', color: '#ef5350', fontSize: '0.85rem' }}>{error}</div>
      )}

      {/* --- where the corpus stands ------------------------------------- */}
      {stats && (
        <section style={card}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={16} /> Where the corpus stands
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', fontSize: '0.85rem' }}>
            <Stat label="Published pages" value={stats.pages} />
            <Stat label="Touched by a person" value={stats.pagesWithHumanRevision} />
            <Stat label="Still unchecked" value={unverified.length} accent />
            <Stat label="Revisions written by a person" value={stats.humanRevisions} />
            <Stat label="Revisions written by AI" value={stats.aiRevisions} />
          </div>
        </section>
      )}

      {/* --- the work-list ------------------------------------------------ */}
      <section style={card}>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertTriangle size={16} /> Pages nobody has checked ({unverified.length})
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 0.9rem' }}>
          Each was drafted by an automated pass. Editing one clears its notice; so does vouching
          for it, once {WIKI_VALIDATIONS_REQUIRED} chroniclers have.
        </p>
        {unverified.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
            Nothing outstanding — every published page has been read by a person.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.3rem' }}>
            {unverified.map((p) => (
              <li key={p.slug} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', fontSize: '0.85rem' }}>
                <Link href={`/chronicles/${p.slug}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                  {p.title}
                </Link>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                  {WIKI_TYPE_LABELS[p.pageType] ?? p.pageType}
                  {p.validations > 0 && ` · ${p.validations}/${WIKI_VALIDATIONS_REQUIRED} vouched`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- suggestions awaiting a decision ------------------------------ */}
      {canReview && (
        <section style={card}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Suggested edits</h2>
          <WikiReviewQueue />
        </section>
      )}

      {/* --- who is trusted ----------------------------------------------- */}
      {canReview && (
        <section style={card}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Users size={16} /> Chroniclers ({chroniclers.filter((c) => c.active).length})
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 0.9rem' }}>
            Chroniclers publish without review and decide on suggestions. They need no guild rank
            and no guild membership — only a Discord account. Adding and removing them stays with
            exec.
          </p>

          {canManageChroniclers && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.9rem' }}>
              <input
                style={{ ...input, width: '190px', fontFamily: 'monospace' }}
                placeholder="Discord user ID"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
              <input
                style={{ ...input, width: '150px' }}
                placeholder="Name to show"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                style={{ ...input, flex: 1, minWidth: '180px' }}
                placeholder="Why (optional) — e.g. led Sequoia 2021-23"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <button style={btn('go')} onClick={addChronicler} disabled={busy || !newId.trim()}>
                {busy ? <Loader2 size={14} /> : <Plus size={14} />} Add
              </button>
            </div>
          )}

          {chroniclers.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              No chroniclers yet.{canManageChroniclers ? ' Add one above — you will need their Discord user ID (Developer Mode → right-click → Copy User ID).' : ''}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
              {chroniclers.map((c) => (
                <li
                  key={c.discordId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem',
                    opacity: c.active ? 1 : 0.5,
                  }}
                >
                  <Check size={14} style={{ color: c.active ? '#2e7d32' : 'var(--text-secondary)' }} />
                  <strong>{c.displayName || c.discordId}</strong>
                  {c.note && <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{c.note}</span>}
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontFamily: 'monospace' }}>{c.discordId}</span>
                  {!c.active && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>removed</span>}
                  {canManageChroniclers && c.active && (
                    <button
                      style={{ ...btn('plain'), height: '26px', marginLeft: 'auto' }}
                      onClick={() => removeChronicler(c.discordId)}
                      disabled={busy}
                      title="Revoke — their past edits and vouches stay attributed"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!authenticated && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          <Link href="/exec/login" style={{ color: 'var(--accent-primary)' }}>Sign in with Discord</Link>
          {' '}if you have been made a chronicler.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: accent ? '#d97706' : 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  );
}
