#!/usr/bin/env node
/**
 * Fact auditor for the Chronicles — does each claim survive contact with the
 * source it cites?
 *
 *   node scripts/check-facts.mjs [--slug foo] [--only quotes,locators] [--json out.json]
 *
 * The style linter checks how an article is written. This checks whether it is
 * true, by the only standard we can automate: agreement with the archived
 * sources and the chronicle database.
 *
 * It exists because an expert reader found the Council of Canyon Kingdoms
 * described as founded by "seven guilds of the victorious Terra bloc" when two
 * of the seven were never in Terra — and the source we cited said, three lines
 * below the line cited, that one of them was still in the *losing* alliance
 * three days later. The citation looked honest because the list was real; only
 * the characterisation was invented. Checking that one claim then exposed every
 * date in that article being exactly one day early.
 *
 * DETECTORS
 *   quotes    A quoted string that appears in no source the sentence cites.
 *             The strongest signal in the set: quotation marks are a promise
 *             that someone wrote exactly this.
 *   locators  A citation pointing at "post #94" of a document with no post #94.
 *   figures   A number in a claim that appears nowhere in the cited source.
 *   roster    A membership claim contradicting the chronicle database.
 *   dates     Handled by check-source-dates.mjs, which needs a source parsed
 *             into dated entries and so cannot be generic.
 *
 * Every finding is a question, not a verdict. Prose legitimately paraphrases,
 * a sentence may carry a fact from an uncited neighbour, and quotations get
 * trimmed with ellipses. Read the source before changing an article.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const ONLY_SLUG = flag('slug');
const JSON_OUT = flag('json');
const ONLY = (flag('only') ?? 'quotes,locators,figures,roster').split(',').map((s) => s.trim());

// ---------------------------------------------------------------------------
// corpus
// ---------------------------------------------------------------------------

const { articles } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wiki/seed-articles.json'), 'utf8'));
const DOCS = path.join(ROOT, 'data/wiki/sources/docs');

/** Normalise so a quotation and its source differ only where it matters. */
function norm(s) {
  return s
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Pull quotations out of prose. Curly pairs are unambiguous. Straight marks are
 * taken in order — first opens, second closes — so the text between one
 * quotation and the next is never mistaken for a quotation itself.
 */
function quotationsIn(prose) {
  const out = [];
  const curly = /“([^”]{2,})”/g;
  let m;
  while ((m = curly.exec(prose)) !== null) out.push(m[1].trim());
  const stripped = prose.replace(curly, ' ');
  const parts = stripped.split('"');
  // parts[1], parts[3], … lie between an opening and a closing mark
  for (let i = 1; i < parts.length - (parts.length % 2 === 0 ? 1 : 0); i += 2) {
    const q = parts[i].trim();
    if (q) out.push(q);
  }
  return out;
}

const docCache = new Map();
function sourceText(id) {
  if (docCache.has(id)) return docCache.get(id);
  const p = path.join(DOCS, `${id}.md`);
  let text = null;
  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, 'utf8');
    // drop the frontmatter block so its note text cannot satisfy a quotation
    text = norm(raw.replace(/^---\n[\s\S]*?\n---\n/, ''));
  }
  docCache.set(id, text);
  return text;
}

/** Sibling pages of a paginated thread — a quote may sit on any of them. */
const allDocIds = fs.existsSync(DOCS)
  ? fs.readdirSync(DOCS).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))
  : [];
function relatedIds(id) {
  const base = id.replace(/-p\d+$/, '').replace(/-wb\d+$/, '');
  return allDocIds.filter((x) => x === base || x.startsWith(`${base}-p`) || x.startsWith(`${base}-wb`));
}

const findings = [];
const add = (f) => findings.push(f);

// ---------------------------------------------------------------------------
// walk each article sentence-by-sentence
// ---------------------------------------------------------------------------

const CITE_G = /\{\{cite:([a-z0-9._-]+)(?:\|([^}]*))?\}\}/gi;
// A run of prose ending in citations. Splitting on sentence boundaries alone
// separates a claim from the citation that follows it.
function segments(text) {
  return text
    .split(/\n{2,}/)
    .flatMap((para) => para.split(/(?<=\}\})\s+(?=[A-Z"“[])|(?<=[.!?])\s+(?=[A-Z"“[])/))
    .filter((s) => s.trim());
}

let checked = 0;
for (const a of articles) {
  if (ONLY_SLUG && a.slug !== ONLY_SLUG) continue;
  const body = `${a.summary}\n\n${a.body}`;

  for (const seg of segments(body)) {
    const cites = [...seg.matchAll(CITE_G)].map((m) => ({ id: m[1], locator: m[2] ?? '' }));
    if (!cites.length) continue;
    checked++;

    const prose = seg.replace(CITE_G, ' ').replace(/\s+/g, ' ').trim();

    // pooled text of every source this segment cites, plus sibling pages
    const ids = [...new Set(cites.flatMap((c) => relatedIds(c.id)))];
    const pool = ids.map(sourceText).filter(Boolean).join('\n');
    const missingDocs = [...new Set(cites.map((c) => c.id))].filter((id) => sourceText(id) === null);

    // ---- quotes ----------------------------------------------------------
    if (ONLY.includes('quotes') && pool) {
      for (const quote of quotationsIn(prose)) {
        if (quote.length < 12) continue;
        // An elided quotation is several fragments; each must be present.
        const parts = norm(quote).split(/\s*\.\.\.\s*|\s*\[…\]\s*/).filter((p) => p.length >= 12);
        const missing = parts.filter((p) => !pool.includes(p));
        if (missing.length) {
          add({
            kind: 'quote-not-in-source',
            severity: 'high',
            slug: a.slug,
            detail: quote.slice(0, 160),
            cited: [...new Set(cites.map((c) => c.id))].join(', '),
            note: missing.length === parts.length ? 'no part of this quotation found' : 'part of this quotation not found',
          });
        }
      }
    }

    // ---- locators --------------------------------------------------------
    if (ONLY.includes('locators')) {
      for (const c of cites) {
        const text = sourceText(c.id);
        const pm = c.locator.match(/post #(\d+)/i);
        if (!pm) continue;
        const pooled = relatedIds(c.id).map(sourceText).filter(Boolean).join('\n');
        if (!pooled) continue;
        if (!new RegExp(`### post #${pm[1]}\\b`).test(pooled) && !pooled.includes(`post #${pm[1]} `)) {
          add({
            kind: 'locator-not-in-source',
            severity: 'medium',
            slug: a.slug,
            detail: `${c.id} → post #${pm[1]}`,
            cited: c.id,
            note: text === null ? 'source document is not archived' : 'no such post in this thread',
          });
        }
      }
    }

    // ---- figures ---------------------------------------------------------
    if (ONLY.includes('figures') && pool) {
      // Only distinctive numbers: small counts appear everywhere by chance.
      for (const nm of prose.matchAll(/\b(\d[\d,]{2,})\b/g)) {
        const raw = nm[1];
        const plain = raw.replace(/,/g, '');
        if (/^(19|20)\d\d$/.test(plain)) continue; // years handled by the date checker
        const withCommas = Number(plain).toLocaleString('en-US');
        if (!pool.includes(plain) && !pool.includes(raw.toLowerCase()) && !pool.includes(withCommas)) {
          add({
            kind: 'figure-not-in-source',
            severity: 'medium',
            slug: a.slug,
            detail: `${raw} — "${prose.slice(Math.max(0, nm.index - 45), nm.index + 55).trim()}"`,
            cited: [...new Set(cites.map((c) => c.id))].join(', '),
          });
        }
      }
    }

    if (missingDocs.length) {
      add({
        kind: 'source-not-archived',
        severity: 'low',
        slug: a.slug,
        detail: missingDocs.join(', '),
        cited: missingDocs.join(', '),
        note: 'cited but no document on disk, so nothing here could be verified',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// roster claims vs the chronicle database
// ---------------------------------------------------------------------------

if (ONLY.includes('roster')) {
  try {
    const { rosterFindings } = await import('./lib-roster-check.mjs');
    add(...(await rosterFindings(articles, ONLY_SLUG)));
  } catch {
    // The roster detector needs a database; skip quietly when unreachable so
    // the text-only detectors still run in CI or offline.
  }
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const byKind = {};
for (const f of findings) (byKind[f.kind] ??= []).push(f);

console.log(`checked ${checked} cited segments across ${ONLY_SLUG ? 1 : articles.length} article(s)\n`);
for (const [kind, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${kind}: ${list.length}`);
}
console.log();

const ORDER = { high: 0, medium: 1, low: 2 };
for (const f of findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.slug.localeCompare(b.slug))) {
  console.log(`[${f.severity.toUpperCase()}] ${f.kind}  ${f.slug}`);
  console.log(`   ${f.detail}`);
  if (f.note) console.log(`   ${f.note}`);
  if (f.cited) console.log(`   cited: ${f.cited}`);
}

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({ checked, findings }, null, 2) + '\n');
  console.log(`\nwritten to ${JSON_OUT}`);
}
console.log(`\n${findings.length} finding(s). Each is a question for a human, not a verdict.`);
