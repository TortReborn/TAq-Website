import Link from 'next/link';
import type { Metadata } from 'next';
import { getPool } from '@/lib/db';
import { listWikiPages, recentWikiChanges } from '@/lib/wiki-db';
import { WIKI_PAGE_TYPES, WIKI_TYPE_LABELS, WikiPageType } from '@/lib/wiki';
import WikiSearchBox from '@/components/WikiSearchBox';
import WikiLandingActions from '@/components/WikiLandingActions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Chronicles — The Aquarium',
  description: 'The history of Wynncraft’s guild scene: guilds, alliances, wars and eras.',
};

const DT_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default async function ChroniclesLanding({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const pool = getPool();
  const activeType = WIKI_PAGE_TYPES.includes(type as WikiPageType) ? (type as WikiPageType) : undefined;
  const [pages, recent] = await Promise.all([
    listWikiPages(pool, { pageType: activeType }),
    recentWikiChanges(pool, 15),
  ]);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1rem 3rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>Chronicles</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0 0 1rem' }}>
          The history of Wynncraft’s guild scene — its guilds, alliances, wars and eras.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <WikiSearchBox />
        </div>
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/chronicles/timeline" style={{ fontSize: '0.82rem', color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>
            Master timeline →
          </Link>
          <Link href="/map/history/chronicle" style={{ fontSize: '0.82rem', color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>
            History map →
          </Link>
          <WikiLandingActions />
        </div>
      </header>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
        <Link
          href="/chronicles"
          style={{
            padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none',
            background: !activeType ? 'var(--accent-primary)' : 'var(--bg-card)',
            color: !activeType ? 'var(--text-on-accent)' : 'var(--text-primary)',
            border: '1px solid var(--border-color)',
          }}
        >
          All pages
        </Link>
        {WIKI_PAGE_TYPES.map(t => (
          <Link
            key={t}
            href={`/chronicles?type=${t}`}
            style={{
              padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none',
              background: activeType === t ? 'var(--accent-primary)' : 'var(--bg-card)',
              color: activeType === t ? 'var(--text-on-accent)' : 'var(--text-primary)',
              border: '1px solid var(--border-color)',
            }}
          >
            {WIKI_TYPE_LABELS[t]}s
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)', gap: '1.5rem', alignItems: 'start' }}>
        {/* Page index */}
        <section>
          {pages.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '1.5rem 0' }}>
              No pages yet{activeType ? ` in ${WIKI_TYPE_LABELS[activeType]}s` : ''}.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.6rem' }}>
              {pages.map(p => (
                <Link key={p.slug} href={`/chronicles/${p.slug}`} style={{
                  display: 'block', padding: '0.6rem 0.75rem', borderRadius: '0.5rem',
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)', textDecoration: 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{p.title}</span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      {WIKI_TYPE_LABELS[p.pageType]}
                    </span>
                  </div>
                  {p.summary && (
                    <div style={{
                      fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {p.summary}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Recent changes */}
        <aside style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '0.75rem 0.9rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Recent changes
          </div>
          {recent.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Nothing yet.</div>}
          {recent.map((r, i) => (
            <div key={i} style={{ fontSize: '0.76rem', marginBottom: '0.45rem', lineHeight: 1.4 }}>
              <Link href={`/chronicles/${r.slug}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>{r.title}</Link>
              <span style={{ color: 'var(--text-secondary)' }}> · r{r.revNumber} by {r.authorName} · {DT_FMT.format(new Date(r.updatedAt))}</span>
              {r.note && <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>“{r.note}”</div>}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
