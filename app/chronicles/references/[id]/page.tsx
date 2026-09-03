import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ExternalLink, Archive } from 'lucide-react';

/**
 * A reference page: our archived copy of one source, so every citation in the
 * wiki leads somewhere readable even when the original has been edited, deleted
 * or was never on the public web (testimony, datasets, our own records).
 *
 * The text is served from data/wiki/sources/docs/<id>.md, which is exactly what
 * the citation was checked against.
 */

export const dynamic = 'force-dynamic';

interface SourceMeta {
  url: string;
  kind?: string;
  title?: string;
  waybackCapture?: string;
  fetchedAt?: string;
  note?: string;
  textChars?: number;
}

function loadSource(id: string): { meta: SourceMeta; body: string } | null {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return null;
  const root = path.join(process.cwd(), 'data', 'wiki', 'sources');
  const docPath = path.join(root, 'docs', `${id}.md`);
  if (!fs.existsSync(docPath)) return null;
  let meta: SourceMeta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')).sources?.[id] ?? { url: '' };
  } catch {
    meta = { url: '' };
  }
  const raw = fs.readFileSync(docPath, 'utf8');
  // Strip the frontmatter block; its fields are already in the manifest
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  return { meta, body };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const found = loadSource(id);
  return { title: found ? `${found.meta.title ?? id} — Reference` : 'Reference' };
}

const fmtCapture = (stamp: string) =>
  `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;

export default async function ReferencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = loadSource(id);
  if (!found) notFound();
  const { meta, body } = found;

  const isUrl = /^https?:\/\//.test(meta.url ?? '');
  const waybackUrl = meta.waybackCapture && isUrl
    ? `https://web.archive.org/web/${meta.waybackCapture}/${meta.url}`
    : null;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
        <Link href="/chronicles" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Chronicles</Link>
        {' › '}
        <Link href="/chronicles/references" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>References</Link>
      </div>

      <h1 style={{
        fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)',
        borderBottom: '2px solid var(--border-color)', paddingBottom: '0.4rem', margin: 0,
      }}>
        {meta.title ?? id}
      </h1>

      <div style={{
        margin: '0.9rem 0', padding: '0.75rem 0.9rem', borderRadius: '0.5rem',
        border: '1px solid var(--border-color)', background: 'var(--bg-card)', fontSize: '0.8rem',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1.25rem', marginBottom: meta.note ? '0.5rem' : 0 }}>
          {meta.kind && (
            <span style={{ color: 'var(--text-secondary)' }}>
              Type: <span style={{ color: 'var(--text-primary)' }}>{meta.kind}</span>
            </span>
          )}
          {meta.fetchedAt && (
            <span style={{ color: 'var(--text-secondary)' }}>
              Archived: <span style={{ color: 'var(--text-primary)' }}>{meta.fetchedAt.slice(0, 10)}</span>
            </span>
          )}
          {meta.waybackCapture && (
            <span style={{ color: 'var(--text-secondary)' }}>
              Capture: <span style={{ color: 'var(--text-primary)' }}>{fmtCapture(meta.waybackCapture)}</span>
            </span>
          )}
          <span style={{ color: 'var(--text-secondary)' }}>
            id: <code style={{ fontSize: '0.75rem' }}>{id}</code>
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
          {isUrl ? (
            <a href={meta.url} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--accent-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <ExternalLink size={12} /> Original page
            </a>
          ) : (
            <span style={{ color: 'var(--text-secondary)' }}>
              Not a public web page — {meta.url || 'held only as this archived copy'}
            </span>
          )}
          {waybackUrl && (
            <a href={waybackUrl} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--accent-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <Archive size={12} /> Wayback capture
            </a>
          )}
        </div>

        {meta.note && (
          <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {meta.note}
          </div>
        )}
      </div>

      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
        Text as archived{meta.textChars ? ` (${meta.textChars.toLocaleString()} characters)` : ''}. This is the copy the
        wiki&apos;s citations were checked against; the original may since have changed.
      </div>

      <pre style={{
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        fontFamily: 'inherit', fontSize: '0.82rem', lineHeight: 1.6,
        color: 'var(--text-primary)', background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)', borderRadius: '0.5rem',
        padding: '1rem', margin: 0, maxHeight: '75vh', overflow: 'auto',
      }}>
        {body}
      </pre>
    </div>
  );
}
