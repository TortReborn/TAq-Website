#!/usr/bin/env node
/**
 * Show, for each compressed quotation, what the article claims was said next to
 * what the source actually says.
 *
 *   node scripts/show-quote-diff.mjs [--slug foo] [--limit 20]
 *
 * "COMPRESSED" means a run of the quotation matches the cited source but the
 * whole thing does not — words were dropped from the middle without an ellipsis
 * marking the cut. Each one needs a decision that only reading both can settle:
 * restore the missing words, mark the elision, or drop the quotation marks and
 * paraphrase. This prints the pair so that decision takes seconds rather than
 * a manual hunt through a 20-page thread.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'data/wiki/sources/docs');
const args = process.argv.slice(2);
const flag = (n, d = null) => (args.indexOf(`--${n}`) === -1 ? d : args[args.indexOf(`--${n}`) + 1]);
const ONLY = flag('slug');
const LIMIT = Number(flag('limit', '100'));

const norm = (s) =>
  s.replace(/[‘’ʼ′]/g, "'").replace(/[“”″]/g, '"').replace(/[–—−]/g, '-')
    .replace(/…/g, '...').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\[\/?[A-Za-z][^\]]{0,40}\]/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
    .replace(/\s+/g, ' ').trim();

const tmp = path.join(ROOT, '.qdiff.json');
execFileSync('node', [path.join(ROOT, 'scripts/triage-quotes.mjs'), '--json', tmp], { cwd: ROOT, stdio: 'ignore' });
const triaged = JSON.parse(fs.readFileSync(tmp, 'utf8'));
fs.unlinkSync(tmp);

const docCache = new Map();
function docText(id) {
  if (!docCache.has(id)) {
    const p = path.join(DOCS, `${id}.md`);
    docCache.set(id, fs.existsSync(p)
      ? norm(fs.readFileSync(p, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''))
      : null);
  }
  return docCache.get(id);
}
const allIds = fs.readdirSync(DOCS).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));

let shown = 0;
for (const f of triaged.filter((x) => x.verdict === 'COMPRESSED')) {
  if (ONLY && f.slug !== ONLY) continue;
  if (shown >= LIMIT) break;

  const ids = [...new Set(f.cited.split(', ').flatMap((id) => {
    const base = id.replace(/-p\d+$/, '');
    return allIds.filter((x) => x === id || x === base || x.startsWith(`${base}-p`));
  }))];
  const pool = ids.map(docText).filter(Boolean).join('\n');
  if (!pool) continue;

  // Anchor on the longest run of the quotation that IS present, then show the
  // source either side of it — that window contains whatever was dropped.
  const words = norm(f.quote).split(' ').filter(Boolean);
  let anchor = '';
  for (let n = Math.min(8, words.length); n >= 3 && !anchor; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const run = words.slice(i, i + n).join(' ');
      if (pool.includes(run)) { anchor = run; break; }
    }
  }
  if (!anchor) continue;
  const at = pool.indexOf(anchor);
  const window = pool.slice(Math.max(0, at - 120), at + anchor.length + 160);

  shown++;
  console.log(`\n[${f.slug}]  cited: ${f.cited}`);
  console.log(`  ARTICLE: "${f.quote}"`);
  console.log(`  SOURCE : …${window}…`);
}
console.log(`\n${shown} compressed quotation(s) shown.`);
