#!/usr/bin/env node
/**
 * Record the timestamp offset in every archived Discord export.
 *
 *   node scripts/stamp-discord-offset.mjs [--check]
 *
 * These documents are served at /chronicle/references/<id> with their original
 * timestamps, which come from the export tool and carry UTC-07:00 — the offset
 * of the machine the export was made on, not of any participant. Roughly thirty
 * per cent of them fall after 17:00 and therefore sit on a different day in UTC
 * than they display.
 *
 * The corpus dates Discord material by this clock and capture-log figures by
 * UTC, and says which in the citation locator. That is a defensible convention
 * and an indefensible secret: a reader comparing an announcement here against a
 * forum thread needs to know the two are not on the same clock. So the offset
 * goes in the document a reader actually opens.
 *
 * --check exits non-zero if any export is missing the line, so the note cannot
 * be lost the next time a document is regenerated.
 */
import fs from 'fs';
import path from 'path';

const LINE = 'timestamps: "Displayed in the export tool\'s local clock, UTC-07:00. Times after 17:00 fall on the following day in UTC. Capture-log figures elsewhere in this corpus are UTC."';
const check = process.argv.includes('--check');

const index = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/wiki/sources/index.json'), 'utf8')).sources;
const exports_ = Object.entries(index).filter(([, v]) => v.kind === 'discord-export').map(([k]) => k);

let changed = 0;
const missing = [];
for (const id of exports_) {
  const p = path.join(process.cwd(), 'data/wiki/sources/docs', id + '.md');
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');
  if (text.includes('timestamps: "Displayed in the export')) continue;
  if (check) { missing.push(id); continue; }
  // Some documents were written with CRLF endings; keep whatever the file uses.
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) { console.error('no front matter: ' + id); process.exitCode = 1; continue; }
  const eol = m[0].includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(p, text.replace(m[0], '---' + eol + m[1] + eol + LINE + eol + '---' + eol));
  changed++;
}

if (check) {
  if (missing.length) {
    console.error(missing.length + ' discord export(s) without the offset note: ' + missing.join(', '));
    process.exit(1);
  }
  console.log(exports_.length + ' discord exports, all carry the offset note.');
} else {
  console.log(changed + ' of ' + exports_.length + ' discord exports stamped.');
}
