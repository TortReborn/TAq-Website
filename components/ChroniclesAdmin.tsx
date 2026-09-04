"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { WIKI_TYPE_LABELS, WIKI_VALIDATIONS_REQUIRED, WikiPageSummary } from "@/lib/wiki";
import { useWikiSession } from "@/hooks/useWikiSession";
import WikiReviewQueue from "./WikiReviewQueue";
import ChroniclerManager from "./ChroniclerManager";

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

export default function ChroniclesAdmin() {
  const { user, authenticated, canReview, imageBackend } = useWikiSession();

  const [unverified, setUnverified] = useState<UnverifiedPageRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error] = useState<string | null>(null);

  const loadUnverified = useCallback(async () => {
    const res = await fetch('/api/wiki/unverified');
    if (!res.ok) return;
    const data = await res.json();
    setUnverified(data.pages ?? []);
    setStats(data.stats ?? null);
  }, []);

  useEffect(() => { loadUnverified(); }, [loadUnverified]);


  // Deliberately not gated on `loading`: the work-list is public, and blocking
  // the whole page on a session check would leave a reader staring at a spinner
  // to see a list that needed no permission in the first place. The chronicler
  // sections below simply do not render until the session resolves.
  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Chronicle editorial</h1>
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
          {imageBackend && (
            <p style={{ margin: '0.8rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Uploaded images go to{' '}
              <strong>
                {imageBackend === 'blob'
                  ? 'Vercel Blob (public, CDN-served)'
                  : imageBackend === 'blob-private'
                    ? 'Vercel Blob (private, streamed through the site)'
                    : 'Supabase storage'}
              </strong>.
            </p>
          )}
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
          <ChroniclerManager />
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
