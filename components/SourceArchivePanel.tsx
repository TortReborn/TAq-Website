"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, ExternalLink, Search } from "lucide-react";

/**
 * What the source archive holds, and what is not yet being used.
 *
 * Two kinds of work are invisible without this. Sources get fetched and never
 * mined, sometimes thousands of words of primary material sitting unread; and a
 * citation can name a document nobody archived, leaving a footnote a reader
 * cannot follow. Both are jobs a chronicler could pick up in an evening if they
 * could see them.
 */

interface ArchiveEntry {
  id: string;
  title: string;
  tier: string;
  kind: string;
  url: string;
  words: number;
  note: string | null;
  citations: number;
  articles: string[];
}

interface ArchiveGap {
  id: string;
  citations: number;
  articles: string[];
  isRawUrl: boolean;
}

interface Totals {
  archived: number;
  cited: number;
  uncited: number;
  uncitedWords: number;
  pages: number;
  citations: number;
}

/** Strongest evidence first — the order the references index uses. */
const TIER_ORDER = ['primary', 'retrospective', 'secondary', 'derived', 'unclassified'];
const TIER_COLOR: Record<string, string> = {
  primary: '#2e7d32',
  retrospective: '#0277bd',
  secondary: '#8e6c1f',
  derived: '#6a1b9a',
  unclassified: '#757575',
};

type Filter = 'all' | 'uncited' | 'cited' | 'thin';

export default function SourceArchivePanel() {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [gaps, setGaps] = useState<ArchiveGap[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('uncited');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/wiki/archive')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (cancelled) return;
        setEntries(d.entries ?? []);
        setGaps(d.gaps ?? []);
        setTotals(d.totals ?? null);
      })
      .catch(() => !cancelled && setError('Could not read the source archive.'));
    return () => { cancelled = true; };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => (
        filter === 'all' ? true
        : filter === 'uncited' ? e.citations === 0
        : filter === 'cited' ? e.citations > 0
        // A source that extracted to almost nothing supports almost nothing,
        // whether or not anything cites it.
        : e.words < 60
      ))
      .filter((e) => !q || `${e.title} ${e.id} ${e.kind} ${e.note ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => (
        TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
        || b.words - a.words
        || a.title.localeCompare(b.title)
      ));
  }, [entries, filter, query]);

  const visible = expanded ? shown : shown.slice(0, 25);

  if (error) return <p style={{ color: '#ef5350', fontSize: '0.85rem', margin: 0 }}>{error}</p>;
  if (!totals) return <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>Reading the archive…</p>;

  return (
    <div>
      <h2 style={{ fontSize: '1rem', margin: '0 0 0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Archive size={16} /> The source archive
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 0.9rem' }}>
        Every document the wiki holds a copy of. An uncited one is material nobody has written up
        yet — the fastest way to add something the Chronicle does not know.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
        <Stat label="Documents archived" value={totals.archived} />
        <Stat label="Cited by a page" value={totals.cited} />
        <Stat label="Not yet used" value={totals.uncited} accent={totals.uncited > 0} />
        <Stat label="Words unused" value={totals.uncitedWords >= 1000 ? `${Math.round(totals.uncitedWords / 1000)}k` : totals.uncitedWords} accent={totals.uncited > 0} />
        {/* Distinct source-to-page links, not raw citation markers: a page
            citing one document eight times is one link, and that is the useful
            number for seeing how widely a source carries the wiki. */}
        <Stat label="Source–page links" value={totals.citations} />
      </div>

      {gaps.length > 0 && (
        <div style={{
          background: 'rgba(198, 40, 40, 0.08)',
          border: '1px solid rgba(198, 40, 40, 0.35)',
          borderRadius: '0.5rem',
          padding: '0.7rem 0.9rem',
          marginBottom: '1rem',
        }}>
          <strong style={{ fontSize: '0.85rem' }}>
            {gaps.length} citation{gaps.length === 1 ? '' : 's'} point at nothing we hold
          </strong>
          <p style={{ margin: '0.25rem 0 0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            The footnote resolves to no archived document, so a reader cannot check it and neither
            can the fact auditor. Archive the source, or change the claim.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.25rem' }}>
            {gaps.slice(0, 10).map((g) => (
              <li key={g.id} style={{ fontSize: '0.78rem', display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                <code style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>{g.id}</code>
                <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {g.isRawUrl ? 'raw URL · ' : ''}{g.citations} page{g.citations === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        {([
          ['uncited', `Not yet used (${totals.uncited})`],
          ['cited', `In use (${totals.cited})`],
          ['thin', 'Barely extracted'],
          ['all', `All (${totals.archived})`],
        ] as [Filter, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setFilter(key); setExpanded(false); }}
            style={{
              fontSize: '0.75rem',
              padding: '0.3rem 0.6rem',
              borderRadius: '0.4rem',
              cursor: 'pointer',
              border: `1px solid ${filter === key ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              background: filter === key ? 'var(--accent-primary)' : 'transparent',
              color: filter === key ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {label}
          </button>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}>
          <Search size={13} style={{ color: 'var(--text-secondary)' }} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setExpanded(false); }}
            placeholder="title, id, kind…"
            style={{
              fontSize: '0.78rem',
              padding: '0.3rem 0.5rem',
              borderRadius: '0.4rem',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-input, transparent)',
              color: 'var(--text-primary)',
              minWidth: '170px',
            }}
          />
        </span>
      </div>

      {shown.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
          {filter === 'uncited'
            ? 'Every archived document is cited by at least one page.'
            : 'Nothing matches.'}
        </p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.45rem' }}>
            {visible.map((e) => (
              <li key={e.id} style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: '0.5rem',
                alignItems: 'baseline',
                fontSize: '0.82rem',
                paddingBottom: '0.4rem',
                borderBottom: '1px solid var(--border-color)',
              }}>
                <span style={{
                  fontSize: '0.62rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: TIER_COLOR[e.tier] ?? TIER_COLOR.unclassified,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}>{e.tier}</span>
                <span style={{ minWidth: 0 }}>
                  <Link
                    href={`/chronicle/references/${e.id}`}
                    style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                  >
                    {e.title}
                  </Link>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginLeft: '0.4rem' }}>
                    {e.kind} · {e.words.toLocaleString()} words
                    {e.citations > 0 && ` · cited on ${e.articles.slice(0, 3).join(', ')}${e.articles.length > 3 ? ` +${e.articles.length - 3}` : ''}`}
                  </span>
                  {e.note && (
                    <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: '0.15rem' }}>
                      {e.note.length > 160 ? `${e.note.slice(0, 160)}…` : e.note}
                    </span>
                  )}
                </span>
                {e.url && (
                  <a href={e.url} target="_blank" rel="noopener noreferrer"
                     title="the original, if it still exists"
                     style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}>
                    <ExternalLink size={12} />
                  </a>
                )}
              </li>
            ))}
          </ul>
          {shown.length > visible.length && (
            <button
              onClick={() => setExpanded(true)}
              style={{
                marginTop: '0.7rem',
                fontSize: '0.78rem',
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary)',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Show the remaining {shown.length - visible.length}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: accent ? '#d97706' : 'var(--text-primary)' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  );
}
