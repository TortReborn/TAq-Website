// Snipe system constants — ported from Commands/snipe.py

export const SNIPE_ROLES = ['Tank', 'Healer', 'DPS'] as const;
export type SnipeRole = (typeof SNIPE_ROLES)[number];

export const ROLE_ORDER: SnipeRole[] = ['Healer', 'Tank', 'DPS'];

export const ROLE_COLORS: Record<SnipeRole, string> = {
  Healer: '#51D868',
  Tank:   '#00D2E6',
  DPS:    '#FF442F',
};

// (minDifficulty, color) — check from top to bottom, first match where diff >= min wins
export const DIFFICULTY_COLORS: [number, string][] = [
  [202, '#ff00ab'],
  [192, '#ff2121'],
  [167, '#f56217'],
  [120, '#ff9627'],
  [100, '#ffcd35'],
  [56,  '#4cb80f'],
  [0,   '#a8f785'],
];

export function getDifficultyColor(diff: number): string {
  for (const [min, color] of DIFFICULTY_COLORS) {
    if (diff >= min) return color;
  }
  return '#a8f785';
}

export const LB_SORT_CHOICES = ['Total Snipes', 'Personal Best', 'Best Streak', 'Current Streak'] as const;
export const LIST_SORT_CHOICES = ['Newest', 'Oldest', 'Hardest', 'Easiest', 'Least Conns'] as const;

export const LIST_ORDER_SQL: Record<string, string> = {
  'Newest':      'sl.sniped_at DESC',
  'Oldest':      'sl.sniped_at ASC',
  'Hardest':     'sl.difficulty DESC, sl.sniped_at DESC',
  'Easiest':     'sl.difficulty ASC, sl.sniped_at DESC',
  'Least Conns': 'sl.conns ASC, sl.sniped_at DESC',
  // Column-based sorts for table headers
  'date_asc':       'sl.sniped_at ASC',
  'date_desc':      'sl.sniped_at DESC',
  'hq_asc':         'sl.hq ASC, sl.sniped_at DESC',
  'hq_desc':        'sl.hq DESC, sl.sniped_at DESC',
  'guild_asc':      'sl.guild_tag ASC, sl.sniped_at DESC',
  'guild_desc':     'sl.guild_tag DESC, sl.sniped_at DESC',
  'diff_asc':       'sl.difficulty ASC, sl.sniped_at DESC',
  'diff_desc':      'sl.difficulty DESC, sl.sniped_at DESC',
  'conns_asc':      'sl.conns ASC, sl.sniped_at DESC',
  'conns_desc':     'sl.conns DESC, sl.sniped_at DESC',
  'season_asc':     'sl.season ASC, sl.sniped_at DESC',
  'season_desc':    'sl.season DESC, sl.sniped_at DESC',
};

// Territory name → number of trading routes (for dry snipe detection)
// Generated from data/territories_verbose.json
export const TERRITORY_ROUTE_COUNTS: Record<string, number> = {"Abandoned Farm": 2, "Abandoned Lumberyard": 2, "Abandoned Mines": 2, "Abandoned Mines Entrance": 5, "Abandoned Pass": 2, "Accursed Dunes": 3, "Aerial Descent": 3, "Ahmsord": 5, "Ahmsord Outskirts": 4, "Akias Ruins": 5, "Aldorei Cliffside Waterfalls": 3, "Aldorei River": 2, "Aldorei Springs": 3, "Aldorei Valley": 2, "Aldorei Valley Outskirts": 3, "Alekin": 4, "Almuj": 5, "Almuj Slums": 4, "Ancient Excavation": 3, "Ancient Nemract": 5, "Ancient Waterworks": 5, "Angel Refuge": 2, "Apprentice Huts": 3, "Arachnid Woods": 4, "Astraulus' Tower": 2, "Ava's Workshop": 1, "Avos Temple": 3, "Avos Territory": 3, "Azure Frontier": 4, "Balloon Airbase": 3, "Bandit Cave": 1, "Bandit's Toll": 4, "Bantisu Air Temple": 1, "Bantisu Approach": 3, "Barren Sands": 3, "Bear Zoo": 2, "Big Mushroom Cave": 3, "Bizarre Passage": 2, "Black Road": 4, "Blackstring Den": 3, "Bloody Beach": 4, "Bloody Trail": 6, "Blooming Boulders": 5, "Bob's Tomb": 3, "Bremminglar": 2, "Brigand Outpost": 3, "Broken Road": 2, "Bucie Waterfall": 4, "Burning Airship": 3, "Burning Farm": 2, "Canyon Dropoff": 2, "Canyon High Path": 3, "Canyon Walkway": 3, "Caritat Mansion": 3, "Cascading Basins": 2, "Cascading Oasis": 3, "Castle Dullahan": 2, "Cathedral Harbour": 6, "Celestial Impact": 3, "Centerworld Fortress": 3, "Central Islands": 5, "Chasm Chokepoint": 3, "Chasm Overlook": 3, "Cherry Blossom Grove": 3, "Cinfras": 4, "Cinfras Outskirts": 5, "Cinfras's Small Farm": 4, "Cliffhearth Orc Camp": 3, "Cliffside Passage North": 2, "Cliffside Passage South": 2, "Coastal Trail": 3, "Collapsed Bridge": 3, "Collapsed Emerald Mine": 3, "Colourful Mountaintop": 2, "Corkus Castle": 1, "Corkus City": 5, "Corkus City Crossroads": 5, "Corkus City Mine": 3, "Corkus Forest": 4, "Corkus Outskirts": 3, "Corkus Sea Cove": 4, "Corrupted Orchard": 5, "Corrupted River": 4, "Corrupted Road": 4, "Corrupted Tower": 4, "Corrupted Warfront": 6, "Cosmic Fissures": 4, "Crater Descent": 3, "Cyclospordial Hazard": 3, "Dark Forest Village": 4, "Decayed Basin": 4, "Delnar Manor": 1, "Derelict Mansion": 2, "Desolate Valley": 3, "Detlas": 3, "Detlas Suburbs": 4, "Displaced Housing": 4, "Disturbed Crypt": 4, "Dodegar's Forge": 4, "Dogun Ritual Site": 4, "Dragonbone Graveyard": 2, "Dragonling Nests": 2, "Dreary Docks": 4, "Dujgon Nation": 5, "Durum Barley Islet": 4, "Durum Isles Barn": 4, "Durum Malt Islet": 4, "Durum Oat Islet": 3, "Dusty Pit": 2, "Eagle Tribe": 3, "Efilim": 3, "Efilim Crossroads": 3, "Elefolk Stomping Grounds": 4, "Elephelk Trail": 2, "Elkurn": 6, "Eltom": 2, "Emerald Trail": 3, "Enchanted River": 3, "Entamis Village": 2, "Entrance to Almuj": 3, "Entrance to Bucie": 4, "Entrance to Cinfras": 4, "Entrance to Gavel": 2, "Entrance to Kander": 5, "Entrance to Molten Heights": 3, "Entrance to Nivla Woods": 4, "Entrance to Olux": 5, "Entrance to Thesead": 4, "Essren's Hut": 4, "Evergreen Outbreak": 2, "Fading Forest": 5, "Fallen Factory": 5, "Fallen Village": 3, "Faltach Manor": 4, "Farmers Settlement": 5, "Featherfall Cliffs": 5, "Felroc Fields": 3, "Field of Life": 4, "Final Step": 2, "Fleris Cranny": 2, "Fleris Trail": 1, "Floral Peaks": 4, "Florist's Hut": 5, "Forest of Eyes": 2, "Forgotten Burrows": 5, "Forgotten Path": 3, "Forgotten Town": 2, "Founder's Statue": 2, "Fountain of Youth": 3, "Freezing Heights": 3, "Frigid Crossroads": 6, "Frosty Spikes": 5, "Frozen Fort": 1, "Frozen Homestead": 5, "Fungal Grove": 5, "Gateway to Nothing": 3, "Gelibord": 4, "Gelibord Watermill": 4, "Gert Camp": 2, "Gloopy Cave": 4, "Goblin Plains East": 4, "Goblin Plains West": 4, "Great Bridge": 2, "Grey Ruins": 2, "Guardian of the Forest": 3, "Guild Hall": 1, "Gylia Fisherman Camp": 3, "Gylia Lakehouse": 4, "Gylia Research Cabin": 3, "Gylia Watchtower": 4, "Half Moon Island": 1, "Harnort Compound": 2, "Harpy's Haunt North": 2, "Harpy's Haunt South": 3, "Heart of Decay": 3, "Heavenly Ingress": 2, "Herb Cave": 2, "Hobgoblin's Hoard": 2, "Housing Crisis": 1, "Iboju Village": 2, "Icy Descent": 3, "Icy Island": 4, "Icy Vigil": 2, "Illuminant Path": 5, "Industrial Clearing": 4, "Infested Sinkhole": 4, "Inhospitable Mountain": 2, "Invaded Barracks": 1, "Iron Road": 4, "Jagged Foothills": 3, "Jitak's Farm": 3, "Jofash Docks": 3, "Jofash Tunnel": 2, "Jungle Entrance": 3, "Kander Mines": 4, "Kandon Farm": 1, "Kandon Ridge": 4, "Kandon-Beda": 1, "Karoc Quarry": 3, "Katoa Ranch": 2, "Kitrios Armory": 2, "Kitrios Barracks": 3, "Krolton's Cave": 4, "Lava Lakes": 3, "Lava Springs": 4, "Legendary Island": 2, "Lexdale": 4, "Lexdale Penitentiary": 2, "Lifeless Forest": 3, "Light Peninsula": 4, "Lighthouse Lookout": 2, "Lion Lair": 1, "Little Wood": 2, "Lizardman Camp": 4, "Lizardman Lake": 5, "Llevigar": 3, "Llevigar Farm": 6, "Llevigar Gate": 4, "Llevigar Stables": 4, "Loamsprout Orc Camp": 4, "Lost Atoll": 3, "Luminous Plateau": 1, "Lusuco": 1, "Lutho": 2, "Luxuriant Pond": 3, "Mage Island": 5, "Maiden Tower": 4, "Maltic": 5, "Maltic Coast": 4, "Mangled Lake": 4, "Mantis Nest": 5, "Maro Peaks": 2, "Mesquis Tower": 4, "Meteor Crater": 3, "Meteor Trail": 4, "Mine Base Plains": 6, "Mining Base Camp": 4, "Minotaur Barbecue": 2, "Molten Passage": 2, "Molten Reach": 2, "Monte's Village": 3, "Mount Wynn Inn": 6, "Mudspring Orc Camp": 4, "Mummy's Tomb": 1, "Mushroom Hill": 4, "Mycelial Expanse": 4, "Myconid Descent": 2, "Naga Lake": 4, "Nemract": 4, "Nemract Cathedral": 4, "Nesaak": 5, "Nesaak Transition": 4, "Nested Cliffside": 4, "Nexus of Light": 1, "Nivla Woods": 4, "Nivla Woods Exit": 5, "Nodguj Nation": 6, "Nomads' Refuge": 5, "Ogre Den": 3, "Old Coal Mine": 1, "Old Crossroads": 4, "Olux": 4, "Olux Lumberyard": 3, "Orc Battlegrounds": 2, "Orc Lake": 5, "Orc Road": 4, "Otherworldly Monolith": 2, "Outer Aldorei Town": 2, "Overrun Docks": 1, "Overtaken Outpost": 4, "Owl Tribe": 4, "Panda Kingdom": 2, "Panda Path": 2, "Paper Trail": 3, "Parasitic Slime Mine": 4, "Path to Ahmsord": 3, "Path to Cinfras": 3, "Path to Light": 2, "Path to Light's Secret": 3, "Path to Ozoth's Spire": 4, "Path to Talor": 6, "Path to Thanos": 4, "Path to the Dojo": 5, "Path to the Forgery": 4, "Path to the Grootslangs": 3, "Path to the Penitentiary": 4, "Paths of Sludge": 2, "Perilous Grotto": 3, "Perilous Passage": 2, "Picnic Pond": 3, "Pigmen Ravines": 2, "Pine Pillar Forest": 3, "Pirate Town": 4, "Plains Lake": 4, "Primal Fen": 1, "Protector's Pathway": 4, "Pyroclastic Flow": 3, "Ragni": 3, "Ragni Countryside North": 4, "Ragni Countryside South": 3, "Ragni Main Entrance": 3, "Ragni North Entrance": 3, "Ragni South Entrance": 3, "Raiders' Airbase": 1, "Raiders' Stronghold": 2, "Ranol's Farm": 3, "Razed Inn": 2, "Regular Island": 4, "Relos": 4, "Retrofitted Manufactory": 4, "Riverbank Knoll": 3, "Road to Elkurn": 4, "Road to Light Forest": 3, "Road to Mine": 3, "Road to Time Valley": 3, "Rocky Bend": 1, "Rocky Shore": 3, "Rodoroc": 2, "Rooster Island": 4, "Roots of Corruption": 4, "Royal Gate": 1, "Ruined Houses": 3, "Ruined Prospect": 2, "Ruined Villa": 5, "Rymek": 2, "Sablestone Orc Camp": 4, "Sanctuary Bridge": 2, "Sanguine Spider Den": 3, "Santa's Hideout": 3, "Savannah Plains": 4, "Scorched Trail": 5, "Scorpion Nest": 1, "Secluded Ponds": 4, "Secluded Workshop": 3, "Selchar": 5, "Shady Shack": 4, "Shineridge Orc Camp": 4, "Silent Road": 2, "Silverbull Headquarters": 3, "Sinister Forest": 2, "Skien's Island": 4, "Sky Castle": 1, "Sky Falls": 3, "Sky Island Ascent": 5, "Snail Island": 2, "Southern Outpost": 2, "Stonecave Orc Camp": 5, "Sulphuric Hollow": 3, "Sunrise Plateau": 3, "Sunset Plateau": 3, "Sunspark Orc Camp": 5, "Swamp Island": 3, "Swamp Mountain Arch": 4, "Talor Cemetery": 5, "Temple Island": 5, "Temple of Legends": 2, "Tempo Town": 4, "Ternaves": 3, "Ternaves Tunnel": 3, "Thanos": 4, "Thanos Exit": 1, "Thanos Underpass": 1, "The Forgery": 2, "The Gate": 1, "The Hive": 2, "The Shiar": 4, "Thesead": 2, "Thesead Suburbs": 4, "Thesead Underpass": 3, "Time Valley": 4, "Timeworn Arch": 2, "Tower of Ascension": 1, "Toxic Caves": 1, "Toxic Drip": 3, "Tree Island": 4, "Troll Tower": 2, "Troll's Challenge": 3, "Troms": 3, "Troms Lake": 4, "Trunkstump Goblin Camp": 4, "Turncoat Turnabout": 3, "Twain Lake": 2, "Twain Mansion": 1, "Twisted Housing": 5, "Twisted Ridge": 3, "Unicorn Trail": 4, "Upper Thanos": 2, "Viscera Pits": 3, "Void Valley": 1, "Volcanic Excavation": 4, "Volcanic Isles": 5, "Wanderer's Way": 1, "Waterfall Cave": 3, "Wayward Split": 4, "Webbed Fracture": 3, "Weird Clearing": 4, "Winding Waters": 2, "Witching Road": 3, "Wizard Tower": 2, "Wizard's Warning": 2, "Wolves' Den": 3, "Wood Sprite Hideaway": 4, "Workshop Glade": 4, "Worm Tunnel": 2, "Wybel Island": 3, "Zhight Island": 3};

export const ALL_TERRITORY_NAMES = Object.keys(TERRITORY_ROUTE_COUNTS).sort();

export function getMaxConns(hq: string): number | null {
  // Case-insensitive lookup
  const lower = hq.trim().toLowerCase();
  for (const [name, count] of Object.entries(TERRITORY_ROUTE_COUNTS)) {
    if (name.toLowerCase() === lower) return count;
  }
  return null;
}

export function isDry(hq: string, conns: number): boolean {
  const max = getMaxConns(hq);
  return max !== null && conns === max;
}

export function normalizeHq(hq: string): string | null {
  const lower = hq.trim().toLowerCase();
  for (const name of Object.keys(TERRITORY_ROUTE_COUNTS)) {
    if (name.toLowerCase() === lower) return name;
  }
  return null;
}
