"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { WikiPage, WikiRevision } from "@/lib/wiki";

/**
 * Page history, MediaWiki-style: revision list with radio pairs to pick any
 * two revisions and compare them as a line-level diff.
 */

const DT_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Simple LCS-based line diff — plenty for wiki bodies at this scale.
function diffLines(a: string[], b: string[]): Array<{ kind: 'same' | 'del' | 'add'; text: string }> {
  const n = a.length, m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: Array<{ kind: 'same' | 'del' | 'add'; text: string }> = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ kind: 'same', text: a[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ kind: 'del', text: a[i] }); i++; }
    else { out.push({ kind: 'add', text: b[j] }); j++; }
  }
  while (i < n) { out.push({ kind: 'del', text: a[i++] }); }
  while (j < m) { out.push({ kind: 'add', text: b[j++] }); }
  return out;
}

export default function WikiHistoryView({ page, revisions }: { page: WikiPage; revisions: WikiRevision[] }) {
  const [oldRev, setOldRev] = useState<number | null>(revisions.length > 1 ? revisions[1].revNumber : null);
  const [newRev, setNewRev] = useState<number | null>(revisions.length > 0 ? revisions[0].revNumber : null);

  const diff = useMemo(() => {
    const a = revisions.find(r => r.revNumber === oldRev);
    const b = revisions.find(r => r.revNumber === newRev);
    if (!a || !b || a.revNumber === b.revNumber) return null;
    const [older, newer] = a.revNumber < b.revNumber ? [a, b] : [b, a];
    const rows = diffLines(older.body.split('\n'), newer.body.split('\n')).filter(r => r.kind !== 'same' ||
      // keep 1-line context around changes by marking; simple approach: drop long same runs
      false);
    const full = diffLines(older.body.split('\n'), newer.body.split('\n'));
    // Collapse same-runs to context of 2 lines around changes
    const keep = new Set<number>();
    full.forEach((r, idx) => {
      if (r.kind !== 'same') for (let k = idx - 2; k <= idx + 2; k++) keep.add(k);
    });
    const collapsed: Array<{ kind: 'same' | 'del' | 'add' | 'skip'; text: string }> = [];
    let skipping = false;
    full.forEach((r, idx) => {
      if (keep.has(idx)) { collapsed.push(r); skipping = false; }
      else if (!skipping) { collapsed.push({ kind: 'skip', text: '⋯' }); skipping = true; }
    });
    return { older, newer, rows: collapsed, changed: rows.length > 0 || older.body !== newer.body };
  }, [revisions, oldRev, newRev]);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
        <Link href="/chronicles" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Chronicles</Link>
        {' › '}
        <Link href={`/chronicles/${page.slug}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>{page.title}</Link>
      </div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.4rem' }}>
        {page.title}: revision history
      </h1>

      {/* Revision list */}
      <div style={{ margin: '1rem 0' }}>
        {revisions.map((rev) => (
          <div key={rev.id} style={{
            display: 'flex', alignItems: 'baseline', gap: '0.6rem',
            padding: '0.35rem 0.5rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.82rem',
          }}>
            <span style={{ display: 'inline-flex', gap: '0.35rem' }}>
              <input type="radio" name="old" checked={oldRev === rev.revNumber} onChange={() => setOldRev(rev.revNumber)} title="Compare from" />
              <input type="radio" name="new" checked={newRev === rev.revNumber} onChange={() => setNewRev(rev.revNumber)} title="Compare to" />
            </span>
            <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{DT_FMT.format(new Date(rev.createdAt))}</span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>r{rev.revNumber}</span>
            <span style={{ color: 'var(--text-primary)' }}>{rev.authorName}</span>
            {rev.note && <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>— {rev.note}</span>}
          </div>
        ))}
      </div>

      {/* Diff */}
      {diff && (
        <div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.75rem 0 0.4rem' }}>
            Comparing <strong style={{ color: 'var(--text-primary)' }}>r{diff.older.revNumber}</strong> → <strong style={{ color: 'var(--text-primary)' }}>r{diff.newer.revNumber}</strong>
            {diff.older.title !== diff.newer.title && <> · title changed: “{diff.older.title}” → “{diff.newer.title}”</>}
          </div>
          <div style={{
            border: '1px solid var(--border-color)', borderRadius: '0.375rem', overflow: 'hidden',
            fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: 1.5,
          }}>
            {diff.rows.map((row, i) => (
              <div key={i} style={{
                padding: '0.05rem 0.6rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: row.kind === 'add' ? 'rgba(67,160,71,0.15)' : row.kind === 'del' ? 'rgba(229,57,53,0.15)' : 'transparent',
                color: row.kind === 'skip' ? 'var(--text-secondary)' : 'var(--text-primary)',
                borderLeft: row.kind === 'add' ? '3px solid #43a047' : row.kind === 'del' ? '3px solid #e53935' : '3px solid transparent',
                textAlign: row.kind === 'skip' ? 'center' : 'left',
              }}>
                {row.kind === 'add' ? '+ ' : row.kind === 'del' ? '− ' : row.kind === 'skip' ? '' : '  '}{row.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
