#!/usr/bin/env node
// Diffs the mod's item names against the website catalog. Exits non-zero on mismatch.
//
// Usage:
//   node scripts/check-inventory-catalog-sync.js \
//     --base-url https://www.the-aquarium.com --token Woealer --mod-path ../taq-management-utils
//
// Flags fall back to env vars (CATALOG_BASE_URL, CATALOG_TOKEN, MOD_REPO_PATH).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = value;
    }
  }
  return args;
}

function normalizeInventoryName(value) {
  return value
    .normalize('NFKD')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

// Pulls the first string literal out of each enum constant, e.g. FAIRY_POT("Fairy Pot", ...) -> "Fairy Pot"
function extractEnumDisplayNames(source) {
  const names = [];
  const constantPattern = /^\s*[A-Z][A-Z0-9_]*\s*\(\s*"((?:[^"\\]|\\.)*)"/gm;
  let match;
  while ((match = constantPattern.exec(source)) !== null) {
    names.push(match[1].replace(/\\"/g, '"'));
  }
  return names;
}

async function readModDisplayNames(modPath) {
  const consumablePath = path.join(modPath, 'src/client/java/com/taq/managementutils/inventory/ConsumableType.java');
  const ingredientPath = path.join(modPath, 'src/client/java/com/taq/managementutils/inventory/IngredientType.java');
  const [consumableSource, ingredientSource] = await Promise.all([
    readFile(consumablePath, 'utf8'),
    readFile(ingredientPath, 'utf8'),
  ]);
  return {
    consumables: extractEnumDisplayNames(consumableSource),
    ingredients: extractEnumDisplayNames(ingredientSource),
  };
}

async function fetchCatalog(baseUrl, token) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/inventory/catalog?include=archived`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`Catalog fetch failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args['base-url'] || process.env.CATALOG_BASE_URL || 'https://www.the-aquarium.com';
  const token = args.token || process.env.CATALOG_TOKEN || 'Woealer';
  const modPath = path.resolve(args['mod-path'] || process.env.MOD_REPO_PATH || '../taq-management-utils');

  console.log(`Mod source:   ${modPath}`);
  console.log(`Catalog URL:  ${baseUrl}/api/inventory/catalog`);
  console.log('');

  const [modNames, catalog] = await Promise.all([
    readModDisplayNames(modPath),
    fetchCatalog(baseUrl, token),
  ]);

  const modDisplayNames = [...modNames.consumables, ...modNames.ingredients];
  const modNormalized = new Set(modDisplayNames.map(normalizeInventoryName));

  const indexByName = items => {
    const byNormalized = new Map();
    for (const item of items) {
      for (const candidate of [item.name, item.scanKey, ...(item.aliases ?? [])]) {
        if (candidate) byNormalized.set(normalizeInventoryName(candidate), item);
      }
    }
    return byNormalized;
  };
  const catalogAliasesByNormalized = indexByName(catalog.items ?? []);
  const archivedByNormalized = indexByName(catalog.archivedItems ?? []);

  const unmatched = modDisplayNames.filter(name => !catalogAliasesByNormalized.has(normalizeInventoryName(name)));
  const modArchived = unmatched.filter(name => archivedByNormalized.has(normalizeInventoryName(name)));
  const modOnly = unmatched.filter(name => !archivedByNormalized.has(normalizeInventoryName(name)));
  // Materials have no enum: MaterialClassifier builds "<hover name> T<tier>" at scan time, so
  // there's nothing static to diff them against.
  const catalogOnly = (catalog.items ?? [])
    .filter(item => item.kind !== 'material')
    .filter(item => !modNormalized.has(normalizeInventoryName(item.name)));

  if (modOnly.length === 0 && catalogOnly.length === 0) {
    console.log(`✓ ${modDisplayNames.length - modArchived.length} mod item names all match a website catalog entry.`);
    if (modArchived.length > 0) {
      console.log(`  (${modArchived.length} more match items archived on the website, which the mod skips by design.)`);
    }
    return;
  }

  if (modArchived.length > 0) {
    console.log(`· ${modArchived.length} mod item name(s) match items archived on the website (skipped by design):`);
    for (const name of modArchived) console.log(`  - "${name}"`);
    console.log('');
  }

  if (modOnly.length > 0) {
    console.log(`✗ ${modOnly.length} item(s) the mod scans for but the website won't match (upload silently drops these):`);
    for (const name of modOnly) console.log(`  - "${name}"`);
    console.log('  Fix: set that item\'s "Scanner name" (or add an alias) on /exec/inventory to this exact string.');
    console.log('');
  }

  if (catalogOnly.length > 0) {
    console.log(`! ${catalogOnly.length} website item(s) with no matching mod display name (fine if intentionally scan-less):`);
    for (const item of catalogOnly) console.log(`  - "${item.name}" (scanKey: "${item.scanKey}")`);
    console.log('');
  }

  process.exitCode = modOnly.length > 0 ? 1 : 0;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
