/**
 * Deduplicate the 2018-2021 Discord war-log CSV export.
 *
 * Usage:
 *   node scripts/dedup-war-log.js [input-csv] [output-csv]
 *
 * Defaults:
 *   input:  C:\Users\Aiden\OneDrive\Current\Downloads\War Log - ...\2018-2021-wars.csv
 *   output: <same dir>\2018-2021-wars-deduped.csv
 *
 * What it does:
 *   1. Keeps only WynnBot rows whose Content matches a territory exchange pattern
 *   2. Deduplicates: if the same Content string appears within 60 seconds of
 *      the previous occurrence of that same Content, the later entry is dropped.
 *   3. Writes a clean CSV with the same columns.
 */

import fs from 'fs';
import readline from 'readline';
import path from 'path';

// ---------------------------------------------------------------------------
// CSV parser (handles double-quoted fields)
// ---------------------------------------------------------------------------
function parseCSVLine(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const DEFAULT_INPUT = String.raw`C:\Users\Aiden\OneDrive\Current\Downloads\War Log - 🌟Wynncraft - old-war-log [398199212581322752]\2018-2021-wars.csv`;

const inputPath = process.argv[2] || DEFAULT_INPUT;
const outputPath = process.argv[3]
  || path.join(path.dirname(inputPath), '2018-2021-wars-deduped.csv');

console.log(`Input:  ${inputPath}`);
console.log(`Output: ${outputPath}`);

const rl = readline.createInterface({
  input: fs.createReadStream(inputPath),
  crlfDelay: Infinity,
});

// Pattern: "Territory Name: ~~Defender~~ -> **Attacker**"
const EXCHANGE_RE = /^.+: ~~.+~~ -> \*\*.+\*\*$/;

const out = fs.createWriteStream(outputPath);
let isHeader = true;
let totalRows = 0;
let keptRows = 0;
let skippedNonBot = 0;
let skippedNonExchange = 0;
let skippedDupe = 0;

// Track the last-seen timestamp for each Content string
const lastSeen = new Map();

for await (const line of rl) {
  if (isHeader) {
    out.write(line + '\n');
    isHeader = false;
    continue;
  }
  if (!line.trim()) continue;

  totalRows++;
  const parts = parseCSVLine(line);
  if (parts.length < 4) continue;

  const [/* authorId */, author, dateStr, content] = parts;

  // 1. Only keep WynnBot messages
  if (!author.startsWith('WynnBot')) {
    skippedNonBot++;
    continue;
  }

  // 2. Only keep territory exchange messages
  if (!EXCHANGE_RE.test(content)) {
    skippedNonExchange++;
    continue;
  }

  // 3. Parse timestamp
  const ts = new Date(dateStr).getTime();
  if (isNaN(ts)) {
    console.warn(`  [skip] Bad date on row ${totalRows + 1}: ${dateStr}`);
    continue;
  }

  // 4. Dedup: same Content within 60 seconds of last occurrence → skip
  const prev = lastSeen.get(content);
  if (prev !== undefined && (ts - prev) < 60_000) {
    skippedDupe++;
    continue;
  }

  lastSeen.set(content, ts);
  out.write(line + '\n');
  keptRows++;

  if (keptRows % 100_000 === 0) {
    console.log(`  ${keptRows.toLocaleString()} kept / ${totalRows.toLocaleString()} processed...`);
  }
}

out.end();

console.log(`\nDone.`);
console.log(`  Total data rows:      ${totalRows.toLocaleString()}`);
console.log(`  Skipped (non-bot):    ${skippedNonBot.toLocaleString()}`);
console.log(`  Skipped (non-exchange): ${skippedNonExchange.toLocaleString()}`);
console.log(`  Skipped (duplicate):  ${skippedDupe.toLocaleString()}`);
console.log(`  Kept:                 ${keptRows.toLocaleString()}`);
console.log(`  Output: ${outputPath}`);
