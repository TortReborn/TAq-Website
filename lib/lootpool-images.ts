// Mythic item name to image file mapping - from Discord bot
export const mythicImageMap: { [key: string]: string } = {
  "Corkian Insulator": "insulator.png",
  "Corkian Simulator": "simulator.png",
  "Boreal": "diamond_boots.png",
  "Crusade Sabatons": "diamond_boots.png",
  "Dawnbreak": "diamond_boots.png",
  "Galleon": "diamond_boots.png",
  "Moontower": "diamond_boots.png",
  "Resurgence": "diamond_boots.png",
  "Revenant": "diamond_boots.png",
  "Slayer": "diamond_boots.png",
  "Stardew": "diamond_boots.png",
  "Warchief": "diamond_boots.png",
  "Discoverer": "diamond_chestplate.png",
  "Az": "bow.thunder3.png",
  "Divzer": "bow.thunder3.png",
  "Epoch": "bow.basicGold.png",
  "Freedom": "bow.multi3.png",
  "Grandmother": "bow.earth3.png",
  "Ignis": "bow.fire3.png",
  "Labyrinth": "bow.earth3.png",
  "Spring": "bow.water3.png",
  "Stratiformis": "bow.air3.png",
  "Absolution": "relik.fire3.png",
  "Aftershock": "relik.earth3.png",
  "Fantasia": "relik.multi3.png",
  "Hadal": "relik.water3.png",
  "Immolation": "relik.fire3.png",
  "Olympic": "relik.air3.png",
  "Resonance": "relik.basicGold.png",
  "Sunstar": "relik.thunder3.png",
  "Toxoplasmosis": "relik.earth3.png",
  "Fatal": "wand.thunder3.png",
  "Gaia": "wand.earth3.png",
  "Lament": "wand.water3.png",
  "Monster": "wand.fire3.png",
  "Pure": "wand.multi1.png",
  "Quetzalcoatl": "wand.air3.png",
  "Singularity": "wand.multi3.png",
  "Trance": "wand.fire3.png",
  "Warp": "wand.air3.png",
  "Archangel": "spear.air3.png",
  "Cataclysm": "dagger.thunder3.png",
  "Grimtrap": "dagger.earth3.png",
  "Hanafubuki": "dagger.air3.png",
  "Inferno": "dagger.fire3.png",
  "Nirvana": "dagger.water3.png",
  "Nullification": "dagger.basicGold.png",
  "Oblivion": "dagger.multi3.png",
  "Weathered": "dagger.air3.png",
  "Alkatraz": "spear.earth1.png",
  "Apocalypse": "spear.fire3.png",
  "Bloodbath": "spear.earth3.png",
  "Collapse": "spear.multi3.png",
  "Convergence": "spear.multi3.png",
  "Guardian": "spear.fire3.png",
  "Hero": "spear.air3.png",
  "Idol": "spear.water3.png",
  "Thrundacrack": "spear.thunder3.png"
};

// Get image for mythic item - uses a fallback strategy
export const getImageForItem = (itemName: string): string => {
  // First try exact match
  if (mythicImageMap[itemName]) {
    return mythicImageMap[itemName];
  }
  
  // Try partial matching for common patterns
  const lowerItem = itemName.toLowerCase();
  
  // Weapon type detection
  if (lowerItem.includes('bow') || lowerItem.includes('arrow')) {
    return "bow.multi3.png";
  }
  if (lowerItem.includes('dagger') || lowerItem.includes('knife')) {
    return "dagger.multi3.png";
  }
  if (lowerItem.includes('spear') || lowerItem.includes('lance')) {
    return "spear.multi3.png";
  }
  if (lowerItem.includes('wand') || lowerItem.includes('staff')) {
    return "wand.multi3.png";
  }
  if (lowerItem.includes('relik')) {
    return "relik.multi3.png";
  }
  
  // Armor detection
  if (lowerItem.includes('boots') || lowerItem.includes('leggings')) {
    return "diamond_boots.png";
  }
  if (lowerItem.includes('chestplate') || lowerItem.includes('chest')) {
    return "diamond_chestplate.png";
  }
  
  // Special items
  if (lowerItem.includes('insulator')) {
    return "insulator.png";
  }
  if (lowerItem.includes('simulator')) {
    return "simulator.png";
  }
  
  // Default fallback
  return "simulator.png";
};

// Raid name to image mapping
export const raidImageMap: { [key: string]: string } = {
  "TNA": "TNA.png",
  "TCC": "TCC.png", 
  "NOL": "NoL.png",
  "NOTG": "NOTG.png"
};

// Class name to aspect icon mapping
export const classImageMap: { [key: string]: string } = {
  "archer": "aspect_archer.png",
  "assassin": "aspect_assassin.png", 
  "mage": "aspect_mage.png",
  "shaman": "aspect_shaman.png",
  "warrior": "aspect_warrior.png"
};
