#!/usr/bin/env node
/**
 * Record, in each archived Discord export, which of its messages were revised
 * after posting and when.
 *
 *   node scripts/stamp-document-edits.mjs [--check]
 *
 * Discord exports preserve only a message's final text. Of 1,181
 * announcement-tier messages in the archive, 186 carry an edit timestamp and 41
 * were edited on a later calendar day — and the pattern is not random. Nobody
 * revises a one-off announcement months later; every long-gap edit is a standing
 * document: a rules card, an alliance-information panel, a welcome message, a
 * roster. Those are exactly the documents an article most wants to treat as a
 * dated snapshot, and exactly the ones that are not.
 *
 * A retraction has already been paid for this: a claim that an alliance's
 * relations list put a guild in the wrong column, where the list had been edited
 * sixty-five days after posting and the "error" was the edit.
 *
 * These pages are served at /chronicle/references/<id> with their timestamps and
 * nothing to say any of them are revisions. This puts that in the document a
 * reader opens. Dates come from the research session's audit of the export
 * metadata; the slices it searches do not carry the field, so it read the
 * exports directly.
 */
import fs from 'fs';
import path from 'path';

// Later-day edits only. Same-day revisions are noise for this purpose.
const EDITS = {
  'federation-alliance-announcements': ['24 Mar 2018 → 27 Mar 2018', '22 Apr 2018 → 27 Apr 2018', '8 Sep 2018 → 11 Sep 2018', '10 Sep 2018 → 11 Sep 2018'],
  'federation-public-announcements': ['8 Sep 2018 → 11 Sep 2018', '20 Sep 2018 → 26 Sep 2018 (pinned)', '12 Oct 2018 → 2 Nov 2018'],
  'coalition-announcements': ['16 Jan 2018 → 20 Jan 2018', '23 Jan 2018 → 28 Jan 2018'],
  'coalition-information': ['11 Jan 2018 → 14 Feb 2018'],
  'holders-of-le-announcements': ['24 Mar 2018 → 9 Apr 2018 (pinned)', '5 Apr 2018 → 6 Apr 2018', '5 Jul 2018 → 6 Jul 2018'],
  'emperium-announcements': ['18 Apr 2017 → 28 Apr 2017', '26 Apr 2017 → 27 Apr 2017', '26 May 2017 → 1 Jun 2017', '27 Aug 2017 → 28 Aug 2017 (two messages)'],
  'emperium-info': ['21 Sep 2017 → 27 Sep 2017 (two cards)', '26 Sep 2017 → 8 Oct 2017'],
  'emperium-voting': ['5 Sep 2017 → 6 Sep 2017'],
};

const NOTE = (list) =>
  'edits: "This export holds each message\'s final text, not the text as posted. ' +
  'Messages revised on a later day: ' + list.join('; ') + '. ' +
  'For those, the contents are evidence of what the document said on the edit date, ' +
  'and of the posting date only by inference — most are standing documents such as rosters, ' +
  'rules cards or territory lists, kept current rather than rewritten in response to events."';

const check = process.argv.includes('--check');
const DOCS = path.join(process.cwd(), 'data/wiki/sources/docs');
let changed = 0;
const missing = [];

for (const [id, list] of Object.entries(EDITS)) {
  const p = path.join(DOCS, id + '.md');
  if (!fs.existsSync(p)) { console.error('no such document: ' + id); process.exitCode = 1; continue; }
  const text = fs.readFileSync(p, 'utf8');
  const line = NOTE(list);
  if (text.includes(line)) continue;
  if (check) { missing.push(id); continue; }
  const stripped = text.replace(/^edits: "[^"]*"\r?\n/m, '');
  const m = stripped.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) { console.error('no front matter: ' + id); process.exitCode = 1; continue; }
  const eol = m[0].includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(p, stripped.replace(m[0], '---' + eol + m[1] + eol + line + eol + '---' + eol));
  changed++;
}

if (check) {
  if (missing.length) {
    console.error(`${missing.length} document(s) missing their edit note: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(`${Object.keys(EDITS).length} documents with known later-day edits, all stamped.`);
} else {
  console.log(`${changed} of ${Object.keys(EDITS).length} documents stamped.`);
}
