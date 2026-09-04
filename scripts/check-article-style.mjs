#!/usr/bin/env node
/**
 * Style linter for the Chronicle wiki corpus (data/wiki/seed-articles.json).
 * The rules it enforces are the chronicle-article skill's
 * (.claude/skills/chronicle-article/): provenance lives in footnotes, not prose.
 *
 *   node scripts/check-article-style.mjs                  report on the corpus
 *   node scripts/check-article-style.mjs --slug <slug>    one article
 *   node scripts/check-article-style.mjs --strict         exit non-zero on ERRORs
 *   node scripts/check-article-style.mjs --fact "<text>"  list articles stating a fact
 *
 * ERROR   mechanical violations: banned jargon, first person, manual Sources
 *         sections, field limits. Never acceptable; --strict fails on these.
 * WARN    phrasings that usually violate the attribution test ("according to",
 *         "attested", "Wayback", ...). Each needs a human/agent judgment call:
 *         the four legitimate cases (opinion, source disagreement, own conduct,
 *         quotation) may keep their attribution. Quoted text is exempt.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const arg = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const onlySlug = arg('--slug');
const fact = arg('--fact');

const { articles } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wiki/seed-articles.json'), 'utf8'));

// --fact: where is this claim stated? (bodies, summaries, infoboxes, titles)
if (fact) {
  const needle = fact.toLowerCase();
  let hits = 0;
  for (const a of articles) {
    const places = [];
    if (a.title?.toLowerCase().includes(needle)) places.push('title');
    if (a.summary?.toLowerCase().includes(needle)) places.push('summary');
    if (a.body?.toLowerCase().includes(needle)) places.push('body');
    for (const row of a.infobox ?? []) {
      if (`${row.label} ${row.value}`.toLowerCase().includes(needle)) { places.push(`infobox "${row.label}"`); break; }
    }
    if (places.length) { hits++; console.log(`${a.slug}  (${places.join(', ')})`); }
  }
  console.log(`\n${hits} article(s) state ${JSON.stringify(fact)}. Update every one, or none.`);
  process.exit(0);
}

// Remove the spans that are exempt from voice checks: quotations (a source may
// say anything), citation markers, embeds and link targets.
// This corpus quotes with single quotes and blockquotes as often as with double
// quotes; missing those makes a source's own "we" look like our first person.
const proseOf = (text) =>
  (text ?? '')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/^>.*$/gm, ' <q> ')                       // blockquoted source text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')             // image captions quote sources too
    .replace(/"[^"\n]{2,1500}"/g, ' <q> ')
    .replace(/[“][^”\n]{2,1500}[”]/g, ' <q> ')
    // Single-quoted spans, bounded so contractions ("Fantasy's", "don't") survive.
    .replace(/(^|[\s(—–-])'[^'\n]{2,1500}'(?=$|[\s.,;:!?)\]—–-])/g, '$1 <q> ')
    .replace(/(^|[\s(—–-])[‘][^’\n]{2,1500}[’](?=$|[\s.,;:!?)\]—–-])/g, '$1 <q> ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1');

const wordCount = (text) => proseOf(text).split(/\s+/).filter(Boolean).length;

// Same markup stripping, but quotations left intact — quoted words are still
// words on the page, so length and quote density must both count them.
const readableText = (text) =>
  (text ?? '')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1');
const readableWords = (text) => readableText(text).split(/\s+/).filter(Boolean).length;

// ERROR patterns — research-layer language and coinages with no place in prose.
const BANNED = [
  [/quiet[- ]territor/i, 'banned jargon "quiet territor…" — write "territory exchanges" ([[territory-warfare]] explains the FFA filter)'],
  [/FFA[- ]cluster/i, 'banned jargon "FFA-cluster" — research-layer vocabulary'],
  [/an earlier (version|revision) of this article/i, 'talks about its own revision history'],
  [/\bthe chronicle('s)? (database|corpus|records?|sources?)\b/i, 'talks about the chronicle database — provenance belongs in the footnote'],
  [/\b(?:our|this wiki's) (research|analysis|archive|records?|sources?)\b/i, 'first-person research talk'],
  [/\b(recorded|held|found) in no source\b/i, 'research-process negative — write it as a fact about the past ("was never recorded")'],
  [/^##\s+(Sources|References)\s*$/im, 'manual Sources/References section — the reference list is generated'],
  [/\bwe\b|\bour\b/i, 'first person'],
];

// WARN patterns — each usually fails the attribution test; the four legitimate
// cases may keep theirs.
const SOURCE_TALK = [
  [/\baccording to\b/i, '"according to"'],
  [/\battest(ed|ation|s)?\b/i, '"attested"'],
  [/\bwayback\b/i, '"Wayback"'],
  [/\bmap[- ]data\b/i, '"map-data"'],
  [/\b(oral )?testimon(y|ies)\b/i, '"testimony"'],
  [/\bmemoirs?\b/i, '"memoir"'],
  [/\brecall(s|ed)?\b|\brecollect(s|ed|ion|ions)?\b/i, '"recalled/recollection"'],
  [/\bstorytimes?\b/i, '"storytime"'],
  [/\barchiv(e|ed|es)\b/i, '"archive(d)" (exempt if it means an in-game guild archival)'],
  [/\bcommunity timeline\b/i, '"community timeline"'],
  [/\bcorroborat(e|ed|es|ion)\b/i, '"corroborated"'],
  [/\bsurvives? (only )?(in|as|through)\b/i, '"survives in/as" (record-talk)'],
  [/\b(a|one|a single) forum post\b/i, 'evidence-counting'],
  [/\bthe (written )?record (goes|is|has|shows|preserves)\b/i, 'record-talk'],
  // Past-tense "was never recorded" is the sanctioned phrasing and is NOT
  // flagged; present-tense forms talk about the archive's current state.
  [/\b(is|are) (not |never )?(recorded|documented|preserved)\b/i, 'present-tense record-talk — prefer the past-fact form ("was never recorded")'],
  [/\b(recorded|documented|attested|named|mentioned) (in no|nowhere|by no)\b/i, 'record-inventory phrasing'],
];

const PEACOCK = [/\b(legendary|iconic|infamous(ly)?|remarkabl[ey]|dominant beyond|unstoppable|storied)\b/i, 'peacock word'];

// Length is judged per citation rather than per page type — see the check below.
// 45 sits about half again above the corpus trend of 25-33.
const WORDS_PER_CITATION = 45;

// Wikipedia's quotation density over the ten historical articles this style was
// calibrated against. Reported for context; not a gate.
const WIKIPEDIA_QUOTE_PCT = 2.4;

// Pair quote marks by parity, per line. A minimum-length filter applied before
// pairing would skip short quotes and then pair a CLOSING mark with the next
// OPENING one, swallowing the prose between them and inflating the count.
function quotedSpans(text) {
  const out = [];
  for (const line of text.split('\n')) {
    for (const [open, close] of [['"', '"'], ['“', '”']]) {
      let i = 0;
      for (;;) {
        const a = line.indexOf(open, i);
        if (a === -1) break;
        const b = line.indexOf(close, a + 1);
        if (b === -1) break;
        out.push(line.slice(a + 1, b));
        i = b + 1;
      }
    }
    // Single quotes only when the closing mark is followed by a boundary, so
    // apostrophes in contractions and possessives cannot open a span.
    const re = /(^|[\s(—–-])'([^'\n]{2,})'(?=$|[\s.,;:!?)\]—–-])/g;
    let m;
    while ((m = re.exec(line))) out.push(m[2]);
  }
  return out;
}

// In-prose attribution density (voice.md target: corpus average <= 1.0 per
// 1,000 words). Counts the phrasings that name a source or witness in prose.
const ATTRIB = /\baccording to\b|\battested\b|\bwayback\b|\bmap[- ]data\b|\btestimon(y|ies)\b|\bmemoirs?\b|\brecall(s|ed)?\b|\brecollection\b|\bstorytimes?\b|\bcommunity timeline\b|\bcorroborat/gi;

let errors = 0, warns = 0, totalWords = 0, totalAttrib = 0, totalCites = 0, totalQuoted = 0;
const scanned = onlySlug ? articles.filter((a) => a.slug === onlySlug) : articles;
if (onlySlug && !scanned.length) { console.error(`no article with slug ${onlySlug}`); process.exit(2); }

for (const a of scanned) {
  const findings = [];
  const fields = [['summary', a.summary ?? ''], ['body', a.body ?? '']];
  const infoboxText = (a.infobox ?? []).map((r) => `${r.label}: ${r.value}`).join('\n');
  if (infoboxText) fields.push(['infobox', infoboxText]);

  for (const [where, raw] of fields) {
    const prose = proseOf(raw);
    for (const [re, msg] of BANNED) {
      // "## Sources" must be matched against the raw body, not stripped prose
      const target = String(re).includes('##') ? raw : prose;
      const m = target.match(re);
      if (m) findings.push(['ERROR', `${where}: ${msg}  [${m[0].trim().slice(0, 40)}]`]);
    }
    for (const [re, msg] of [...SOURCE_TALK, PEACOCK]) {
      const matches = [...prose.matchAll(new RegExp(re.source, re.flags + (re.flags.includes('g') ? '' : 'g')))];
      if (matches.length) findings.push(['WARN', `${where}: ${msg} ×${matches.length}  [${matches[0][0].trim().slice(0, 40)}]`]);
    }
  }

  if ((a.summary ?? '').length > 500) findings.push(['ERROR', `summary is ${a.summary.length} chars (max 500)`]);

  // The summary renders as its own paragraph above the body, so a body opening
  // that restates it verbatim shows the reader the same sentences twice.
  // Measured as the longest run of consecutive shared words: a short article's
  // summary and body necessarily share vocabulary, and only verbatim
  // repetition is the fault. An opener that adds its own citation is
  // elaboration, not repetition, and is left alone.
  {
    const blocks = (a.body ?? '').split(/\n\n+/);
    // a bullet needs a space after its marker; "**Bold**" opens a paragraph
    const opener = blocks.find((b) => b.trim() && !/^#/.test(b) && !/^\{\{/.test(b) && !/^!\[/.test(b) && !/^([-*]\s|[|>])/.test(b));
    if (opener) {
      const tok = (s) => proseOf(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
      const s = tok(a.summary ?? ''), ob = tok(opener);
      const b = ' ' + ob.join(' ') + ' ';
      let run = 0;
      for (let i = 0; i < s.length; i++)
        for (let len = s.length - i; len > run; len--)
          if (b.includes(' ' + s.slice(i, i + len).join(' ') + ' ')) { run = len; break; }
      // Elaboration vs repetition: if the shared run is most of the opener, the
      // paragraph is the summary again. If the opener is substantially longer,
      // it is adding dates, figures or citations and earns its place — even
      // though it restates the definition to get there.
      const covers = ob.length ? run / ob.length : 0;
      if (run >= 12 && covers >= 0.6)
        findings.push(['WARN', `body restates the lede (${run} consecutive words, ${Math.round(covers * 100)}% of the opening paragraph) — the summary is the lede; open at the first section`]);

      // Removing a redefining first sentence can leave the next one opening on
      // a pronoun with no antecedent. The summary sits above it on the page, so
      // it half-reads — but the body must name its own subject.
      if (/^(Its|Their|His|Her|It|They|He|She|This|These|Those|That)\b/.test(opener.trim()))
        findings.push(['ERROR', `body opens on a pronoun with no antecedent ("${opener.trim().split(/\s+/)[0]}") — name the subject`]);
    }

    // The second lede. The check above only catches word-for-word repetition,
    // which is the rare case; the common one is a body that opens by defining
    // the subject again in fresh words, so the reader meets two ledes stacked.
    // Rewriting cannot be detected by string overlap, so test what the
    // paragraph is FOR: a real opening paragraph carries a citation the rest of
    // the body does not, or a date, figure or quotation the summary lacks.
    // One that carries neither exists only to restate the summary.
    const first = blocks.find((b) => b.trim());
    if (first && !/^#/.test(first.trim()) && !/^(\{\{|!\[|[-*]\s|[|>])/.test(first.trim())) {
      const t = (a.title ?? '').trim();
      const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const head = first.trim().slice(0, Math.max(t.length + 60, 100));
      const redefines = new RegExp(`^\\*{0,2}${esc}\\b`, 'i').test(first.trim().replace(/^\*\*/, '**')) &&
        /\b(was|is|were|are)\b/.test(head);
      if (redefines) {
        const rest = blocks.slice(blocks.indexOf(first) + 1).join('\n\n');
        const cited = new Set([...rest.matchAll(/\{\{cite:([^|}]+)/g)].map((m) => m[1]));
        // Dates, counts and quoted wording are what an elaborating span adds.
        // Single quotes are bounded as in proseOf, so possessives ("HackForums'
        // dominance") cannot pair up into a spurious quotation.
        const marks = (s) => {
          const txt = readableText(s);
          const out = new Set([...txt.matchAll(/\b\d[\d,.]*\b/g)].map((m) => m[0].replace(/[.,]$/, '')));
          const quotes = [
            /"([^"\n]{4,1500})"/g,
            /[“]([^”\n]{4,1500})[”]/g,
            /(?:^|[\s(—–-])'([^'\n]{4,1500})'(?=$|[\s.,;:!?)\]—–-])/g,
            /(?:^|[\s(—–-])[‘]([^’\n]{4,1500})[’](?=$|[\s.,;:!?)\]—–-])/g,
          ];
          for (const re of quotes) for (const m of txt.matchAll(re)) out.add('q:' + m[1].slice(0, 30));
          return out;
        };
        const inSummary = marks(a.summary ?? '');
        // Does this span do work the summary does not? A span that cites a
        // source found nowhere else, or states a date, figure or quotation the
        // summary lacks, is elaborating. One that does neither only restates.
        const restatesOnly = (span) =>
          ![...new Set([...span.matchAll(/\{\{cite:([^|}]+)/g)].map((m) => m[1]))].some((c) => !cited.has(c)) &&
          ![...marks(span)].some((m) => !inSummary.has(m));

        // Split off the first sentence without letting a citation's own full
        // stops ("vol. 14, ...") break it: mask citations to equal-length runs,
        // find the boundary there, then cut the original at that index.
        const masked = first.replace(/\{\{[^}]*\}\}/g, (m) => ' '.repeat(m.length));
        const at = masked.search(/[.!?]["'”’)]?\s/);
        let sentence1 = at === -1 ? first : first.slice(0, at + 1);
        // A full stop inside a quotation is not a sentence end. If the cut left
        // an unclosed quote, the sentence is still carrying quoted evidence, so
        // judge the paragraph as a whole rather than a fragment of it.
        if ((sentence1.match(/"/g) ?? []).length % 2 === 1) sentence1 = first;

        if (restatesOnly(first))
          findings.push(['WARN', 'body opens by defining the subject again, adding no citation or fact the ' +
            'summary lacks — the summary is the lede; open at the first section']);
        else if (restatesOnly(sentence1))
          findings.push(['WARN', 'the body\'s first sentence redefines the subject, adding no citation or fact ' +
            'the summary lacks — cut it and let the paragraph open on its own work']);
      }
    }
  }
  if ((a.title ?? '').length > 120) findings.push(['ERROR', `title is ${a.title.length} chars (max 120)`]);
  if ((a.infobox ?? []).length > 24) findings.push(['ERROR', `infobox has ${a.infobox.length} rows (max 24)`]);
  for (const row of a.infobox ?? []) {
    if ((row.value ?? '').length > 300) findings.push(['ERROR', `infobox "${row.label}" value is ${row.value.length} chars (max 300)`]);
    if ((row.value ?? '').length > 90) findings.push(['WARN', `infobox "${row.label}" is ${row.value.length} chars — a fact sheet, not prose`]);
  }

  const words = readableWords(a.body);
  totalWords += words;

  // Length is judged against the evidence, not a flat budget. Across the corpus
  // article length tracks citation count almost exactly (r = 0.95,
  // words ~ 27 x citations), and words-per-citation sits at 25-33 for every
  // page type. So a long article is not the problem; a long article with thin
  // sourcing is. This flags prose running ahead of what supports it, which is
  // the same fault the project cares about anyway.
  const citeCount = (a.body?.match(/\{\{cite:/g) ?? []).length;
  totalCites += citeCount;
  if (citeCount === 0 && words > 40) findings.push(['ERROR', `${words} words and no citations`]);
  else if (citeCount && words / citeCount > WORDS_PER_CITATION)
    findings.push(['WARN', `${words} words for ${citeCount} citations = ${Math.round(words / citeCount)}w each ` +
      `(corpus runs 25-33) — the prose is running ahead of its sourcing`]);
  // A backstop for genuine sprawl, well above anything the corpus now contains.
  if (words > 2600) findings.push(['WARN', `${words} words — long enough to want splitting`]);

  // Quotation density. Wikipedia runs ~2.4%; this corpus quotes far more
  // because it works from primary forum posts where the wording is often the
  // artifact. That is legitimate, but a single very long quote rarely is.
  const qSpans = quotedSpans(readableText(a.body));
  const qWords = qSpans.reduce((s, x) => s + x.split(/\s+/).filter(Boolean).length, 0);
  totalQuoted += qWords;
  for (const s of qSpans) {
    const n = s.split(/\s+/).filter(Boolean).length;
    if (n >= 60) findings.push(['WARN', `${n}-word quotation — trim to the part that carries the voice: "${s.slice(0, 60)}…"`]);
  }

  const attribs = [...proseOf(a.body).matchAll(ATTRIB)].length;
  totalAttrib += attribs;
  const density = words ? (attribs / words) * 1000 : 0;
  if (density > 2 && attribs > 1) findings.push(['WARN', `${attribs} in-prose attributions in ${words} words (${density.toFixed(1)}/1000; target ≤ 1.0)`]);

  if (findings.length) {
    console.log(`\n${a.slug}  (${a.pageType})`);
    for (const [level, msg] of findings) {
      console.log(`  ${level.padEnd(5)} ${msg}`);
      if (level === 'ERROR') errors++; else warns++;
    }
  }
}

const density = totalWords ? ((totalAttrib / totalWords) * 1000).toFixed(2) : '0';
const quotePct = totalWords ? ((totalQuoted / totalWords) * 100).toFixed(1) : '0';
const perCite = totalCites ? (totalWords / totalCites).toFixed(0) : 'n/a';
console.log(`\n${scanned.length} article(s), ${totalWords.toLocaleString()} words, ${totalCites.toLocaleString()} citations (${perCite}w each).`);
console.log(`quotation: ${quotePct}% of body text (Wikipedia benchmark ${WIKIPEDIA_QUOTE_PCT}% — this corpus quotes primary posts, so it runs higher by design).`);
console.log(`${errors} error(s), ${warns} warning(s). In-prose attribution density: ${density}/1,000 words (target ≤ 1.0).`);
if (warns) console.log('Warnings need the attribution test: delete the attributing phrase — does the reader lose anything the footnote does not carry?');
if (strict && errors) process.exitCode = 1;
