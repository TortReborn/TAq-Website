"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, ArrowLeft, Inbox, Users } from "lucide-react";
import { WIKI_TYPE_LABELS, WIKI_VALIDATIONS_REQUIRED, WikiPageSummary } from "@/lib/wiki";
import { useWikiSession } from "@/hooks/useWikiSession";
import WikiReviewQueue from "./WikiReviewQueue";
import ChroniclerManager from "./ChroniclerManager";
import SourceArchivePanel, { ArchiveEntry, ArchiveGap, ArchiveTotals } from "./SourceArchivePanel";

/**
 * The editorial desk: everything a chronicler needs to decide what to work on
 * next, in one place.
 *
 * It used to be a stack of four independent panels, each fetching on mount and
 * each arriving whenever it arrived, so the page grew and reflowed under the
 * reader for a second or so and the only way back to the Chronicle was the
 * browser's back button. It is now four tabs over one shared header: the
 * numbers that orient you stay put, only one list is on screen at a time, and
 * the tab lives in the URL hash so a link can point at the work rather than the
 * page.
 */

type UnverifiedPageRow = WikiPageSummary & { validations: number; revisions: number };

interface Stats {
  pages: number;
  pagesWithHumanRevision: number;
  revisions: number;
  aiRevisions: number;
  humanRevisions: number;
}

type TabKey = 'checking' | 'sources' | 'suggestions' | 'people';
const TAB_KEYS: TabKey[] = ['checking', 'sources', 'suggestions', 'people'];
/** The two that act on other people's work, and so need the chronicler role. */
const REVIEWER_TABS: TabKey[] = ['suggestions', 'people'];

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '0.75rem',
  padding: '1rem 1.25rem',
};

export default function ChroniclesAdmin() {
  const { user, authenticated, canReview, canPublish, imageBackend, loading: sessionLoading } = useWikiSession();

  const [unverified, setUnverified] = useState<UnverifiedPageRow[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [archive, setArchive] = useState<{ entries: ArchiveEntry[]; gaps: ArchiveGap[]; totals: ArchiveTotals } | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [tab, setTab] = useState<TabKey>('checking');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const load = useCallback(async () => {
    // Both are wanted for the header, so neither waits on the other.
    const [un, arc] = await Promise.allSettled([
      fetch('/api/wiki/unverified').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      fetch('/api/wiki/archive').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
    ]);
    if (un.status === 'fulfilled') {
      setUnverified(un.value.pages ?? []);
      setStats(un.value.stats ?? null);
    } else {
      setUnverified([]);
    }
    if (arc.status === 'fulfilled') {
      setArchive({ entries: arc.value.entries ?? [], gaps: arc.value.gaps ?? [], totals: arc.value.totals });
    } else {
      setArchiveError('Could not read the source archive.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A deep link picks the tab; a tab click rewrites the hash without pushing a
  // history entry, so Back still leaves the desk rather than cycling its tabs.
  // The listener matters as much as the first read: a link to #checking from
  // the unverified banner is a hash change, not a navigation, when the reader
  // is already here, and without it the page would sit on whichever tab it was
  // already showing.
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace('#', '');
      if ((TAB_KEYS as string[]).includes(h)) setTab(h as TabKey);
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);
  useEffect(() => {
    if (!sessionLoading && !canReview && REVIEWER_TABS.includes(tab)) setTab('checking');
  }, [sessionLoading, canReview, tab]);

  const go = (key: TabKey) => {
    setTab(key);
    window.history.replaceState(null, '', `#${key}`);
  };

  // Which kinds of page are outstanding, commonest first — 181 links in one
  // list is a wall, and "there are 40 guilds left" is a job someone can take.
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of unverified ?? []) counts.set(p.pageType, (counts.get(p.pageType) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [unverified]);

  const outstanding = useMemo(
    () => (unverified ?? []).filter((p) => typeFilter === 'all' || p.pageType === typeFilter),
    [unverified, typeFilter],
  );

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count: number | null; gated: boolean }[] = [
    { key: 'checking', label: 'Needs checking', icon: <AlertTriangle size={14} />, count: unverified?.length ?? null, gated: false },
    { key: 'sources', label: 'Sources', icon: <Archive size={14} />, count: archive?.totals.uncited ?? null, gated: false },
    { key: 'suggestions', label: 'Suggestions', icon: <Inbox size={14} />, count: pendingCount, gated: true },
    { key: 'people', label: 'Chroniclers', icon: <Users size={14} />, count: null, gated: true },
  ];

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
        <Link href="/chronicle" style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <ArrowLeft size={12} /> Chronicle
        </Link>
        {' › Editorial desk'}
      </div>

      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.4rem' }}>Editorial desk</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.55 }}>
        What the Chronicle still needs: pages nobody has read, sources nobody has written up, and
        suggestions waiting on a decision.{' '}
        {canReview
          ? <>Signed in as <strong>{user?.name}</strong>{user?.isChronicler && !user?.isExec ? ' (chronicler)' : user?.isExec ? ' (exec)' : ''}.</>
          : <>You are reading this as a visitor — anyone can see what needs doing; acting on it needs a chronicler role.</>}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
        <Link href="/chronicle/references" style={quickLink}>References</Link>
        <Link href="/chronicle/timeline" style={quickLink}>Master timeline</Link>
        <Link href="/map/history/chronicle" target="_blank" rel="noopener noreferrer" style={quickLink}>History map</Link>
        {canPublish && <Link href="/chronicle/new" style={quickLink}>+ New page</Link>}
      </div>

      {/* --- where the corpus stands, in one strip that never moves -------- */}
      <section style={{ ...card, marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.75rem' }}>
          <Stat label="Published pages" value={stats?.pages} />
          <Stat label="Read by a person" value={stats?.pagesWithHumanRevision} />
          <Stat label="Still unchecked" value={unverified?.length} accent />
          <Stat label="Sources archived" value={archive?.totals.archived} />
          <Stat label="Sources unused" value={archive?.totals.uncited} accent />
          <Stat
            label="Words unused"
            value={archive ? (archive.totals.uncitedWords >= 1000 ? `${Math.round(archive.totals.uncitedWords / 1000)}k` : archive.totals.uncitedWords) : undefined}
            accent
          />
        </div>
        {stats && (
          <p style={{ margin: '0.8rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {stats.revisions.toLocaleString()} revisions in all — {stats.humanRevisions.toLocaleString()} written
            by a person, {stats.aiRevisions.toLocaleString()} by an automated pass.
          </p>
        )}
      </section>

      {/* --- the four jobs ------------------------------------------------ */}
      <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1rem' }}>
        {tabs.filter((t) => !t.gated || canReview).map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => go(t.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.8rem', borderRadius: '999px', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 600,
              border: `1px solid ${tab === t.key ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              background: tab === t.key ? 'var(--accent-primary)' : 'var(--bg-card)',
              color: tab === t.key ? 'var(--text-on-accent, #fff)' : 'var(--text-primary)',
            }}
          >
            {t.icon}
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span style={{
                fontSize: '0.68rem', fontWeight: 700, padding: '0.05rem 0.4rem', borderRadius: '999px',
                background: tab === t.key ? 'rgba(255,255,255,0.22)' : 'var(--bg-secondary)',
                color: tab === t.key ? 'inherit' : 'var(--text-secondary)',
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Held to a floor so switching tabs does not bounce the page. */}
      <section style={{ ...card, minHeight: '20rem' }}>
        {tab === 'checking' && (
          <>
            <h2 style={sectionHeading}>Pages nobody has checked</h2>
            <p style={sectionLede}>
              Each was drafted by an automated pass. Editing one clears its notice; so does vouching
              for it, once {WIKI_VALIDATIONS_REQUIRED} chroniclers have.
            </p>
            {unverified === null ? (
              <Loading what="the work-list" />
            ) : unverified.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                Nothing outstanding — every published page has been read by a person.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.9rem' }}>
                  {([['all', `All (${unverified.length})`], ...typeCounts.map(([t, n]) => [t, `${WIKI_TYPE_LABELS[t as keyof typeof WIKI_TYPE_LABELS] ?? t}s (${n})`] as [string, string])]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setTypeFilter(key)}
                      style={{
                        fontSize: '0.75rem', padding: '0.25rem 0.6rem', borderRadius: '0.4rem', cursor: 'pointer',
                        border: `1px solid ${typeFilter === key ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        background: typeFilter === key ? 'var(--accent-primary)' : 'transparent',
                        color: typeFilter === key ? 'var(--text-on-accent, #fff)' : 'var(--text-secondary)',
                      }}
                    >{label}</button>
                  ))}
                </div>
                <ul style={{
                  listStyle: 'none', margin: 0, padding: 0,
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.3rem 1rem',
                }}>
                  {outstanding.map((p) => (
                    <li key={p.slug} style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', fontSize: '0.85rem', minWidth: 0 }}>
                      <Link href={`/chronicle/${p.slug}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.title}
                      </Link>
                      {p.validations > 0 && (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                          {p.validations}/{WIKI_VALIDATIONS_REQUIRED} vouched
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {tab === 'sources' && (
          <>
            <h2 style={sectionHeading}>The source archive</h2>
            {archiveError ? (
              <p style={{ color: '#ef5350', fontSize: '0.85rem', margin: 0 }}>{archiveError}</p>
            ) : !archive ? (
              <Loading what="the archive" />
            ) : (
              <SourceArchivePanel
                entries={archive.entries}
                gaps={archive.gaps}
                totals={archive.totals}
                imageBackend={imageBackend}
              />
            )}
          </>
        )}

        {/* Mounted rather than switched, so its count reaches the tab badge
            before anyone opens it — and opening it costs no second fetch. */}
        {canReview && (
          <div hidden={tab !== 'suggestions'}>
            <h2 style={sectionHeading}>Suggested edits</h2>
            <p style={sectionLede}>
              Community-suggested pages and edits. Approving publishes immediately, credited to the
              suggester with you recorded as reviewer.
            </p>
            <WikiReviewQueue onCount={setPendingCount} />
          </div>
        )}

        {tab === 'people' && canReview && <ChroniclerManager />}
      </section>

      {!authenticated && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '1.25rem' }}>
          <Link href="/exec/login" style={{ color: 'var(--accent-primary)' }}>Sign in with Discord</Link>
          {' '}if you have been made a chronicler.
        </p>
      )}
    </div>
  );
}

const quickLink: React.CSSProperties = {
  color: 'var(--accent-primary)',
  textDecoration: 'none',
  fontWeight: 600,
};

const sectionHeading: React.CSSProperties = {
  fontSize: '1rem',
  margin: '0 0 0.35rem',
};

const sectionLede: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.8rem',
  margin: '0 0 0.9rem',
  lineHeight: 1.55,
};

function Loading({ what }: { what: string }) {
  return <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>Reading {what}…</p>;
}

/**
 * A tile that holds its size before the number arrives, so the header does not
 * reflow underneath a reader who has already started reading it.
 */
function Stat({ label, value, accent }: { label: string; value?: number | string; accent?: boolean }) {
  const pending = value === undefined || value === null;
  return (
    <div style={{ minWidth: '5.5rem' }}>
      <div style={{
        fontSize: '1.35rem', fontWeight: 700, lineHeight: 1.2,
        color: pending ? 'var(--border-color)' : accent ? '#d97706' : 'var(--text-primary)',
      }}>
        {pending ? '—' : typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  );
}
