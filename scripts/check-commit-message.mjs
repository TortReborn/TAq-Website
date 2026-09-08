#!/usr/bin/env node
/**
 * Boundary check for a commit message, before it is written.
 *
 *   node scripts/check-commit-message.mjs --text "$MSG"
 *
 * CLAUDE.md puts commit messages under the same rule as articles: no direct
 * quotes from the private tier, "not in prose, captions, infoboxes, commit
 * messages, or PR descriptions". Nothing was enforcing that half. This repo is
 * public on GitHub, and a session's commit prose describing private findings is
 * a large unscanned surface — 6,000 words in a day, on one occasion.
 *
 * What this can check locally is quotation. It cannot tell a lifted phrase from
 * a paraphrase, because the archive it would have to compare against is the one
 * thing this session must never read; that check belongs to the research side,
 * which holds the corpus and a verbatim scanner.
 *
 * So this flags every substantial quotation for a human decision, and passes
 * only when each one is from a public source. Quoting an announcement channel,
 * a forum thread or the article's own earlier wording is fine. Quoting a
 * private finding is not, however well it reads.
 */

const MIN = 15;
const QUOTED = /["“]([^"”]{15,})["”]/g;

const idx = process.argv.indexOf('--text');
if (idx === -1) {
  console.error('usage: check-commit-message.mjs --text "<message>"');
  process.exit(2);
}

const text = process.argv[idx + 1] ?? '';
const hits = [...text.matchAll(QUOTED)].map((m) => m[1]);

if (!hits.length) {
  console.log('no quotations of 15+ characters; nothing to adjudicate.');
  process.exit(0);
}

console.log(`${hits.length} quotation(s) of ${MIN}+ characters — each must come from a public source:`);
for (const h of hits) console.log('  · ' + (h.length > 100 ? h.slice(0, 100) + '…' : h));
console.log('\nPublic: announcement channels, forum threads, published documents, this');
console.log('corpus\'s own earlier wording. Not public: anything a private finding said.');
console.log('If any line above came from a finding rather than a source, rewrite it.');
process.exit(1);
