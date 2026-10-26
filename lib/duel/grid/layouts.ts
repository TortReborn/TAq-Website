// Warfront board layouts, as data. Each row is a string, one character a
// tile, read top (side 1's back row) to bottom (side 0's back row):
//
//   .  plain          m  mountain (blocks movement except Air, blocks sight)
//   ~  water          n  resource node        c  the city node (centre)
//   H  an HQ (exactly one on the top row and one on the bottom row, centred)
//
// Every layout must be point-symmetric (tile (x, y) matches tile
// (W-1-x, H-1-y)), so neither seat gets a better map. grid/engine.test.ts
// checks it.

export interface LayoutDef {
  name: string;
  rows: string[];
}

export const LAYOUTS: Record<5 | 7, LayoutDef[]> = {
  7: [
    {
      // Two home nodes behind each line, the city in the middle, rivers on
      // the flanks, and a mountain on each side of each HQ, so an HQ can be
      // reached from only three tiles.
      name: 'Crossroads',
      rows: [
        '...H...',
        '.nm.mn.',
        '.......',
        '~~.c.~~',
        '.......',
        '.nm.mn.',
        '...H...',
      ],
    },
    {
      // A river across the middle with the city on its only ford, and two
      // home nodes one step in front of each deploy row (one unit behind
      // each links it to the HQ). Crossing the river anywhere else ends a move.
      name: 'Riverlands',
      rows: [
        '...H...',
        '.mn.nm.',
        '.......',
        '~~~c~~~',
        '.......',
        '.mn.nm.',
        '...H...',
      ],
    },
  ],
  5: [
    {
      name: 'Outpost',
      rows: [
        '..H..',
        'n..m.',
        '~.c.~',
        '.m..n',
        '..H..',
      ],
    },
    {
      name: 'Ford',
      rows: [
        '..H..',
        '.m.n.',
        '..c..',
        '.n.m.',
        '..H..',
      ],
    },
  ],
};
