#!/usr/bin/env node
// Copies the card definitions the Discord bot rolls from (Tort-Reborn
// data/cards.json + data/card_sets.json) into data/duel/cards.json, which is
// what the website's duel engine builds its battle stats from. The bot owns
// the card list; this file is a vendored copy, never edited by hand.
//
//   node scripts/sync-duel-cards.mjs            rewrite data/duel/cards.json
//   node scripts/sync-duel-cards.mjs --check    exit 1 if the copy is stale
//
// The bot checkout defaults to ../Tort-Reborn; override with BOT_REPO.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const botRepo = path.resolve(root, process.env.BOT_REPO || '../Tort-Reborn');
const outFile = path.join(root, 'data', 'duel', 'cards.json');
const check = process.argv.includes('--check');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const cardsFile = path.join(botRepo, 'data', 'cards.json');
const setsFile = path.join(botRepo, 'data', 'card_sets.json');
if (!fs.existsSync(cardsFile) || !fs.existsSync(setsFile)) {
  console.error(`Bot card data not found under ${botRepo} (set BOT_REPO).`);
  process.exit(2);
}

const cards = readJson(cardsFile);
const sets = readJson(setsFile);

// Only the fields the duel engine and the card face use. `lines` (wiki
// dialogue count) is how the bot ranks tiers; it has no meaning in battle.
const KEEP = ['slug', 'name', 'tier', 'image_url', 'wiki_url', 'raid', 'dungeon', 'altar', 'level'];
const out = {
  source: 'Tort-Reborn data/cards.json + data/card_sets.json (scripts/sync-duel-cards.mjs)',
  generated_at: cards.generated_at,
  cards: cards.cards
    .map(c => Object.fromEntries(KEEP.filter(k => c[k] !== undefined && c[k] !== '').map(k => [k, c[k]])))
    .sort((a, b) => a.slug.localeCompare(b.slug)),
  sets: sets.sets.map(s => ({ id: s.id, name: s.name, slugs: s.slugs })),
};
const text = JSON.stringify(out, null, 1) + '\n';

if (check) {
  const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  if (current !== text) {
    console.error('data/duel/cards.json is out of date with the bot. Run: node scripts/sync-duel-cards.mjs');
    process.exit(1);
  }
  console.log(`data/duel/cards.json matches the bot (${out.cards.length} cards).`);
} else {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, text);
  console.log(`Wrote ${out.cards.length} cards and ${out.sets.length} sets to data/duel/cards.json`);
}
