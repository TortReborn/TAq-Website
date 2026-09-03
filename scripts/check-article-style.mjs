#!/usr/bin/env node
// Check chronicle articles against the house style (.claude/skills/chronicle-article).
//
//   node scripts/check-article-style.mjs                 # report the whole corpus
//   node scripts/check-article-style.mjs --slug foo      # one article, with context
//   node scripts/check-article-style.mjs --fact "15 Mar 2018"   # who repeats a fact
//   node scripts/check-article-style.mjs --strict        # non-zero exit on errors
//
// The prose rules cannot be fully mechanised — whether an attribution is one of
// the four legitimate cases is a judgement. So attribution phrases are reported
// with their surrounding text for a human to weigh, and the gate is the corpus
// rate, benchmarked at 0.89/1000 words across ten historical Wikipedia articles.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTICLES = JSON.parse(readFileSync(join(ROOT, 'data/wiki/seed-articles.json'), 'utf8')).articles;

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1]; };
const STRICT = argv.includes('--strict');
const ONLY = flag('--slug');
const FACT = flag('--fact');

// Wikipedia's rate over Delian League, Hanseatic League, Second Punic War,
// Battle of Hastings, Peloponnesian War, Achaean League, Wars of the Roses,
// Themistocles, Aetolian League, Battle of Agincourt.
const WIKIPEDIA_ATTR_RATE = 0.89;
const ATTR_TARGET = 1.0;

const BUDGET = {
  alliance: [300, 700], war: [250, 600], guild: [150, 400], player: [100, 300],
  era: [400, 900], update: [150, 400], general: [150, 500],
};

// Phrases that hand provenance to the prose. Legitimate in the four cases from
// voice.md, so these are reported rather than banned outright.
const ATTRIBUTION = /\b(?:according to|by (?:his|her|their|its) (?:own )?account|(?:in|on) (?:his|her|their) account|(?:he|she|they|who) (?:states?|stated|writes?|wrote|claims?|claimed|recalls?|recalled|says?|said) that|(?:states?|writes?|claims?|recalls?|reports?) that|as recorded by|is (?:described|attested|recorded) (?:in detail )?(?:only )?by|supplies? (?:an?|the) (?:explanation|date|account)|on that reading)\b/gi;

// Talk-page material: the article discussing our research instead of the past.
const META = [
  [/\ban earlier version of this article\b/gi, 'refers to an earlier revision'],
  [/\bthis article\b/gi, 'refers to itself'],
  [/\b(?:no|any) sources? held here\b/gi, 'refers to our archive'],
  [/\b(?:recorded |held |found )in no source held here\b/gi, 'refers to our archive'],
  [/\bin the corpus\b/gi, 'refers to our archive'],
  [/\bthe chronicle's sources\b/gi, 'refers to our archive'],
  [/\bour (?:records?|sources?|analysis|archive)\b/gi, 'first person about our research'],
  [/\bno other .{0,40}facts? about\b/gi, 'reports the absence of research, not of history'],
  [/\b(?:archived|retrieved) in \d{4}\b/gi, 'archive mechanics belong in the reference'],
];

// The source, rather than the event, as the subject of the sentence.
const SOURCE_SUBJECT = [
  [/\b(?:a|the) (?:recovered |contemporaneous )?(?:Wayback )?capture\b[^.]{0,40}\bshows?\b/gi, 'capture as subject'],
  [/\bthe (?:forum|written|contemporaneous|surviving) record shows?\b/gi, 'record as subject'],
  [/\b(?:a|the) first-person account\b/gi, 'account as subject'],
  [/\b(?:the|a) (?:forum )?thread \d+ (?:shows?|records?|says?)\b/gi, 'thread as subject'],
];

const PEACOCK = /\b(?:legendary|iconic|greatest|remarkable|impressive|infamous(?:ly)?|unquestionabl[ey]|beyond question)\b/gi;
const WEASEL = /\b(?:some say|many believe|it is widely (?:regarded|believed|held)|most agree)\b/gi;
const HEDGE_STACK = /\b(?:may|might|could) have possibly\b|\b(?:possibly|perhaps) (?:may|might) have\b|\bappears? to possibly\b/gi;

const words = (s) => s.split(/\s+/).filter(Boolean).length;
const stripMarkup = (s) => s
  .replace(/\{\{cite:[^}]*\}\}/g, '')
  .replace(/\{\{(?:map|war-chart|alliance):[^}]*\}\}/g, '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2');

// Every way this corpus writes a date, so --fact finds all of them.
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function dateForms(text) {
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let y, m, d;
  if (iso) { [, y, m, d] = iso.map(Number); }
  else {
    const long = text.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
    const us = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (long) { d = +long[1]; m = MONTHS.findIndex(x => x.toLowerCase().startsWith(long[2].toLowerCase().slice(0, 3))) + 1; y = +long[3]; }
    else if (us) { m = MONTHS.findIndex(x => x.toLowerCase().startsWith(us[1].toLowerCase().slice(0, 3))) + 1; d = +us[2]; y = +us[3]; }
    else return [text];
  }
  if (!m || !d || !y) return [text];
  const L = MONTHS[m - 1], S = L.slice(0, 3);
  return [`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
          `${d} ${L} ${y}`, `${d} ${S} ${y}`, `${L} ${d}, ${y}`, `${S} ${d}, ${y}`,
          `${d} ${L}`, `${d} ${S}`];
}

if (FACT) {
  const forms = dateForms(FACT.trim());
  console.log(`Searching for: ${forms.join('  |  ')}\n`);
  let n = 0;
  for (const a of ARTICLES) {
    const hay = `${a.summary}\n${JSON.stringify(a.infobox || [])}\n${a.body}`;
    const hits = forms.filter(f => hay.includes(f));
    if (!hits.length) continue;
    n++;
    const where = [];
    if (forms.some(f => a.summary.includes(f))) where.push('LEDE');
    if (forms.some(f => JSON.stringify(a.infobox || []).includes(f))) where.push('INFOBOX');
    if (forms.some(f => a.body.includes(f))) where.push('body');
    console.log(`${a.slug}  [${a.pageType}]  ${where.join(' + ')}   matched: ${hits.join(', ')}`);
    for (const line of a.body.split('\n')) {
      if (forms.some(f => line.includes(f))) console.log(`      ${stripMarkup(line).trim().slice(0, 150)}`);
    }
  }
  console.log(`\n${n} article(s) repeat this fact. Update prose, infobox rows AND ledes.`);
  process.exit(0);
}

const findings = [];
const add = (slug, sev, rule, msg, ctx) => findings.push({ slug, sev, rule, msg, ctx });

let corpusWords = 0, corpusAttr = 0;
const targets = ONLY ? ARTICLES.filter(a => a.slug === ONLY) : ARTICLES;
if (ONLY && !targets.length) { console.error(`No article with slug "${ONLY}"`); process.exit(1); }

for (const a of targets) {
  const body = a.body || '';
  const prose = stripMarkup(body);
  const w = words(prose);
  corpusWords += w;

  const context = (re) => {
    const out = [];
    for (const line of prose.split('\n')) {
      re.lastIndex = 0;
      if (re.test(line)) out.push(line.trim().slice(0, 160));
    }
    return out;
  };

  // --- attribution ---------------------------------------------------------
  const attrs = prose.match(ATTRIBUTION) || [];
  corpusAttr += attrs.length;
  if (attrs.length) {
    const rate = w ? (attrs.length / w) * 1000 : 0;
    add(a.slug, attrs.length >= 3 ? 'error' : 'warn', 'attribution',
      `${attrs.length} in-prose attribution(s), ${rate.toFixed(1)}/1000w — keep only opinion, source disagreement, an interested party on their own conduct, or a direct quote`,
      context(ATTRIBUTION));
  }

  // --- meta-commentary -----------------------------------------------------
  for (const [re, why] of META) {
    const m = prose.match(re);
    if (m) add(a.slug, 'error', 'meta', `${why}: "${m[0]}"`, context(re));
  }
  for (const [re, why] of SOURCE_SUBJECT) {
    const m = prose.match(re);
    if (m) add(a.slug, 'warn', 'source-as-subject', `${why}: "${m[0]}"`, context(re));
  }

  // --- word choice ---------------------------------------------------------
  // A peacock word inside a quotation is attributed, which is allowed.
  const unquoted = prose.replace(/"[^"]*"/g, '""');
  for (const [re, rule, sev] of [[PEACOCK, 'peacock', 'error'], [WEASEL, 'weasel', 'error'], [HEDGE_STACK, 'hedge-stack', 'warn']]) {
    const m = unquoted.match(re);
    if (m) add(a.slug, sev, rule, `"${[...new Set(m)].join('", "')}"`, context(re));
  }

  // --- lede ----------------------------------------------------------------
  const sum = (a.summary || '').trim();
  if (!sum) add(a.slug, 'error', 'lede', 'no summary');
  else {
    if (sum.length > 500) add(a.slug, 'error', 'lede', `${sum.length} chars (max 500)`);
    const sentences = sum.split(/(?<=[.!?])\s+(?=[A-Z"'\[])/).length;
    if (sentences > 3) add(a.slug, 'warn', 'lede', `${sentences} sentences (target 1–3)`);
    if ((sum.match(/,/g) || []).length >= 6 && sentences <= 2)
      add(a.slug, 'warn', 'lede', `comma-spliced inventory (${(sum.match(/,/g) || []).length} commas in ${sentences} sentence(s)) — define and place the subject instead`);
  }

  // --- structure -----------------------------------------------------------
  if (/^##+\s*(Sources|References)\s*$/im.test(body))
    add(a.slug, 'error', 'structure', 'hand-written Sources/References heading — the list is generated');

  const budget = BUDGET[a.pageType];
  if (budget && w > budget[1]) {
    const over = w / budget[1];
    add(a.slug, over > 1.5 ? 'error' : 'warn', 'length',
      `${w} words, budget ${budget[0]}–${budget[1]} for ${a.pageType} (${Math.round((over - 1) * 100)}% over)`);
  }

  // Section order must follow definition -> origins -> narrative -> lists -> legacy.
  const heads = (body.match(/^##\s+(.+)$/gm) || []).map(h => h.replace(/^##\s+/, '').trim());
  const rank = (h) => {
    if (/^the record$/i.test(h)) return 0;
    if (/^(formation|foundation|background|origins?|etymology)$/i.test(h)) return 1;
    if (/^(organization|organisation|government|governance|leadership.*)$/i.test(h)) return 2;
    if (/^(history|course of the war)$/i.test(h)) return 3;
    if (/^(dissolution|decline.*|collapse|aftermath)$/i.test(h)) return 4;
    if (/^(membership|members|alliances)$/i.test(h)) return 5;
    if (/^legacy$/i.test(h)) return 6;
    return null;
  };
  const ranked = heads.map(rank).filter(r => r !== null);
  for (let i = 1; i < ranked.length; i++) {
    if (ranked[i] < ranked[i - 1]) {
      add(a.slug, 'warn', 'structure', `section order: ${heads.join(' > ')}`);
      break;
    }
  }

  // --- infobox -------------------------------------------------------------
  // A list of like items is fine; a narrative clause is not. Detect the clause
  // by a finite verb or an over-long segment.
  const CLAUSE = /\b(?:was|were|is|are|had|has|took|stood|left|joined|collapsed|eliminated|merged|became|remained|kept|withdrew|recorded as|per a)\b/i;
  for (const row of a.infobox || []) {
    const v = stripMarkup(String(row.value || ''));
    const segments = v.split(/;/).map(s => s.trim()).filter(Boolean);
    const narrative = segments.filter(s => CLAUSE.test(s) || words(s) > 8);
    if (segments.length > 1 && narrative.length)
      add(a.slug, 'error', 'infobox', `"${row.label}" carries a narrative clause — one fact per row, the rest belongs in the body: ${v.slice(0, 90)}`);
    else if (segments.length === 1 && CLAUSE.test(v) && words(v) > 8)
      add(a.slug, 'error', 'infobox', `"${row.label}" is a sentence, not a fact: ${v.slice(0, 90)}`);
    else if (v.length > 60) add(a.slug, 'warn', 'infobox', `"${row.label}" is ${v.length} chars — flatten to a single fact: ${v.slice(0, 90)}`);
    if (/^(unknown|n\/a|none|not recorded)$/i.test(v.trim()))
      add(a.slug, 'warn', 'infobox', `"${row.label}" is "${v}" — omit the row instead`);
  }

  // --- images --------------------------------------------------------------
  for (const m of body.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)) {
    if (!m[1].trim()) add(a.slug, 'error', 'image', `image without a caption: ${m[2].slice(0, 70)}`);
  }
}

// ---- report ---------------------------------------------------------------
const bySlug = new Map();
for (const f of findings) {
  if (!bySlug.has(f.slug)) bySlug.set(f.slug, []);
  bySlug.get(f.slug).push(f);
}
const errors = findings.filter(f => f.sev === 'error').length;
const warns = findings.filter(f => f.sev === 'warn').length;

const order = [...bySlug.entries()].sort((a, b) =>
  b[1].filter(f => f.sev === 'error').length - a[1].filter(f => f.sev === 'error').length ||
  b[1].length - a[1].length);

for (const [slug, fs] of order) {
  console.log(`\n${slug}`);
  for (const f of fs) {
    console.log(`  ${f.sev === 'error' ? 'ERROR' : 'warn '} [${f.rule}] ${f.msg}`);
    if (ONLY && f.ctx) for (const c of f.ctx.slice(0, 4)) console.log(`         · ${c}`);
  }
}

const rate = corpusWords ? (corpusAttr / corpusWords) * 1000 : 0;
console.log(`\n${'='.repeat(70)}`);
console.log(`${targets.length} article(s), ${corpusWords.toLocaleString()} words of prose`);
console.log(`in-prose attribution: ${corpusAttr} = ${rate.toFixed(2)}/1000w  ` +
            `(target ≤ ${ATTR_TARGET.toFixed(2)}, Wikipedia benchmark ${WIKIPEDIA_ATTR_RATE})`);
console.log(`${errors} error(s), ${warns} warning(s) across ${bySlug.size} article(s)`);

const rateFail = !ONLY && rate > ATTR_TARGET;
if (rateFail) console.log(`\nFAIL: attribution rate ${rate.toFixed(2)} exceeds ${ATTR_TARGET.toFixed(2)}/1000 words`);
if (STRICT && (errors || rateFail)) process.exit(1);
