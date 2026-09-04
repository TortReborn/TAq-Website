"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";

/**
 * What the source archive holds, and what is not yet being used.
 *
 * Two kinds of work are invisible without this. Sources get fetched and never
 * mined, sometimes thousands of words of primary material sitting unread; and a
 * citation can name a document nobody archived, leaving a footnote a reader
 * cannot follow. Both are jobs a chronicler could pick up in an evening if they
 * could see them.
 *
 * The fetch lives in the editorial desk rather than here, because the same
 * numbers head the page — one request, not two.
 */

export interface ArchiveEntry {
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

export interface ArchiveGap {
  id: string;
  citations: number;
  articles: string[];
  isRawUrl: boolean;
}

export interface ArchiveTotals {
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

interface Props {
  entries: ArchiveEntry[];
  gaps: ArchiveGap[];
  totals: ArchiveTotals;
  imageBackend?: 'blob' | 'blob-private' | 's3' | null;
}

export default function SourceArchivePanel({ entries, gaps, totals, imageBackend }: Props) {
  const [filter, setFilter] = useState<Filter>('uncited');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

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

  const visible = expanded ? shown : shown.slice(0, 40);

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 1rem', lineHeight: 1.55 }}>
        Every document the Chronicle holds a copy of. An uncited one is material nobody has written
        up yet — the fastest way to add something the Chronicle does not know. The public index is
        at <Link href="/chronicle/references" style={{ color: 'var(--accent-primary)' }}>References</Link>.
      </p>

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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', marginBottom: '0.85rem' }}>
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
              color: filter === key ? 'var(--text-on-accent, #fff)' : 'var(--text-secondary)',
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

      {imageBackend && (
        <p style={{ margin: '1.1rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
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
    </div>
  );
}
