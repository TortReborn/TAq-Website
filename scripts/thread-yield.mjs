#!/usr/bin/env node
/**
 * Report what a forum thread in the archive can still yield.
 *
 *   node scripts/thread-yield.mjs <thread-number> [--posts] [--author NAME]
 *
 * Recruitment threads look like dead ends because the post bodies are
 * applications. The value is usually somewhere else:
 *
 *   1. Quoted opening posts. Applicants quote the OP when they reply, so the
 *      thread carries dated snapshots of a header that was edited in place and
 *      otherwise survives only in its final state. Distinct snapshots are
 *      grouped, so a changed roster or recruitment bar shows up as a new group
 *      with the date it changed between.
 *   2. Post timestamps. Per-page date spans give an activity curve, and the
 *      last post dates the guild's last recorded sign of life.
 *   3. Names. Authors, @mentions and officer language identify who spoke, which
 *      is what turns a quote elsewhere in the corpus from third-party
 *      observation into insider testimony.
 *
 * Applications also carry real-world personal details — Skype handles,
 * countries, ages, real names. Those are never published; this script reports
 * post numbers and dates so the archive can be read directly.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'data/wiki/sources/docs');

const args = process.argv.slice(2);
const thread = args.find((a) => !a.startsWith('--'));
if (!thread) {
  console.error('usage: thread-yield.mjs <thread-number> [--posts] [--author NAME]');
  process.exit(1);
}
const showPosts = args.includes('--posts');
const authorFilter = args.includes('--author') ? args[args.indexOf('--author') + 1] : null;

const files = fs
  .readdirSync(DOCS)
  .filter((f) => new RegExp(`^thread-${thread}(-p\\d+)?\\.md$`).test(f))
  .sort((a, b) => {
    const n = (f) => Number((f.match(/-p(\d+)/) ?? [, '1'])[1]);
    return n(a) - n(b);
  });
if (!files.length) {
  console.error(`no archived pages for thread ${thread}`);
  process.exit(1);
}

/** Split a page into posts, separating each post's own words from what it quotes. */
function parse(file) {
  const txt = fs.readFileSync(path.join(DOCS, file), 'utf8');
  return txt
    .split('### post #')
    .slice(1)
    .map((chunk) => {
      const nl = chunk.indexOf('\n');
      const head = chunk.slice(0, nl);
      const rest = chunk.slice(nl + 1);
      const [num, who = '?', date = '?'] = head.split(' — ');
      // Everything after the last "Click to expand..." is the poster's own text;
      // everything before it was quoted from someone else.
      const cut = rest.lastIndexOf('Click to expand...');
      return {
        file,
        num: Number(num.replace('#', '').trim()),
        who: who.trim(),
        date: date.trim(),
        quoted: cut >= 0 ? rest.slice(0, cut) : '',
        own: (cut >= 0 ? rest.slice(cut + 'Click to expand...'.length) : rest).trim(),
      };
    });
}

const posts = files.flatMap(parse);
// Every guild invents its own application form, so match any of the field
// labels seen across the archive rather than one guild's template. Getting this
// wrong makes a thread of applications look like a thread of substance.
const APPLICATION = new RegExp(
  String.raw`(^|\n)?\s*(IGN|In-?game (Name|Username)|Minecraft [Uu]sername|` +
    String.raw`Highest Level+(ed)? Class|Timezone( and Country/Region)?|` +
    String.raw`Country or Timezone|What time ?zone are you in|Discord Tag|` +
    String.raw`What is your [Dd]iscord|How active are you|How often are you online|` +
    String.raw`Who invited you|Interesting Fact About Yourself|Age \(optional|` +
    String.raw`Will you help war|Would you like to participate in guild wars|` +
    String.raw`What guilds were you previously in|Why do you want to join|` +
    String.raw`Gender\(or preferred pronouns\))\s*[:?]`,
  'i',
);

console.log(`thread ${thread} — ${files.length} archived pages, ${posts.length} posts`);
console.log(`range: ${posts[0]?.date} → ${posts[posts.length - 1]?.date}\n`);

// ---- 1. distinct snapshots of the quoted opening post -----------------------
const opAuthor = posts[0]?.who;
const snaps = new Map();
for (const p of posts) {
  if (!p.quoted.includes(`${opAuthor} said:`)) continue;
  const body = p.quoted
    .replace(/\[image:[^\]]*\]/g, '')
    .replace(/&uarr;|&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (body.length < 200) continue; // a one-line quote is not the OP
  const key = body.slice(0, 1500);
  if (!snaps.has(key)) snaps.set(key, []);
  snaps.get(key).push(p);
}
console.log(`--- quoted opening post: ${snaps.size} distinct revision(s), ${
  [...snaps.values()].reduce((s, v) => s + v.length, 0)} quotation(s) ---`);
let r = 0;
for (const [body, ps] of snaps) {
  r++;
  const first = ps[0];
  const last = ps[ps.length - 1];
  console.log(`\n[rev ${r}] ${ps.length}x  ${first.date}  →  ${last.date}`);
  console.log(`   posts: ${ps.map((p) => '#' + p.num).join(' ')}`);
  console.log(`   ${body.slice(0, 400)}`);
}

// ---- 2. activity curve ------------------------------------------------------
console.log('\n--- activity by page ---');
for (const f of files) {
  const ps = posts.filter((p) => p.file === f);
  if (!ps.length) continue;
  const apps = ps.filter((p) => APPLICATION.test(p.own)).length;
  console.log(
    `${f.replace(`thread-${thread}`, '').replace('.md', '').padEnd(6) || '  p01'} ` +
      `${String(ps.length).padStart(3)} posts  ${String(apps).padStart(3)} apps  ` +
      `${ps[0].date}  →  ${ps[ps.length - 1].date}`,
  );
}

// ---- 3. who spoke -----------------------------------------------------------
const byAuthor = {};
for (const p of posts) byAuthor[p.who] = (byAuthor[p.who] ?? 0) + 1;
console.log('\n--- most frequent posters ---');
for (const [who, n] of Object.entries(byAuthor).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`${String(n).padStart(4)}  ${who}`);
}
const mentions = {};
for (const p of posts) for (const m of p.own.matchAll(/@([A-Za-z0-9_]{3,})/g)) {
  mentions[m[1]] = (mentions[m[1]] ?? 0) + 1;
}
console.log('\n--- @mentioned (officers get pinged) ---');
for (const [who, n] of Object.entries(mentions).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`${String(n).padStart(4)}  ${who}`);
}

// ---- 4. posts that are not applications -------------------------------------
const substantive = posts.filter(
  (p) => p.own.length > 40 && !APPLICATION.test(p.own) && (!authorFilter || p.who === authorFilter),
);
console.log(`\n--- ${substantive.length} non-application post(s) over 40 chars${
  authorFilter ? ` by ${authorFilter}` : ''} ---`);
if (showPosts) {
  for (const p of substantive) {
    console.log(`\n[${p.file}] #${p.num} — ${p.who} — ${p.date}`);
    console.log('   ' + p.own.replace(/\s+/g, ' ').slice(0, 500));
  }
} else {
  console.log('(re-run with --posts to print them)');
}
