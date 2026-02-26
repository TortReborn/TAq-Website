#!/usr/bin/env npx tsx
/**
 * Find all territory pairs with significant coordinate overlap.
 * Classifies each pair by era (old/new/both) to identify problematic same-era overlaps.
 *
 * Usage: npx tsx scripts/find_overlaps.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TERRITORY_TO_ABBREV, OLD_TERRITORY_NAMES } from "../lib/territory-abbreviations.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Derive era sets from the canonical source (territory-abbreviations.ts)
const NEW_TERRITORIES = new Set(Object.keys(TERRITORY_TO_ABBREV));

// Load territories_verbose.json
const territoriesPath = path.join(__dirname, "..", "public", "territories_verbose.json");
const territories: Record<string, { Location?: { start: [number, number]; end: [number, number] } }> =
  JSON.parse(fs.readFileSync(territoriesPath, "utf8"));

// ---- PARSE TERRITORY COORDINATES ----
interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const terrCoords: Record<string, Rect> = {};
for (const [name, data] of Object.entries(territories)) {
  if (data.Location?.start && data.Location?.end) {
    const [x1, z1] = data.Location.start;
    const [x2, z2] = data.Location.end;
    terrCoords[name] = {
      minX: Math.min(x1, x2),
      maxX: Math.max(x1, x2),
      minZ: Math.min(z1, z2),
      maxZ: Math.max(z1, z2),
    };
  }
}

// ---- COMPUTE OVERLAPS ----
function rectArea(r: Rect): number {
  return (r.maxX - r.minX) * (r.maxZ - r.minZ);
}

function overlapArea(a: Rect, b: Rect): number {
  const overlapX = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const overlapZ = Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));
  return overlapX * overlapZ;
}

/** Jaccard index: intersection / union */
function jaccard(a: Rect, b: Rect): number {
  const intersection = overlapArea(a, b);
  if (intersection === 0) return 0;
  const union = rectArea(a) + rectArea(b) - intersection;
  return union > 0 ? intersection / union : 0;
}

type Era = "new" | "old" | "both" | "unknown";

function classifyEra(name: string): Era {
  const isNew = NEW_TERRITORIES.has(name);
  const isOld = OLD_TERRITORY_NAMES.has(name);
  if (isNew && isOld) return "both";
  if (isNew) return "new";
  if (isOld) return "old";
  return "unknown";
}

interface OverlapEntry {
  a: string;
  b: string;
  overlapPct: string;
  jaccard: string;
  areaA: number;
  areaB: number;
  overlapAreaVal: number;
  eraA: Era;
  eraB: Era;
  pairType: string;
}

const names = Object.keys(terrCoords);
const overlaps: OverlapEntry[] = [];

for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const a = terrCoords[names[i]];
    const b = terrCoords[names[j]];
    const ov = overlapArea(a, b);
    if (ov === 0) continue;

    const areaA = rectArea(a);
    const areaB = rectArea(b);
    const smallerArea = Math.min(areaA, areaB);
    const overlapPct = ov / smallerArea;
    const jaccardIdx = jaccard(a, b);

    if (overlapPct > 0.2) {
      const eraA = classifyEra(names[i]);
      const eraB = classifyEra(names[j]);

      let pairType: string;
      if ((eraA === "old" && eraB === "new") || (eraA === "new" && eraB === "old")) {
        pairType = "OLD+NEW (safe - era system handles)";
      } else if (eraA === "old" && eraB === "old") {
        pairType = "BOTH OLD (coexist pre-Rekindled)";
      } else if (eraA === "new" && eraB === "new") {
        pairType = "BOTH NEW (coexist post-Rekindled) *** PROBLEMATIC ***";
      } else if (eraA === "both" || eraB === "both") {
        pairType = `MIXED (${eraA}+${eraB}) - needs analysis`;
      } else {
        pairType = `UNKNOWN (${eraA}+${eraB})`;
      }

      overlaps.push({
        a: names[i],
        b: names[j],
        overlapPct: (overlapPct * 100).toFixed(1),
        jaccard: (jaccardIdx * 100).toFixed(1),
        areaA,
        areaB,
        overlapAreaVal: ov,
        eraA,
        eraB,
        pairType,
      });
    }
  }
}

// Sort by pair type (problematic first), then overlap %
overlaps.sort((a, b) => {
  if (a.pairType.includes("PROBLEMATIC") && !b.pairType.includes("PROBLEMATIC")) return -1;
  if (!a.pairType.includes("PROBLEMATIC") && b.pairType.includes("PROBLEMATIC")) return 1;
  if (a.pairType.includes("BOTH OLD") && !b.pairType.includes("BOTH OLD")) return -1;
  if (!a.pairType.includes("BOTH OLD") && b.pairType.includes("BOTH OLD")) return 1;
  return parseFloat(b.overlapPct) - parseFloat(a.overlapPct);
});

// ---- OUTPUT ----
console.log(`\n=== TERRITORY OVERLAP ANALYSIS ===`);
console.log(`Total territories with coordinates: ${names.length}`);
console.log(`Total significant overlapping pairs (>20% of smaller): ${overlaps.length}\n`);

// Count by type
const typeCounts: Record<string, number> = {};
overlaps.forEach((o) => {
  typeCounts[o.pairType] = (typeCounts[o.pairType] || 0) + 1;
});
console.log(`--- BY CATEGORY ---`);
for (const [type, count] of Object.entries(typeCounts)) {
  console.log(`  ${type}: ${count}`);
}

// Problematic pairs (BOTH NEW)
const problematic = overlaps.filter((o) => o.pairType.includes("PROBLEMATIC"));
if (problematic.length > 0) {
  console.log(`\n\n========================================`);
  console.log(`=== PROBLEMATIC: BOTH-NEW OVERLAPS ===`);
  console.log(`========================================`);
  console.log(`These ${problematic.length} pairs both exist post-Rekindled and overlap significantly.`);
  console.log(`The era system does NOT fix these.\n`);
  problematic.forEach((o, i) => {
    console.log(`${i + 1}. "${o.a}" <-> "${o.b}"`);
    console.log(`   Overlap: ${o.overlapPct}% of smaller | Jaccard: ${o.jaccard}%`);
    console.log(`   Areas: ${o.areaA} vs ${o.areaB}, overlap: ${o.overlapAreaVal}`);
  });
}

// Both-old pairs
const bothOld = overlaps.filter((o) => o.pairType.includes("BOTH OLD"));
if (bothOld.length > 0) {
  console.log(`\n\n=======================================`);
  console.log(`=== BOTH-OLD OVERLAPS (pre-Rekindled) ===`);
  console.log(`=======================================`);
  console.log(`These ${bothOld.length} pairs both existed pre-Rekindled and overlap significantly.`);
  console.log(`They coexisted at the same time, so these could be problematic for pre-Rekindled display.\n`);
  bothOld.forEach((o, i) => {
    console.log(`${i + 1}. "${o.a}" <-> "${o.b}"`);
    console.log(`   Overlap: ${o.overlapPct}% of smaller | Jaccard: ${o.jaccard}%`);
    console.log(`   Areas: ${o.areaA} vs ${o.areaB}, overlap: ${o.overlapAreaVal}`);
  });
}

// Safe old+new pairs
const safeCount = overlaps.filter((o) => o.pairType.includes("safe")).length;
console.log(`\n\n--- SAFE: OLD+NEW pairs (era system handles): ${safeCount} ---`);

// Unknown / mixed
const mixed = overlaps.filter((o) => o.pairType.includes("UNKNOWN") || o.pairType.includes("MIXED"));
if (mixed.length > 0) {
  console.log(`\n\n=== UNCLASSIFIED/MIXED OVERLAPS ===`);
  mixed.forEach((o, i) => {
    console.log(`${i + 1}. "${o.a}" (${o.eraA}) <-> "${o.b}" (${o.eraB})`);
    console.log(`   Overlap: ${o.overlapPct}% of smaller | Jaccard: ${o.jaccard}%`);
  });
}
