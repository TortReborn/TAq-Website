/**
 * Line-level diff for wiki bodies (LCS-based) — shared by the page-history
 * view and the exec suggestion-review queue.
 */

export interface DiffRow {
  kind: 'same' | 'del' | 'add' | 'skip';
  text: string;
}

export function diffLines(a: string[], b: string[]): DiffRow[] {
  const n = a.length, m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffRow[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ kind: 'same', text: a[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ kind: 'del', text: a[i] }); i++; }
    else { out.push({ kind: 'add', text: b[j] }); j++; }
  }
  while (i < n) out.push({ kind: 'del', text: a[i++] });
  while (j < m) out.push({ kind: 'add', text: b[j++] });
  return out;
}

/** Diff with unchanged runs collapsed to ±context lines around changes. */
export function diffCollapsed(aText: string, bText: string, context = 2): DiffRow[] {
  const full = diffLines(aText.split('\n'), bText.split('\n'));
  const keep = new Set<number>();
  full.forEach((r, idx) => {
    if (r.kind !== 'same') for (let k = idx - context; k <= idx + context; k++) keep.add(k);
  });
  const collapsed: DiffRow[] = [];
  let skipping = false;
  full.forEach((r, idx) => {
    if (keep.has(idx)) { collapsed.push(r); skipping = false; }
    else if (!skipping) { collapsed.push({ kind: 'skip', text: '⋯' }); skipping = true; }
  });
  return collapsed;
}

export function hasChanges(aText: string, bText: string): boolean {
  return aText !== bText;
}
