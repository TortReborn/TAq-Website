#!/usr/bin/env node
/**
 * Opening posts in these forum threads carry edit dates, not creation dates.
 *
 *   node scripts/check-thread-open-dates.mjs [--strict]
 *
 * XenForo renders post #1 with the timestamp of its last revision, so a thread
 * opened in May 2017 and touched in 2025 shows post #1 as 2025 while post #2
 * still shows 2017. Fifty-three archived threads look like this, some by years.
 * A writer taking post #1 at face value would date a guild's founding to the day
 * somebody fixed a typo.
 *
 * The archivist recorded the real date in each source's manifest note at fetch
 * time, and the reference page renders it, so a reader can reconcile the two.
 * That is a convention nothing was enforcing. This enforces it: every thread
 * whose post #1 postdates post #2 must carry a date in its note.
 */
import fs from 'fs';
import path from 'path';

const DOCS = path.join(process.cwd(), 'data/wiki/sources/docs');
const sources = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/wiki/sources/index.json'), 'utf8')).sources;

const HEAD = /^### post #(\d+) — .*? — (.+)$/gm;
const DATED = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? ?\d{0,2},? ?\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/;

const strict = process.argv.includes('--strict');
const bad = [];
let edited = 0;

for (const file of fs.readdirSync(DOCS).filter((f) => /^thread-\d+\.md$/.test(f))) {
  const id = file.replace('.md', '');
  const text = fs.readFileSync(path.join(DOCS, file), 'utf8');
  const posts = [];
  HEAD.lastIndex = 0;
  let m;
  while ((m = HEAD.exec(text))) posts.push({ n: +m[1], t: Date.parse(m[2].replace(' at ', ' ')) });
  if (posts.length < 2) continue;
  const first = posts[0];
  const second = posts.find((p) => p.n === first.n + 1);
  if (!second || isNaN(first.t) || isNaN(second.t)) continue;
  // A day's slack: an edit made minutes after posting is not a trap.
  if (first.t - second.t <= 86_400_000) continue;
  edited++;
  const note = sources[id]?.note ?? '';
  if (!DATED.test(note)) bad.push({ id, days: Math.round((first.t - second.t) / 86_400_000) });
}

console.log(`${edited} thread(s) whose opening post carries an edit date.`);
if (bad.length) {
  console.error(`\n${bad.length} of them give no date in the manifest note, so nothing on the`);
  console.error('reference page tells a reader when the thread was actually opened:');
  for (const b of bad) console.error(`  ${b.id}  (post #1 is ${b.days} days after post #2)`);
  console.error('\nAdd the original date to the note in data/wiki/sources/index.json.');
  if (strict) process.exit(1);
} else {
  console.log('All of them record the real date in the manifest note.');
}
