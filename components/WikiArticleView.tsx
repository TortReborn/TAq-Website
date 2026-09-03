"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Pencil, History, Link2 } from "lucide-react";
import WikiMarkdown from "./WikiMarkdown";
import { WikiPage, WikiPageSummary, WIKI_TYPE_LABELS, extractToc } from "@/lib/wiki";
import { WikiEmbedMap } from "@/lib/wiki-embeds";
import { WikiCitationMap, citationAnchor, citationList, splitManualSources } from "@/lib/wiki-citations";
import { useExecSession } from "@/hooks/useExecSession";

/**
 * Article layout, modeled on MediaWiki (Wikipedia Vector / wiki.gg) idioms:
 * type badge + tab row (Read | History | Edit), title with rule, right-floated
 * infobox, sticky TOC rail on wide screens, bordered section headings (in
 * WikiMarkdown), then a categories/footer bar with last-edited attribution
 * and "What links here".
 */

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

export default function WikiArticleView({
  page,
  backlinks,
  existingSlugs,
  embeds,
  citations,
  redirectedFrom,
  lastEditor,
}: {
  page: WikiPage;
  backlinks: WikiPageSummary[];
  existingSlugs: string[];
  embeds?: WikiEmbedMap;
  citations?: WikiCitationMap;
  redirectedFrom?: string;
  lastEditor?: { name: string; note: string } | null;
}) {
  const { isExec, authenticated } = useExecSession();
  const references = useMemo(() => (citations ? citationList(citations) : []), [citations]);
  // Pre-citation articles end in a hand-written "## Sources" list. Split it out
  // so the page shows a single reference section rather than two.
  const { body: articleBody, entries: manualSources } = useMemo(
    () => splitManualSources(page.body),
    [page.body],
  );
  const toc = useMemo(() => extractToc(page.body), [page.body]);
  const showToc = toc.length >= 3;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.35rem 0.9rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    background: active ? 'var(--bg-card)' : 'transparent',
    border: '1px solid var(--border-color)',
    borderBottom: active ? '1px solid var(--bg-card)' : '1px solid var(--border-color)',
    borderRadius: '0.375rem 0.375rem 0 0',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    marginBottom: '-1px',
  });

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      {/* Kicker row: breadcrumb + type badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <Link href="/chronicles" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Chronicles</Link>
          {' › '}
          <Link href={`/chronicles?type=${page.pageType}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
            {WIKI_TYPE_LABELS[page.pageType]}s
          </Link>
        </div>
        {/* MediaWiki-style tab row */}
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <span style={tabStyle(true)}>Read</span>
          <Link href={`/chronicles/${page.slug}/history`} style={tabStyle(false)}>
            <History size={12} /> History
          </Link>
          {isExec ? (
            <Link href={`/chronicles/${page.slug}/edit`} style={tabStyle(false)}>
              <Pencil size={12} /> Edit
            </Link>
          ) : authenticated ? (
            <Link href={`/chronicles/${page.slug}/edit`} style={tabStyle(false)}>
              <Pencil size={12} /> Suggest edit
            </Link>
          ) : null}
        </div>
      </div>

      {/* Title */}
      <h1 style={{
        fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)',
        borderBottom: '2px solid var(--border-color)', paddingBottom: '0.4rem', margin: 0,
      }}>
        {page.title}
      </h1>
      {redirectedFrom && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem', fontStyle: 'italic' }}>
          (Redirected from “{redirectedFrom}”)
        </div>
      )}
      {page.status !== 'published' && (
        <div style={{
          margin: '0.6rem 0', padding: '0.4rem 0.75rem', borderRadius: '0.375rem',
          background: 'rgba(217,119,6,0.12)', border: '1px solid #d97706',
          fontSize: '0.78rem', color: 'var(--text-primary)',
        }}>
          This page is {page.status} and only visible to execs.
        </div>
      )}

      {/* Body grid: sticky TOC rail (wide screens) + article column */}
      <div className="wiki-grid">
        {showToc && (
          <nav className="wiki-toc" aria-label="Contents">
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Contents
            </div>
            {toc.map((entry, i) => (
              <a
                key={i}
                href={`#${entry.anchor}`}
                style={{
                  display: 'block',
                  padding: `0.15rem 0 0.15rem ${entry.depth === 3 ? '0.9rem' : '0'}`,
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  textDecoration: 'none',
                }}
              >
                {entry.text}
              </a>
            ))}
          </nav>
        )}

        <article style={{ minWidth: 0 }}>
          {/* Infobox — right-floated on wide screens, stacked on mobile */}
          {page.infobox.length > 0 && (
            <aside className="wiki-infobox">
              <div style={{
                background: 'var(--bg-secondary)', fontWeight: 700, fontSize: '0.85rem',
                textAlign: 'center', padding: '0.45rem 0.6rem',
                borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)',
              }}>
                {page.title}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '0.3rem 0.6rem', color: 'var(--text-secondary)', width: '38%', verticalAlign: 'top' }}>Type</td>
                    <td style={{ padding: '0.3rem 0.6rem', color: 'var(--text-primary)' }}>{WIKI_TYPE_LABELS[page.pageType]}</td>
                  </tr>
                  {page.infobox.map((row, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.3rem 0.6rem', color: 'var(--text-secondary)', verticalAlign: 'top' }}>{row.label}</td>
                      <td style={{ padding: '0.3rem 0.6rem', color: 'var(--text-primary)' }}>
                        <WikiMarkdown body={row.value} existingSlugs={existingSlugs} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </aside>
          )}

          {/* Lede */}
          {page.summary && (
            <p style={{ fontSize: '0.95rem', lineHeight: 1.65, color: 'var(--text-primary)', margin: '0.9rem 0' }}>
              {page.summary}
            </p>
          )}

          <WikiMarkdown body={articleBody} existingSlugs={existingSlugs} embeds={embeds} citations={citations} />

          {/* References — numbered, in order of first appearance, each linking
              out to the cited source (and back to where it was cited). */}
          {(references.length > 0 || manualSources.length > 0) && (
            <section style={{ marginTop: '1.75rem' }}>
              <h2 id="references" style={{
                fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)',
                margin: '1.5rem 0 0.5rem', paddingBottom: '0.25rem',
                borderBottom: '1px solid var(--border-color)', scrollMarginTop: '5rem',
              }}>
                References
              </h2>
              {references.length > 0 && (
              <ol className="wiki-references">
                {references.map(c => (
                  <li key={c.number} id={citationAnchor(c.number)}>
                    <a href={`#${citationAnchor(c.number)}`} className="wiki-ref-back" aria-label={`Reference ${c.number}`}>^</a>{' '}
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="wiki-ref-link">{c.title}</a>
                    ) : (
                      <span>{c.title}</span>
                    )}
                    {c.locator && <span className="wiki-ref-meta">, {c.locator}</span>}
                    {c.waybackCapture && (
                      <span className="wiki-ref-meta">
                        {' '}(archived {c.waybackCapture.slice(0, 4)}-{c.waybackCapture.slice(4, 6)}-{c.waybackCapture.slice(6, 8)})
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              )}
              {manualSources.length > 0 && (
                <ul className="wiki-references wiki-references-manual">
                  {manualSources.map((entry, i) => (
                    <li key={i}><WikiMarkdown body={entry} existingSlugs={existingSlugs} /></li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Footer: what links here + page info */}
          <footer style={{ marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
            {backlinks.length > 0 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                <Link2 size={12} style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />
                What links here:{' '}
                {backlinks.map((b, i) => (
                  <span key={b.slug}>
                    {i > 0 && ', '}
                    <Link href={`/chronicles/${b.slug}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>{b.title}</Link>
                  </span>
                ))}
              </div>
            )}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              This page was last edited on {DATE_FMT.format(new Date(page.updatedAt))}
              {lastEditor ? <> by {lastEditor.name}{lastEditor.note ? <> — “{lastEditor.note}”</> : null}</> : null}.
              {' '}<Link href={`/chronicles/${page.slug}/history`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>View history</Link>
            </div>
          </footer>
        </article>
      </div>

      <style jsx>{`
        .wiki-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; margin-top: 0.5rem; }
        :global(.wiki-references) { margin: 0.5rem 0 0 1.5rem; padding: 0; font-size: 0.82rem; line-height: 1.7; color: var(--text-secondary); }
        :global(.wiki-references li) { margin: 0.2rem 0; scroll-margin-top: 5rem; }
        :global(.wiki-references li:target) { background: color-mix(in srgb, var(--accent-primary) 18%, transparent); border-radius: 0.25rem; }
        :global(.wiki-ref-back) { color: var(--text-secondary); text-decoration: none; font-weight: 700; }
        :global(.wiki-ref-link) { color: var(--accent-primary); text-decoration: none; }
        :global(.wiki-ref-link:hover) { text-decoration: underline; }
        :global(.wiki-ref-meta) { color: var(--text-secondary); }
        :global(.wiki-references-manual) { list-style: disc; }
        :global(.wiki-references-manual .wiki-body) { font-size: 0.82rem; display: inline; }
        :global(.wiki-references-manual .wiki-body p) { margin: 0; display: inline; }
        .wiki-toc { display: none; }
        :global(.wiki-infobox) {
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          overflow: hidden;
          background: var(--bg-card);
          margin: 0.9rem 0;
        }
        @media (min-width: 900px) {
          .wiki-grid { grid-template-columns: 200px minmax(0, 1fr); }
          .wiki-toc {
            display: block;
            position: sticky;
            top: 5rem;
            align-self: start;
            max-height: calc(100vh - 6rem);
            overflow-y: auto;
            border-right: 1px solid var(--border-color);
            padding: 0.5rem 1rem 0.5rem 0;
          }
          :global(.wiki-infobox) {
            float: right;
            width: 300px;
            margin: 0 0 1rem 1.25rem;
          }
        }
      `}</style>
    </div>
  );
}
