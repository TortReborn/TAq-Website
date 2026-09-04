#!/usr/bin/env node
/**
 * Style linter for the Chronicles wiki corpus (data/wiki/seed-articles.json).
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

const BUDGETS = { alliance: 700, war: 600, guild: 400, player: 300, era: 900, update: 400, general: 500 };

// In-prose attribution density (voice.md target: corpus average <= 1.0 per
// 1,000 words). Counts the phrasings that name a source or witness in prose.
const ATTRIB = /\baccording to\b|\battested\b|\bwayback\b|\bmap[- ]data\b|\btestimon(y|ies)\b|\bmemoirs?\b|\brecall(s|ed)?\b|\brecollection\b|\bstorytimes?\b|\bcommunity timeline\b|\bcorroborat/gi;

let errors = 0, warns = 0, totalWords = 0, totalAttrib = 0;
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
  if ((a.title ?? '').length > 120) findings.push(['ERROR', `title is ${a.title.length} chars (max 120)`]);
  if ((a.infobox ?? []).length > 24) findings.push(['ERROR', `infobox has ${a.infobox.length} rows (max 24)`]);
  for (const row of a.infobox ?? []) {
    if ((row.value ?? '').length > 300) findings.push(['ERROR', `infobox "${row.label}" value is ${row.value.length} chars (max 300)`]);
    if ((row.value ?? '').length > 90) findings.push(['WARN', `infobox "${row.label}" is ${row.value.length} chars — a fact sheet, not prose`]);
  }

  const words = wordCount(a.body);
  totalWords += words;
  const budget = BUDGETS[a.pageType];
  if (budget && words > budget * 1.25) findings.push(['WARN', `${words} words (budget for ${a.pageType}: ${budget})`]);

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
console.log(`\n${scanned.length} article(s), ${totalWords.toLocaleString()} words.`);
console.log(`${errors} error(s), ${warns} warning(s). In-prose attribution density: ${density}/1,000 words (target ≤ 1.0).`);
if (warns) console.log('Warnings need the attribution test: delete the attributing phrase — does the reader lose anything the footnote does not carry?');
if (strict && errors) process.exitCode = 1;
