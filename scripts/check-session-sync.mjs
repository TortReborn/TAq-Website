#!/usr/bin/env node
/**
 * Compare the state this session assumes it shares with the research session
 * against the state actually on disk.
 *
 *   node scripts/check-session-sync.mjs [--strict]
 *
 * Three things went wrong in one day, and they were the same thing three times:
 *
 *  - The mailbox watcher died with a previous session and was never re-armed.
 *    Four replies sat unread for hours while both sides concluded the other had
 *    stopped working.
 *  - Sixteen promoted findings had no registered private source here, so any
 *    citation to them would have failed at publish time — discovered by
 *    accident while writing an unrelated patch.
 *  - A claim about the two capture datasets agreeing was verified once, over a
 *    fortnight, and then believed for months across both sides.
 *
 * Each was a state both sessions assumed was shared and nothing compared. None
 * would have survived one command. This is that command.
 *
 * It deliberately reports rather than fixes: an unregistered finding might be a
 * draft nobody wants published yet, and registering it automatically would make
 * that decision silently. The point is to be told.
 */
import fs from 'fs';
import path from 'path';

const strict = process.argv.includes('--strict');
const ROOT = process.cwd();
const FINDINGS = path.join(ROOT, 'docs/discord-findings');
const MAILBOX = path.join(FINDINGS, '_mailbox');
const INDEX = path.join(ROOT, 'data/wiki/sources/index.json');

let problems = 0;
const say = (ok, line) => { if (!ok) problems++; console.log(`${ok ? '  ok  ' : ' DIFF '} ${line}`); };

if (!fs.existsSync(FINDINGS)) {
  console.log('No findings directory — nothing to reconcile.');
  process.exit(0);
}

// ---- findings on disk vs private sources registered here --------------------
const sources = JSON.parse(fs.readFileSync(INDEX, 'utf8')).sources;
const findings = fs.readdirSync(FINDINGS)
  // "_" marks a fixture; "." marks machine-local state, including this check's
  // own record of what it last saw. Counting that as a finding made the tool
  // report itself as a divergence, which is the self-inflicted noise that gets a
  // check switched off.
  .filter(f => f.endsWith('.json') && !f.startsWith('_') && !f.startsWith('.'))
  .map(f => f.replace(/\.json$/, ''));
const unregistered = findings.filter(f => !sources[`${f}-discord-private`]);
say(unregistered.length === 0,
  `${findings.length} findings, ${findings.length - unregistered.length} registered`
  + (unregistered.length ? ` — ${unregistered.length} with no private source: ${unregistered.slice(0, 8).join(', ')}${unregistered.length > 8 ? ', …' : ''}` : ''));

// A registered private source need not have a findings file: a whole archived
// channel can be registered as provenance in its own right, which is what
// `terra-alliance-announcements` is. So this is reported and never counted as a
// divergence — a check that cries about correct practice gets switched off.
const orphaned = Object.keys(sources)
  .filter(id => id.endsWith('-discord-private'))
  .map(id => id.replace(/-discord-private$/, ''))
  .filter(slug => !findings.includes(slug));
// Two very different things look identical here, and lumping them together is
// how the dangerous one hides. A source registered for a whole archived channel
// has no findings file and never will — correct practice. A source registered
// for a finding that was later *withdrawn* also has no findings file, and any
// article citing it now rests on support that no longer exists.
//
// Nothing in either registry distinguishes them, because neither records why a
// source was created. Disappearance does: a findings file present at the last
// run and absent at this one is a withdrawal, whatever the source's title says.
// So this keeps a small local record of what it saw, which is the only way to
// observe a change across sessions — the same lesson as the dead watcher.
const STATE = path.join(FINDINGS, '.sync-last-seen.json');
let lastSeen = [];
try { lastSeen = JSON.parse(fs.readFileSync(STATE, 'utf8')).findings ?? []; } catch { /* first run */ }
const withdrawn = lastSeen.filter(slug => !findings.includes(slug));
const benign = orphaned.filter(slug => !withdrawn.includes(slug));

console.log(`  --   ${benign.length} private source(s) registered without a findings file`
  + (benign.length ? ` (channel-level provenance, expected): ${benign.join(', ')}` : ''));

if (lastSeen.length === 0) {
  console.log('  --   no previous run recorded — withdrawal detection starts from this one');
}
say(withdrawn.length === 0,
  `${withdrawn.length} finding(s) withdrawn since the last run`
  + (withdrawn.length ? `: ${withdrawn.join(', ')} — check whether any article still cites them` : ''));

try {
  fs.writeFileSync(STATE, JSON.stringify({ at: new Date().toISOString(), findings }, null, 2));
} catch {
  // A read-only checkout should still be able to run the check.
}

// ---- fixtures that read as findings -----------------------------------------
// Files prefixed with "_" are excluded from promotion, and every tool here skips
// them. That protects the corpus and not the writer: `_guardtest2.json` has an
// id, a provenance note, machine and human review blocks and a claim, so anyone
// who opens it while browsing has no way to tell it is a test. Its private
// source id is unregistered, so a citation would fail at check time — the work
// would be wasted rather than published, which is the cheaper failure but still
// a failure. Naming them here is what stops someone rediscovering it.
const fixtures = fs.readdirSync(FINDINGS)
  .filter(f => f.startsWith('_') && f.endsWith('.json'))
  .filter(f => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(FINDINGS, f), 'utf8'));
      return Boolean(j.privateSourceId || j.claims || j.prose);
    } catch { return false; }
  });
console.log(`  --   ${fixtures.length} finding-shaped fixture(s) excluded from promotion`
  + (fixtures.length ? `: ${fixtures.join(', ')} — never cite these` : ''));

// ---- the mailbox ------------------------------------------------------------
// A watcher that dies takes the inbox with it silently, so the unread count is
// the thing to check on every restart rather than the watcher's own health.
const inbox = path.join(MAILBOX, 'to-wiki');
if (fs.existsSync(inbox)) {
  const seenFile = path.join(MAILBOX, '.seen-to-wiki');
  const seen = new Set(fs.existsSync(seenFile)
    ? fs.readFileSync(seenFile, 'utf8').split(/\r?\n/).filter(Boolean)
    : []);
  const unread = fs.readdirSync(inbox).filter(f => f.endsWith('.md') && !seen.has(f));
  say(unread.length === 0,
    `${unread.length} unread message(s) in to-wiki`
    + (unread.length ? `: ${unread.join(', ')}` : ''));
} else {
  say(true, 'no to-wiki inbox on this machine');
}

// ---- citations pointing at nothing -----------------------------------------
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wiki/seed-articles.json'), 'utf8'));
const cited = new Set();
for (const a of seed.articles) {
  for (const m of (a.body || '').matchAll(/\{\{cite:([a-z0-9-]+)-discord-private\|/g)) cited.add(m[1]);
}
// Cited, registered, but with neither a findings file nor a channel-level
// registration is the case that matters: a claim resting on something withdrawn.
const citedButGone = [...cited]
  .filter(slug => !findings.includes(slug) && !orphaned.includes(slug));
say(citedButGone.length === 0,
  `${cited.size} finding(s) cited by articles`
  + (citedButGone.length ? ` — ${citedButGone.length} resting on a withdrawn finding: ${citedButGone.join(', ')}` : ''));

const promotedUncited = findings.filter(f => !cited.has(f));
console.log(`  --   ${promotedUncited.length} promoted finding(s) not yet cited anywhere (work queue, not a fault)`);

console.log('');
if (problems === 0) {
  console.log('Both sides agree on everything this can see.');
  process.exit(0);
}
console.log(`${problems} divergence(s). None of these break a build — that is why they need asking for.`);
process.exit(strict ? 1 : 0);
