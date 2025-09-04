// Mock data for testing when external APIs are unavailable
export const mockLootrunsData = {
  "Timestamp": Math.floor(Date.now() / 1000),
  "Loot": {
    "Silent Expanse": {
      "Mythic": ["Divzer", "Weathered", "Spring"],
      "Shiny": {
        "Item": "Divzer",
        "Tracker": "2/4 Items Found"
      }
    },
    "Corkus": {
      "Mythic": ["Cataclysm", "Singularity", "Toxoplasmosis"],
      "Shiny": {
        "Item": "Cataclysm",
        "Tracker": "1/4 Items Found"
      }
    },
    "Sky Islands": {
      "Mythic": ["Az", "Stardew", "Ignis"],
      "Shiny": {
        "Item": "Az",
        "Tracker": "3/4 Items Found"
      }
    },
    "Molten Heights": {
      "Mythic": ["Monster", "Fatal", "Hero"],
      "Shiny": {
        "Item": "Monster",
        "Tracker": "0/4 Items Found"
      }
    },
    "Canyon South": {
      "Mythic": ["Nirvana", "Pure", "Warp"],
      "Shiny": {
        "Item": "Nirvana",
        "Tracker": "2/4 Items Found"
      }
    }
  }
};

export const mockAspectsData = {
  "Timestamp": Math.floor(Date.now() / 1000),
  "Loot": {
    "TNA": {
      "Mythic": ["Aspect of the Apprentice's Bolt", "Aspect of the Comet"],
      "Fabled": ["Aspect of Wind Walking", "Aspect of Burning Providence"],
      "Legendary": ["Aspect of Fatal Fulguration", "Aspect of Flickering Transmission"]
    },
    "TCC": {
      "Mythic": ["Aspect of Battlement Fortification", "Aspect of Bullet Hell"],
      "Fabled": ["Aspect of Clinging Lichen", "Aspect of Dynamic Entry"],
      "Legendary": ["Aspect of Extreme Firepower", "Aspect of Further Horizons"]
    },
    "NOL": {
      "Mythic": ["Aspect of the Anvil Drop", "Aspect of Bovine Inspiration"],
      "Fabled": ["Aspect of Deafening Echoes", "Aspect of Earthshaking"],
      "Legendary": ["Aspect of Maniacal Frisson", "Aspect of the Megaphone"]
    },
    "NOTG": {
      "Mythic": ["Aspect of Athleticism", "Aspect of the Chain Knife"],
      "Fabled": ["Aspect of Enduring Illusions", "Aspect of Flamboyance"],
      "Legendary": ["Aspect of the Fog Machine", "Aspect of the Pinwheel"]
    }
  }
};
