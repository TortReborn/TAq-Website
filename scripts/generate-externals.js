/**
 * Script to generate territory_externals.json
 * This precomputes the potential external territories for each territory
 * Externals are territories at depth 2-3 from the HQ (depth 1 connections don't count)
 * Pattern: HQ -> conn (NOT ext) -> ext -> ext -> no effect
 *
 * Only territories present in the live Wynncraft snapshot are included.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read territories verbose data
const verbosePath = path.join(__dirname, '../public/territories_verbose.json');
const verboseData = JSON.parse(fs.readFileSync(verbosePath, 'utf8'));

// Fetch live territory list from the Wynncraft API
console.log('Fetching live territory snapshot from Wynncraft API...');
const response = await fetch('https://beta-api.wynncraft.com/v3/guild/list/territory');
if (!response.ok) {
  throw new Error(`Failed to fetch live territories: ${response.status} ${response.statusText}`);
}
const liveSnapshot = await response.json();
const liveTerritoryNames = new Set(Object.keys(liveSnapshot));

console.log(`Live snapshot contains ${liveTerritoryNames.size} territories.`);

/**
 * Get all territories at depth 2-3 from a given territory (potential externals)
 * These are the territories that would count as externals if the territory was an HQ.
 * BFS traversal is restricted to live territories only.
 */
function getExternals(territoryName, maxDepth = 3) {
  const visited = new Set();
  const queue = [{ name: territoryName, depth: 0 }];
  const externals = [];

  const getTradingRoutes = (name) => {
    const territory = verboseData[name];
    if (territory && territory["Trading Routes"]) {
      // Only follow routes to territories that exist in the live snapshot
      return territory["Trading Routes"].filter(r => liveTerritoryNames.has(r));
    }
    return [];
  };

  while (queue.length > 0) {
    const current = queue.shift();

    if (visited.has(current.name)) continue;
    visited.add(current.name);

    // Count as potential external if depth >= 2 (not the territory itself or direct connections)
    if (current.name !== territoryName && current.depth >= 2) {
      externals.push(current.name);
    }

    // Continue BFS if we haven't reached max depth
    if (current.depth < maxDepth) {
      const tradingRoutes = getTradingRoutes(current.name);
      for (const connectedName of tradingRoutes) {
        if (!visited.has(connectedName)) {
          queue.push({ name: connectedName, depth: current.depth + 1 });
        }
      }
    }
  }

  return externals;
}

// Generate externals only for live territories
const result = {};
const territoryNames = [...liveTerritoryNames].filter(name => verboseData[name]);

console.log(`Processing ${territoryNames.length} live territories...`);

for (const name of territoryNames) {
  const externals = getExternals(name);
  result[name] = externals;
}

// Write the result
const outputPath = path.join(__dirname, '../public/territory_externals.json');
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

console.log(`Generated ${outputPath}`);
console.log(`Total territories: ${territoryNames.length}`);

// Print some stats
const avgExternals = territoryNames.reduce((sum, name) => sum + result[name].length, 0) / territoryNames.length;
console.log(`Average externals per territory: ${avgExternals.toFixed(2)}`);
