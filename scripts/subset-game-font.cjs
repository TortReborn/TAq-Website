/**
 * Regenerates public/images/profile/game.subset.woff2 — the 5KB
 * Latin+punctuation subset of the 14MB game.ttf that the site actually
 * loads (see the GameFont @font-face in app/globals.css).
 *
 * Run after replacing game.ttf:  node scripts/subset-game-font.cjs
 */
const subsetFont = require('subset-font');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../public/images/profile/game.ttf');
const OUT = path.join(__dirname, '../public/images/profile/game.subset.woff2');

// ASCII, Latin-1 supplement, general punctuation (dashes, quotes, bullet,
// ellipsis), and arrows — anything rarer falls back to Roboto
let text = '';
const addRange = (a, b) => { for (let c = a; c <= b; c++) text += String.fromCodePoint(c); };
addRange(0x0020, 0x007e);
addRange(0x00a0, 0x00ff);
addRange(0x2013, 0x2026);
addRange(0x2190, 0x2193);

(async () => {
  const buf = fs.readFileSync(SRC);
  const out = await subsetFont(buf, text, { targetFormat: 'woff2' });
  fs.writeFileSync(OUT, out);
  console.log('source:', Math.round(buf.length / 1024), 'KB → subset:', Math.round(out.length / 1024), 'KB');
})().catch(e => { console.error(e.message); process.exit(1); });
