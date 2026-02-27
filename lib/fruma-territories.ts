import { Territory } from "@/lib/utils";

// Coordinates sourced from territories_verbose.json
const FRUMA_LOCATIONS: Record<string, { start: [number, number]; end: [number, number] }> = {
  "Agricultural Sector":    { start: [-2291, -934],  end: [-1976, -768]  },
  "Industrial Sector":      { start: [-2113, -752],  end: [-1896, -515]  },
  "Residence Sector":       { start: [-1966, -917],  end: [-1805, -737]  },
  "Water Processing Sector":{ start: [-2277, -752],  end: [-2114, -501]  },
  "Citadel's Shadow":       { start: [-1599, -1108], end: [-1341, -945]  },
  "Contested District":     { start: [-1624, -834],  end: [-1471, -712]  },
  "Gates to Aelumia":       { start: [-1624, -1004], end: [-1471, -835]  },
  "Royal Barracks":         { start: [-1780, -1004], end: [-1625, -835]  },
  "Royal Dam":              { start: [-1780, -1474], end: [-1610, -1015] },
  "University Campus":      { start: [-1780, -834],  end: [-1625, -712]  },
  "The Lumbermill":         { start: [-1905, -1082], end: [-1806, -920]  },
  "Espren":                 { start: [-2143, -1136], end: [-1979, -937]  },
  "Festival Grounds":       { start: [-2275, -1300], end: [-2154, -969]  },
  "Highlands Gate":         { start: [-1431, -939],  end: [-1251, -846]  },
  "Lake Gitephe":           { start: [-1580, -1446], end: [-1485, -1123] },
  "Lake Rieke":             { start: [-1270, -1460], end: [-1153, -1181] },
  "Hyloch":                 { start: [-1483, -1334], end: [-1272, -1176] },
  "Xima Valley":            { start: [-1825, -1750], end: [-1635, -1519] },
  "Wellspring of Eternity": { start: [-2291, -1752], end: [-2020, -1556] },
  "The Frog Bog":           { start: [-2225, -1493], end: [-2078, -1337] },
  "Forts in Fall":          { start: [-2039, -1476], end: [-1817, -1134] },
  "Alder Understory":       { start: [-1250, -936],  end: [-1043, -795]  },
  "Deforested Ecotone":     { start: [-1576, -649],  end: [-1316, -515]  },
  "Verdant Grove":          { start: [-1481, -727],  end: [-1370, -646]  },
  "Aldwell":                { start: [-1356, -758],  end: [-1202, -646]  },
  "Timasca":                { start: [-1856, -747],  end: [-1631, -433]  },
  "Fort Hegea":             { start: [-1194, -791],  end: [-1054, -579]  },
  "Fort Tericen":           { start: [-1330, -1160], end: [-1178, -948]  },
  "Fort Torann":            { start: [-2000, -1675], end: [-855,  -1500] },
  "Feuding Houses":         { start: [-1153, -1249], end: [-946,  -1035] },
  "Frosty Outpost":         { start: [-1153, -1481], end: [-971,  -1250] },
};

// Full Territory objects for rendering — acquired is empty so no timers/outlines appear
export const FRUMA_TBD_TERRITORIES: Record<string, Territory> = Object.fromEntries(
  Object.entries(FRUMA_LOCATIONS).map(([name, location]) => [
    name,
    {
      guild: { uuid: "", name: "TBD", prefix: "TBD" },
      acquired: "",
      location,
    } satisfies Territory,
  ])
);
