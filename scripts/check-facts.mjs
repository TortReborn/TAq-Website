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
 *   thin      A citation resolving to a document too small to support it.
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
const ONLY = (flag('only') ?? 'quotes,locators,figures,roster,thin').split(',').map((s) => s.trim());

// ---------------------------------------------------------------------------
// corpus
// ---------------------------------------------------------------------------

const { articles } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wiki/seed-articles.json'), 'utf8'));
const DOCS = path.join(ROOT, 'data/wiki/sources/docs');
const { sources: SOURCE_INDEX } = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/wiki/sources/index.json'), 'utf8'),
);

/**
 * A derived source is our own computation over map data, not a document. Its
 * numbers were produced by us and will never appear as text inside it, so
 * checking a figure against one only manufactures noise.
 */
const isDerived = (id) => SOURCE_INDEX[id]?.tier === 'derived' || /^(territory-exchanges|chronicle-records|wynncraft-api|pre2018-territory-snapshots)$/.test(id);

/** Normalise so a quotation and its source differ only where it matters. */
function norm(s) {
  return s
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    // XenForo mention markup survives extraction as debris — "@NeonRider[/USER,
    // @Naraka00 , and I". An article quoting that sentence tidies it up, quite
    // correctly, so leaving the debris in makes a faithful quotation look
    // invented. Strip the tags and the stray spacing they leave behind.
    .replace(/\[\/?[A-Za-z][^\]]{0,40}\]/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
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
    // Drop the frontmatter so its note cannot satisfy a quotation. Our notes
    // often quote the document they describe, so leaving the block in lets a
    // claim be "verified" against our own summary of the source rather than the
    // source. The line endings here are CRLF, and an LF-only pattern silently
    // matched nothing at all — leaving every frontmatter block in place.
    text = norm(raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''));
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
/**
 * Split a paragraph into claim-sized pieces, never inside a quotation.
 *
 * A naive sentence split breaks on the full stop in "Such a sad time. Arenos
 * leaves…", stranding one quotation mark in each half. Every straight-quoted
 * passage after that point then pairs up wrongly, and the checker reports the
 * prose *between* two real quotations as an unsourced quote.
 */
function splitSentences(para) {
  const out = [];
  let start = 0;
  let open = false; // inside a straight-quoted passage
  let curly = 0; // depth of curly-quoted passages
  for (let i = 0; i < para.length; i++) {
    const ch = para[i];
    if (ch === '"') open = !open;
    else if (ch === '“') curly++;
    else if (ch === '”') curly = Math.max(0, curly - 1);
    if (open || curly > 0) continue;

    const boundary =
      (/[.!?]/.test(ch) || (ch === '}' && para[i - 1] === '}')) &&
      /\s/.test(para[i + 1] ?? '') &&
      /[A-Z"“[]/.test((para.slice(i + 1).match(/\S/) ?? [''])[0]);
    if (boundary) {
      out.push(para.slice(start, i + 1));
      start = i + 1;
    }
  }
  out.push(para.slice(start));
  return out;
}

function segments(text) {
  return text
    .split(/\n{2,}/)
    .flatMap(splitSentences)
    .filter((s) => s.trim());
}

let checked = 0;
for (const a of articles) {
  if (ONLY_SLUG && a.slug !== ONLY_SLUG) continue;
  // Strip images before segmenting rather than after. A caption is not a claim,
  // and a quotation mark inside one shifts the parity of every straight-quoted
  // passage that follows — which made the checker report the prose *between*
  // two genuine quotations as an unsourced quote. Segmenting first cuts a
  // caption in half, so the stray mark survives however carefully the segment
  // is cleaned afterwards.
  const body = `${a.summary}\n\n${a.body}`.replace(/!\[[\s\S]*?\]\([^)]*\)/g, ' ');

  for (const seg of segments(body)) {
    const cites = [...seg.matchAll(CITE_G)].map((m) => ({ id: m[1], locator: m[2] ?? '' }));
    if (!cites.length) continue;
    checked++;

    const prose = seg
      .replace(/!\[[\s\S]*?\]\([^)]*\)/g, ' ')
      .replace(CITE_G, ' ')
      .replace(/\s+/g, ' ')
      .trim();

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
      const textCites = [...new Set(cites.map((c) => c.id))].filter((id) => !isDerived(id));
      // Nothing to check a figure against if every source here is derived.
      for (const nm of (textCites.length ? prose.matchAll(/\b(\d[\d,]{2,})\b/g) : [])) {
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

    // ---- thin sources ----------------------------------------------------
    // A citation can point at a document that exists and still support nothing.
    // Drew1011's forum profile is archived as 387 bytes reading "Foxton
    // Forever", yet is cited three times for a dated chain of alliance titles.
    // The citation resolves, the locator looks specific, and there is nothing
    // behind it — a failure no other detector here can see.
    if (ONLY.includes('thin')) {
      for (const c of cites) {
        const text = sourceText(c.id);
        if (text === null) continue;
        if (text.length >= 400) continue;
        // Only complain when the claim is more substantial than its evidence.
        if (prose.length < text.length) continue;
        add({
          kind: 'source-thinner-than-claim',
          severity: 'high',
          slug: a.slug,
          detail: `${c.id} holds ${text.length} chars: "${text.slice(0, 60)}"`,
          cited: c.id,
          note: `locator promises "${(c.locator || '(none)').slice(0, 70)}"`,
        });
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
