#!/usr/bin/env node
/**
 * Find all territory pairs with significant coordinate overlap.
 * Classifies each pair by era (old/new/both) to identify problematic same-era overlaps.
 */

const fs = require('fs');
const path = require('path');

// Load territories_verbose.json
const territoriesPath = path.join(__dirname, '..', 'public', 'territories_verbose.json');
const territories = JSON.parse(fs.readFileSync(territoriesPath, 'utf8'));

// ---- ERA CLASSIFICATION ----
// These are the NEW (post-Rekindled, current) territory names from TERRITORY_TO_ABBREV
// before the OLD ones are merged in.
const NEW_TERRITORIES = new Set([
  "Abandoned Farm","Abandoned Lumberyard","Abandoned Mines","Abandoned Mines Entrance",
  "Abandoned Pass","Accursed Dunes","Aerial Descent","Agricultural Sector","Ahmsord",
  "Ahmsord Outskirts","Akias Ruins","Alder Understory","Aldorei Cliffside Waterfalls",
  "Aldorei River","Aldorei Springs","Aldorei Valley","Aldorei Valley Outskirts","Aldwell",
  "Alekin","Almuj","Almuj Slums","Ancient Excavation","Ancient Nemract","Ancient Waterworks",
  "Angel Refuge","Apprentice Huts","Arachnid Woods","Astraulus' Tower","Ava's Workshop",
  "Avos Temple","Avos Territory","Azure Frontier",
  "Balloon Airbase","Bandit Cave","Bandit's Toll","Bantisu Air Temple","Bantisu Approach",
  "Barren Sands","Bear Zoo","Big Mushroom Cave","Bizarre Passage","Black Road",
  "Blackstring Den","Bloody Beach","Bloody Trail","Blooming Boulders","Bob's Tomb",
  "Bremminglar","Brigand Outpost","Broken Road","Bucie Waterfall","Burning Airship","Burning Farm",
  "Canyon Dropoff","Canyon High Path","Canyon Walkway","Citadel's Shadow","Contested District",
  "Caritat Mansion","Cascading Basins","Cascading Oasis","Castle Dullahan","Cathedral Harbour",
  "Celestial Impact","Centerworld Fortress","Central Islands","Chasm Chokepoint","Chasm Overlook",
  "Cherry Blossom Grove","Cinfras","Cinfras Outskirts","Cinfras's Small Farm",
  "Cliffhearth Orc Camp","Cliffside Passage North","Cliffside Passage South","Coastal Trail",
  "Collapsed Bridge","Collapsed Emerald Mine","Colourful Mountaintop","Corkus Castle",
  "Corkus City","Corkus City Crossroads","Corkus City Mine","Corkus Forest","Corkus Outskirts",
  "Corkus Sea Cove","Corrupted Orchard","Corrupted River","Corrupted Road","Corrupted Tower",
  "Corrupted Warfront","Cosmic Fissures","Crater Descent","Cyclospordial Hazard",
  "Deforested Ecotone","Dark Forest Village","Decayed Basin","Delnar Manor","Derelict Mansion",
  "Desolate Valley","Detlas","Detlas Suburbs","Displaced Housing","Disturbed Crypt",
  "Dodegar's Forge","Dogun Ritual Site","Dragonbone Graveyard","Dragonling Nests","Dreary Docks",
  "Dujgon Nation","Durum Barley Islet","Durum Isles Barn","Durum Malt Islet","Durum Oat Islet",
  "Dusty Pit",
  "Eagle Tribe","Efilim","Efilim Crossroads","Elefolk Stomping Grounds","Elephelk Trail",
  "Elkurn","Eltom","Emerald Trail","Enchanted River","Entamis Village","Entrance to Almuj",
  "Entrance to Bucie","Entrance to Cinfras","Entrance to Gavel","Entrance to Kander",
  "Entrance to Molten Heights","Entrance to Nivla Woods","Espren","Entrance to Olux",
  "Entrance to Thesead","Essren's Hut","Evergreen Outbreak",
  "Fading Forest","Fallen Factory","Fallen Village","Faltach Manor","Farmers Settlement",
  "Featherfall Cliffs","Felroc Fields","Festival Grounds","Feuding Houses","Field of Life",
  "Final Step","Fleris Cranny","Fleris Trail","Floral Peaks","Florist's Hut","Forest of Eyes",
  "Fort Hegea","Fort Tericen","Fort Torann","Forts in Fall","Forgotten Burrows","Forgotten Path",
  "Forgotten Town","Founder's Statue","Fountain of Youth","Freezing Heights","Frigid Crossroads",
  "Frosty Outpost","Frosty Spikes","Frozen Fort","Frozen Homestead","Fungal Grove",
  "Gates to Aelumia","Gateway to Nothing","Gelibord","Gelibord Watermill","Gert Camp",
  "Gloopy Cave","Goblin Plains East","Goblin Plains West","Great Bridge","Grey Ruins",
  "Guardian of the Forest","Guild Hall","Gylia Fisherman Camp","Gylia Lakehouse",
  "Gylia Research Cabin","Gylia Watchtower",
  "Half Moon Island","Highlands Gate","Harnort Compound","Harpy's Haunt North",
  "Harpy's Haunt South","Heart of Decay","Heavenly Ingress","Herb Cave","Hobgoblin's Hoard",
  "Housing Crisis","Hyloch",
  "Iboju Village","Icy Descent","Icy Island","Icy Vigil","Illuminant Path","Industrial Clearing",
  "Industrial Sector","Infested Sinkhole","Inhospitable Mountain","Invaded Barracks","Iron Road",
  "Jagged Foothills","Jitak's Farm","Jofash Docks","Jofash Tunnel","Jungle Entrance",
  "Kander Mines","Kandon Farm","Kandon Ridge","Kandon-Beda","Karoc Quarry","Katoa Ranch",
  "Kitrios Armory","Kitrios Barracks","Krolton's Cave",
  "Lake Gitephe","Lake Rieke","Lava Lakes","Lava Springs","Legendary Island","Lexdale",
  "Lexdale Penitentiary","Lifeless Forest","Light Peninsula","Lighthouse Lookout","Lion Lair",
  "Little Wood","Lizardman Camp","Lizardman Lake","Llevigar","Llevigar Farm","Llevigar Gate",
  "Llevigar Stables","Loamsprout Orc Camp","Lost Atoll","Luminous Plateau","Lusuco","Lutho",
  "Luxuriant Pond",
  "Mage Island","Maiden Tower","Maltic","Maltic Coast","Mangled Lake","Mantis Nest","Maro Peaks",
  "Mesquis Tower","Meteor Crater","Meteor Trail","Mine Base Plains","Mining Base Camp",
  "Minotaur Barbecue","Molten Passage","Molten Reach","Monte's Village","Mount Wynn Inn",
  "Mudspring Orc Camp","Mummy's Tomb","Mushroom Hill","Mycelial Expanse","Myconid Descent",
  "Naga Lake","Nemract","Nemract Cathedral","Nesaak","Nesaak Transition","Nested Cliffside",
  "Nexus of Light","Nivla Woods","Nivla Woods Exit","Nodguj Nation","Nomads' Refuge",
  "Ogre Den","Old Coal Mine","Old Crossroads","Olux","Olux Lumberyard","Orc Battlegrounds",
  "Orc Lake","Orc Road","Otherworldly Monolith","Outer Aldorei Town","Overrun Docks",
  "Overtaken Outpost","Owl Tribe",
  "Panda Kingdom","Panda Path","Paper Trail","Parasitic Slime Mine","Path to Ahmsord",
  "Path to Cinfras","Path to Light","Path to Light's Secret","Path to Ozoth's Spire",
  "Path to Talor","Path to Thanos","Path to the Dojo","Path to the Forgery",
  "Path to the Grootslangs","Path to the Penitentiary","Paths of Sludge","Perilous Grotto",
  "Perilous Passage","Picnic Pond","Pigmen Ravines","Pine Pillar Forest","Pirate Town",
  "Plains Lake","Primal Fen","Protector's Pathway","Pyroclastic Flow",
  "Residence Sector","Ragni","Ragni Countryside North","Ragni Countryside South",
  "Ragni Main Entrance","Ragni North Entrance","Ragni South Entrance","Raiders' Airbase",
  "Raiders' Stronghold","Ranol's Farm","Razed Inn","Regular Island","Relos",
  "Retrofitted Manufactory","Riverbank Knoll","Road to Elkurn","Road to Light Forest",
  "Road to Mine","Road to Time Valley","Rocky Bend","Rocky Shore","Rodoroc","Rooster Island",
  "Roots of Corruption","Royal Barracks","Royal Dam","Royal Gate","Ruined Houses",
  "Ruined Prospect","Ruined Villa","Rymek",
  "Sablestone Orc Camp","Sanctuary Bridge","Sanguine Spider Den","Santa's Hideout",
  "Savannah Plains","Scorched Trail","Scorpion Nest","Secluded Ponds","Secluded Workshop",
  "Selchar","Shady Shack","Shineridge Orc Camp","Silent Road","Silverbull Headquarters",
  "Sinister Forest","Skien's Island","Sky Castle","Sky Falls","Sky Island Ascent","Snail Island",
  "Southern Outpost","Stonecave Orc Camp","Sulphuric Hollow","Sunrise Plateau","Sunset Plateau",
  "Sunspark Orc Camp","Swamp Island","Swamp Mountain Arch",
  "Talor Cemetery","Temple Island","Temple of Legends","Tempo Town","Ternaves",
  "Ternaves Tunnel","Thanos","Thanos Exit","Thanos Underpass","The Forgery","The Frog Bog",
  "The Gate","The Hive","The Lumbermill","The Shiar","Thesead","Thesead Suburbs",
  "Thesead Underpass","Timasca","Time Valley","Timeworn Arch","Tower of Ascension",
  "Toxic Caves","Toxic Drip","Tree Island","Troll Tower","Troll's Challenge","Troms",
  "Troms Lake","Trunkstump Goblin Camp","Turncoat Turnabout","Twain Lake","Twain Mansion",
  "Twisted Housing","Twisted Ridge",
  "Unicorn Trail","University Campus","Upper Thanos",
  "Verdant Grove","Viscera Pits","Void Valley","Volcanic Excavation","Volcanic Isles",
  "Wanderer's Way","Water Processing Sector","Waterfall Cave","Wayward Split","Webbed Fracture",
  "Weird Clearing","Wellspring of Eternity","Winding Waters","Witching Road","Wizard Tower",
  "Wizard's Warning","Wolves' Den","Wood Sprite Hideaway","Workshop Glade","Worm Tunnel",
  "Wybel Island",
  "Xima Valley",
  "Zhight Island"
]);

// OLD territories (removed in Rekindled World)
const OLD_TERRITORIES = new Set([
  "Abandoned Manor","Active Volcano","Air Temple Lower","Air Temple Upper","Aldorei Lowlands",
  "Aldorei Valley Lower","Aldorei Valley Mid","Aldorei Valley Upper",
  "Aldorei Valley West Entrance","Aldorei\u2019s North Exit","Aldorei\u2019s River",
  "Aldorei\u2019s Waterfall","Almuj City","Arachnid Route","Avos Workshop",
  "Bandit Camp Exit","Bandit Cave Lower","Bandit Cave Upper","Bandits Toll",
  "Canyon Entrance Waterfall","Canyon Fortress","Canyon Lower South East",
  "Canyon Mountain East","Canyon Mountain South","Canyon Of The Lost",
  "Canyon Path North Mid","Canyon Path North West","Canyon Path South East",
  "Canyon Path South West","Canyon Survivor","Canyon Upper North West",
  "Canyon Valley South","Canyon Walk Way","Canyon Waterfall Mid North",
  "Canyon Waterfall North","Chained House","Cherry Blossom Forest","Cinfras Entrance",
  "Cinfras Thanos Transition","City of Troms","Cliff Side of the Lost","Cliffside Lake",
  "Cliffside Passage","Cliffside Valley","Cliffside Waterfall",
  "Corkus City South","Corkus Countryside","Corkus Forest South","Corkus Mountain",
  "Dark Forest Cinfras Transition","Dead Island North East","Dead Island North West",
  "Dead Island South East","Dead Island South West","Dernel Jungle Lower",
  "Dernel Jungle Mid","Dernel Jungle Upper","Desert East Lower","Desert East Mid",
  "Desert East Upper","Desert Lower","Desert Mid-Lower","Desert Mid-Upper","Desert Upper",
  "Desert West Lower","Desert West Upper","Detlas Close Suburbs","Detlas Far Suburbs",
  "Detlas Savannah Transition","Detlas Trail East Plains","Detlas Trail West Plains",
  "Durum Isles Center","Durum Isles East","Durum Isles Lower","Durum Isles Upper",
  "Efilim East Plains","Efilim South East Plains","Efilim South Plains","Efilim Village",
  "Elkurn Fields","Entrance to Rodoroc","Entrance to Thesead North","Entrance to Thesead South",
  "Factory Entrance","Fortress North","Fortress South","Gelibord Castle",
  "Gelibord Corrupted Farm","Great Bridge Jungle","Great Bridge Nesaak","Hive","Hive South",
  "Hobbit River","Jungle Lake","Jungle Lower","Jungle Mid","Jungle Upper","Lava Lake",
  "Lava Lake Bridge","Leadin Fortress","Light Forest Canyon","Light Forest East Lower",
  "Light Forest East Mid","Light Forest East Upper","Light Forest North Entrance",
  "Light Forest North Exit","Light Forest South Entrance","Light Forest West Lower",
  "Light Forest West Mid","Light Forest West Upper","Lighthouse Plateau",
  "Llevigar Entrance","Llevigar Farm Plains East","Llevigar Farm Plains West",
  "Llevigar Gate East","Llevigar Gate West","Llevigar Plains East Lower",
  "Llevigar Plains East Upper","Llevigar Plains West Lower","Llevigar Plains West Upper",
  "Loamsprout Camp","Lone Farmstead","Maltic Plains","Mansion of Insanity",
  "Mining Base Lower","Mining Base Upper","Molten Heights Portal","Mountain Edge",
  "Mountain Path","Nemract Plains East","Nemract Plains West","Nemract Quarry",
  "Nemract Road","Nemract Town","Nesaak Bridge Transition","Nesaak Plains Lower North West",
  "Nesaak Plains North East","Nesaak Plains South East","Nesaak Plains South West",
  "Nesaak Plains Upper North West","Nesaak Village","Nether Gate","Nether Plains Lower",
  "Nether Plains Upper","Nivla Woods Edge","Nivla Woods Entrance","North Farmers Valley",
  "North Nivla Woods","Path to Ahmsord Lower","Path to Ahmsord Upper",
  "Path To Ozoth\u2019s Spire Lower","Path To Ozoth\u2019s Spire Mid",
  "Path To Ozoth\u2019s Spire Upper","Path To Thanos","Path To The Arch","Phinas Farm",
  "Pigmen Ravines Entrance","Plains","Plains Coast","Pre-Light Forest Transition",
  "Quartz Mines North East","Quartz Mines North West","Quartz Mines South East",
  "Quartz Mines South West","Ragni East Suburbs","Ragni North Suburbs","Ragni Plains",
  "Raider\u2019s Base Lower","Raider\u2019s Base Upper","Road To Light Forest","Road To Mine",
  "Rymek East Lower","Rymek East Mid","Rymek East Upper","Rymek West Lower","Rymek West Mid",
  "Rymek West Upper","Sablestone Camp","Savannah East Lower","Savannah East Upper",
  "Savannah West Lower","Savannah West Upper","Skiens Island","South Farmers Valley",
  "South Nivla Woods","South Pigmen Ravines","Sunspark Camp",
  "Swamp Dark Forest Transition Lower","Swamp Dark Forest Transition Mid",
  "Swamp Dark Forest Transition Upper","Swamp East Lower","Swamp East Mid",
  "Swamp East Mid-Upper","Swamp East Upper","Swamp Lower","Swamp Mountain Base",
  "Swamp Mountain Transition Lower","Swamp Mountain Transition Mid",
  "Swamp Mountain Transition Mid-Upper","Swamp Mountain Transition Upper",
  "Swamp Plains Basin","Swamp West Lower","Swamp West Mid","Swamp West Mid-Upper",
  "Swamp West Upper","Taproot Descent","Temple of the Lost East","Ternaves Plains Lower",
  "Ternaves Plains Upper","Thanos Exit Upper","The Bear Zoo","The Broken Road",
  "The Silent Road","Valley of the Lost","Viscera Pits East","Volcanic Slope",
  "Volcano Lower","Volcano Upper","Wizard Tower North",
  // Old territories from exchange data only
  "Aldorei Valley South Entrance","Aldorei's Arch","Cinfras County Lower",
  "Cinfras County Mid-Lower","Cinfras County Mid-Upper","Cinfras County Upper",
  "Corkus Docks","Corkus Forest North","Corkus Sea Port","Corkus Statue","Ghostly Path",
  "Gylia Lake North East","Gylia Lake North West","Gylia Lake South East",
  "Gylia Lake South West","Lexdales Prison","Light Forest Entrance",
  "Light Forest South Exit","Military Base","Military Base Lower","Military Base Upper",
  "Nesaak Plains Mid North West","Old Crossroads North","Old Crossroads South",
  "Path To Military Base","Thanos Valley West","Viscera Pits West",
  // 2018-era
  "Abandoned Church","Abandoned Tower","Angry Village","Animal Bridge","Arachnida Cave",
  "Banshees Cave","Battle Tower","Black Camp","Black Magic","Bucie North East",
  "Bucie North West","Bucie South East","Bucie South West","Corkus Abandoned Tower",
  "Corrupted Hand","Corrupted Impact","Corrupted Village","Farmers Valley",
  "Graveyard North","Graveyard South","Gray Zone","Green Camp","Gromblins Hideout",
  "Imperial Gate","Light Realm East","Light Realm East Mid-Upper",
  "Light Realm Entrance Upper","Light Realm Mushrooms","Mt. Wynn","Orphion\u2019s Seal",
  "Orphion\u2019s Seal Upper","Path To Prison","Potato Laboratory","Qira\u2019s Battle Room",
  "Red Camp","Sacrifice","Shanjugin\u2019s River","Spiraling Trees","Statue"
]);

// ---- PARSE TERRITORY COORDINATES ----
const terrCoords = {};
for (const [name, data] of Object.entries(territories)) {
  if (data.Location && data.Location.start && data.Location.end) {
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
function rectArea(r) {
  return (r.maxX - r.minX) * (r.maxZ - r.minZ);
}

function overlapArea(a, b) {
  const overlapX = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const overlapZ = Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));
  return overlapX * overlapZ;
}

function classifyEra(name) {
  const isNew = NEW_TERRITORIES.has(name);
  const isOld = OLD_TERRITORIES.has(name);
  if (isNew && isOld) return 'both';
  if (isNew) return 'new';
  if (isOld) return 'old';
  return 'unknown';
}

const names = Object.keys(terrCoords);
const overlaps = [];

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

    if (overlapPct > 0.20) {
      const eraA = classifyEra(names[i]);
      const eraB = classifyEra(names[j]);

      let pairType;
      if ((eraA === 'old' && eraB === 'new') || (eraA === 'new' && eraB === 'old')) {
        pairType = 'OLD+NEW (safe - era system handles)';
      } else if (eraA === 'old' && eraB === 'old') {
        pairType = 'BOTH OLD (coexist pre-Rekindled)';
      } else if (eraA === 'new' && eraB === 'new') {
        pairType = 'BOTH NEW (coexist post-Rekindled) *** PROBLEMATIC ***';
      } else if (eraA === 'both' || eraB === 'both') {
        pairType = `MIXED (${eraA}+${eraB}) - needs analysis`;
      } else {
        pairType = `UNKNOWN (${eraA}+${eraB})`;
      }

      overlaps.push({
        a: names[i],
        b: names[j],
        overlapPct: (overlapPct * 100).toFixed(1),
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
  if (a.pairType.includes('PROBLEMATIC') && !b.pairType.includes('PROBLEMATIC')) return -1;
  if (!a.pairType.includes('PROBLEMATIC') && b.pairType.includes('PROBLEMATIC')) return 1;
  if (a.pairType.includes('BOTH OLD') && !b.pairType.includes('BOTH OLD')) return -1;
  if (!a.pairType.includes('BOTH OLD') && b.pairType.includes('BOTH OLD')) return 1;
  return parseFloat(b.overlapPct) - parseFloat(a.overlapPct);
});

// ---- OUTPUT ----
console.log(`\n=== TERRITORY OVERLAP ANALYSIS ===`);
console.log(`Total territories with coordinates: ${names.length}`);
console.log(`Total significant overlapping pairs (>20% of smaller): ${overlaps.length}\n`);

// Count by type
const typeCounts = {};
overlaps.forEach(o => {
  typeCounts[o.pairType] = (typeCounts[o.pairType] || 0) + 1;
});
console.log(`--- BY CATEGORY ---`);
for (const [type, count] of Object.entries(typeCounts)) {
  console.log(`  ${type}: ${count}`);
}

// Problematic pairs (BOTH NEW)
const problematic = overlaps.filter(o => o.pairType.includes('PROBLEMATIC'));
if (problematic.length > 0) {
  console.log(`\n\n========================================`);
  console.log(`=== PROBLEMATIC: BOTH-NEW OVERLAPS ===`);
  console.log(`========================================`);
  console.log(`These ${problematic.length} pairs both exist post-Rekindled and overlap significantly.`);
  console.log(`The era system does NOT fix these.\n`);
  problematic.forEach((o, i) => {
    console.log(`${i+1}. "${o.a}" <-> "${o.b}"`);
    console.log(`   Overlap: ${o.overlapPct}% of smaller territory`);
    console.log(`   Areas: ${o.areaA} vs ${o.areaB}, overlap: ${o.overlapAreaVal}`);
  });
}

// Both-old pairs
const bothOld = overlaps.filter(o => o.pairType.includes('BOTH OLD'));
if (bothOld.length > 0) {
  console.log(`\n\n=======================================`);
  console.log(`=== BOTH-OLD OVERLAPS (pre-Rekindled) ===`);
  console.log(`=======================================`);
  console.log(`These ${bothOld.length} pairs both existed pre-Rekindled and overlap significantly.`);
  console.log(`They coexisted at the same time, so these could be problematic for pre-Rekindled display.\n`);
  bothOld.forEach((o, i) => {
    console.log(`${i+1}. "${o.a}" <-> "${o.b}"`);
    console.log(`   Overlap: ${o.overlapPct}% of smaller territory`);
    console.log(`   Areas: ${o.areaA} vs ${o.areaB}, overlap: ${o.overlapAreaVal}`);
  });
}

// Safe old+new pairs
const safeCount = overlaps.filter(o => o.pairType.includes('safe')).length;
console.log(`\n\n--- SAFE: OLD+NEW pairs (era system handles): ${safeCount} ---`);

// Unknown / mixed
const mixed = overlaps.filter(o => o.pairType.includes('UNKNOWN') || o.pairType.includes('MIXED'));
if (mixed.length > 0) {
  console.log(`\n\n=== UNCLASSIFIED/MIXED OVERLAPS ===`);
  mixed.forEach((o, i) => {
    console.log(`${i+1}. "${o.a}" (${o.eraA}) <-> "${o.b}" (${o.eraB})`);
    console.log(`   Overlap: ${o.overlapPct}% of smaller territory`);
  });
}