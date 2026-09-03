import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * Index of every archived source the wiki cites, so a reader can browse the
 * evidence directly rather than only meeting it one citation at a time.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'References — Chronicles',
  description: 'Every primary source the Chronicles wiki cites, archived and readable.',
};

interface SourceMeta {
  url: string;
  kind?: string;
  title?: string;
  waybackCapture?: string;
  textChars?: number;
  note?: string;
}

const KIND_ORDER = ['forum-thread', 'community-document', 'testimony', 'dataset', 'internal-record', 'titan-times', 'wiki', 'api', 'repository', 'guild-site', 'video', 'memoir', 'web'];

export default async function ReferencesIndex() {
  const root = path.join(process.cwd(), 'data', 'wiki', 'sources');
  let sources: Record<string, SourceMeta> = {};
  try {
    sources = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')).sources ?? {};
  } catch { /* index unavailable — render an empty list rather than failing */ }

  const byKind = new Map<string, [string, SourceMeta][]>();
  for (const entry of Object.entries(sources)) {
    const kind = entry[1].kind ?? 'web';
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind)!.push(entry);
  }
  const kinds = [...byKind.keys()].sort(
    (a, b) => (KIND_ORDER.indexOf(a) + 1 || 99) - (KIND_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b),
  );

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
        <Link href="/chronicles" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Chronicles</Link>
      </div>
      <h1 style={{
        fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)',
        borderBottom: '2px solid var(--border-color)', paddingBottom: '0.4rem', margin: 0,
      }}>
        References
      </h1>
      <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0.9rem 0 1.25rem' }}>
        Every source the Chronicles articles cite, archived here as it read when it was checked.
        Forum threads get edited and deleted, image hosts expire and guild sites go down, so each
        citation points at a copy that will still be here. {Object.keys(sources).length} sources.
      </p>

      {kinds.map(kind => (
        <section key={kind} style={{ marginBottom: '1.5rem' }}>
          <h2 style={{
            fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)',
            borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginBottom: '0.5rem',
          }}>
            {kind} <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>({byKind.get(kind)!.length})</span>
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {byKind.get(kind)!.sort((a, b) => a[0].localeCompare(b[0])).map(([id, s]) => (
              <li key={id} style={{ padding: '0.3rem 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
                <Link href={`/chronicles/references/${id}`} target="_blank"
                  style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>
                  {s.title ?? id}
                </Link>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {' · '}<code style={{ fontSize: '0.72rem' }}>{id}</code>
                  {s.waybackCapture ? ` · capture ${s.waybackCapture.slice(0, 8)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
