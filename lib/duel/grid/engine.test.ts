import { afterEach, describe, expect, it } from 'vitest';
import { allCards, getCard } from '../catalog';
import { starterDeck } from '../deck';
import { gridCard } from './cards';
import { Rng } from '../rng';
import type { Ability, CardDef, Element, Keyword } from '../types';
import { runGridBot } from './ai';
import { attackTargets, connectedNodes, deployTiles, flankBonus, hqArmour, moveOptions, nodeAt, nodeScore, scoringNodes, tileOf } from './board';
import { GRID, GRID_PRESETS, gridRulesFor } from './config';
import { applyGridAction, cardCost, createGrid, judgeGrid, legalGridActions, parseLayout } from './engine';
import { unitOrders } from './client';
import { LAYOUTS } from './layouts';
import { playGridGame } from './sim';
import type { GridAction, GridState, GridUnit, Side } from './types';
import { gridViewFor } from './view';

function card(slug: string, element: Element, power: number, health: number, keywords: Keyword[] = [], abilities: Ability[] = [], extra: Partial<CardDef> = {}): CardDef {
  return { slug, name: slug, tier: 'token', element, cost: 1, power, health, keywords, abilities, image: '', ...extra };
}

// Tier 'token' keeps the card's speed normal, so ranges are the element's own.
const DEFS: Record<string, CardDef> = Object.fromEntries([
  card('t-earth', 'earth', 3, 4),
  card('t-thunder', 'thunder', 3, 4),
  card('t-air', 'air', 3, 4),
  card('t-fire', 'fire', 3, 4),
  card('t-water', 'water', 3, 4),
  card('t-big', 'earth', 5, 9),
  card('t-guard', 'earth', 1, 8, ['guard']),
  card('t-ranged', 'thunder', 2, 3, ['ranged']),
  card('t-pierce', 'fire', 4, 5, ['pierce']),
  card('t-stealth', 'air', 2, 3, ['stealth']),
  card('t-drain', 'water', 3, 4, ['drain']),
  card('t-rush', 'thunder', 2, 2, ['rush']),
  card('t-frost', 'water', 1, 5, [], [{ when: 'move', name: 'Frost', cost: 2, target: 'enemy_unit', effects: [{ k: 'freeze', t: 'chosen' }] }]),
].map(d => [d.slug, d]));

const SNAPSHOT = structuredClone(GRID);
const PRESETS = structuredClone(GRID_PRESETS);
afterEach(() => {
  Object.assign(GRID, structuredClone(SNAPSHOT));
  for (const k of [5, 7] as const) GRID_PRESETS[k] = structuredClone(PRESETS[k]);
});

/** The knobs these tests assume, whatever the shipped defaults are. */
function baseline() {
  Object.assign(GRID, {
    hqHp: 20, hqFire: 0, hqFireRamp: 0, hqAura: 0, hqHealShare: 1, hqReach: 1, armourPerNode: 1, armourMin: 1, orders: 3, firstOrders: 2,
    flank: 1, flankCap: 3, retaliation: true, adjacency: 8, rangedReach: 2, braceTaken: 0.5, braceOrders: 1, pierceShare: 1,
    surround: false, contested: false, maxUnits: 0, perks: false, rally: 0, catchUp: 0, movement: 'element', speed: true,
    range: { earth: 1, thunder: 3, air: 2, fire: 2, water: 3 }, effectRange: 0, turnLimit: 12,
    autoBrace: 'off', autoBraceTaken: 0.5, airStep: 0, setbackOn: 'off', setbackOrders: 0, setbackEmeralds: 0, setbackDiscount: 0, setbackHq: 3,
    abilityAttack: false, reinforceDiscount: 0, reinforceGap: 1, reinforceReady: false, outnumbered: 0, lastStand: 0, hqFireReach: 1, hqFireShots: 1,
    scoreTarget: 0, scoreNode: 1, scoreCity: 1, scoreFar: 1, scoreConnected: true, scoreWhen: 'start', scoreHq: 0, scoreRamp: 0, scoreBehind: 0,
    objectiveEvery: 0, objectiveWarn: 2, objectiveBonus: 1, objectiveFirst: 3, armourGrowth: 0, claimAdjacent: false, nodeIncome: 1,
  });
}

/** Rows: '.' plain, 'm' mountain, '~' water, 'n' node, 'c' city, 'H' HQ (top row = side 1). */
function board(rows: string[] = OPEN): GridState {
  baseline();
  const deck = Array(20).fill('t-earth');
  const s = createGrid(7, [{ name: 'A', avatar: '', deck }, { name: 'B', avatar: '', deck }], DEFS, { size: 7, layout: 'Crossroads' });
  const b = parseLayout({ name: 'test', rows });
  Object.assign(s, { width: b.width, height: b.height, terrain: b.terrain, hq: b.hq, layout: 'test' });
  s.nodes = b.nodes.map((x, i) => ({ tile: x.tile, name: `Node ${i}`, city: x.city, resource: null, owner: null }));
  Object.assign(s, { phase: 'main', turn: 5, first: 0, active: 0, ordersLeft: 3, units: [], log: [] });
  for (const p of s.players) { p.hand = []; p.emeralds = 8; p.mulliganed = true; }
  return s;
}

const OPEN = ['...H...', '.......', '.......', '.......', '.......', '.......', '...H...'];
let n = 1000;
function put(s: GridState, side: Side, x: number, y: number, slug: string, patch: Partial<GridUnit> = {}): GridUnit {
  const d = DEFS[slug];
  const u: GridUnit = {
    uid: `u${n++}`, slug, side, element: d.element, tile: tileOf(s, x, y), power: d.power, health: d.health, maxHealth: d.health,
    keywords: d.keywords, speed: 0, shield: d.keywords.includes('shield'), stealth: d.keywords.includes('stealth'),
    frozenUntil: 0, acted: false, fresh: false, bracedUntil: 0, aura: 0, boost: 0, ...patch,
  };
  s.units.push(u);
  return u;
}
const at = (s: GridState, x: number, y: number) => tileOf(s, x, y);
const sorted = (xs: number[]) => xs.slice().sort((a, b) => a - b);
const dests = (s: GridState, u: GridUnit) => sorted(moveOptions(s, u).map(m => m.to));
const act = (s: GridState, a: GridAction, side: Side = s.active) => applyGridAction(s, side, a);
const unit = (s: GridState, uid: string) => s.units.find(u => u.uid === uid);
const endTurn = (s: GridState) => act(s, { type: 'end_turn' });

describe('grid: layouts and setup', () => {
  it('every layout is point-symmetric, with the HQs centred on the back rows', () => {
    for (const size of [5, 7] as const) {
      for (const l of LAYOUTS[size]) {
        expect(l.rows).toHaveLength(size);
        const flat = l.rows.join('');
        for (let i = 0; i < flat.length; i++) expect(flat[flat.length - 1 - i], `${l.name} tile ${i}`).toBe(flat[i]);
        const b = parseLayout(l);
        expect(b.hq).toEqual([size * size - 1 - (size - 1) / 2, (size - 1) / 2]);
        expect(b.nodes.filter(x => x.city)).toHaveLength(1);
        expect(b.nodes.length).toBe(size === 7 ? 5 : 3);
      }
    }
  });

  it('names nodes after real territories; mirrored nodes share a resource', () => {
    for (const size of [5, 7] as const) {
      const s = createGrid(3, [{ name: 'A', avatar: '', deck: starterDeck('fire') }, { name: 'B', avatar: '', deck: starterDeck('earth') }], undefined, { size });
      expect(new Set(s.nodes.map(x => x.name)).size).toBe(s.nodes.length);
      expect(s.nodes.find(x => x.city)!.tile).toBe((size * size - 1) / 2);
      for (const x of s.nodes) expect(s.nodes.find(y => y.tile === size * size - 1 - x.tile)!.resource).toBe(x.resource);
    }
  });

  it('first-player compensation: the second player gets an emerald, the first fewer orders on turn 1', () => {
    let s = createGrid(11, [{ name: 'A', avatar: '', deck: starterDeck('water') }, { name: 'B', avatar: '', deck: starterDeck('air') }]);
    expect(s.players.map(p => p.hand.length)).toEqual([GRID.startHand, GRID.startHand]);
    const second: Side = s.first === 0 ? 1 : 0;
    expect(s.players[second].emeralds).toBe(GRID.startEmeralds + GRID.secondBonus);
    expect(s.players[s.first].emeralds).toBe(GRID.startEmeralds);
    s = act(act(s, { type: 'mulligan', replace: [] }, 0), { type: 'mulligan', replace: [] }, 1);
    expect(s.phase).toBe('main');
    expect(s.active).toBe(s.first);
    expect(s.ordersLeft).toBe(GRID.firstOrders);
    expect(s.players[s.first].hand).toHaveLength(GRID.startHand); // no draw on turn 1
    s = endTurn(s);
    expect(s.active).toBe(second);
    expect(s.ordersLeft).toBe(GRID.orders);
    expect(s.players[second].hand).toHaveLength(GRID.startHand + GRID.draw);
  });

  it('prices cards from its own coefficients, keeping cost and kit, without touching the live catalog', () => {
    const before = JSON.stringify(getCard('orphion'));
    const all = allCards().map(c => c.slug);
    let sameKit = 0;
    for (const slug of all) {
      const g = gridCard(slug)!;
      const d = getCard(slug)!;
      expect([g.cost, g.tier, g.element]).toEqual([d.cost, d.tier, d.element]);
      // A kit roll that no longer fits the budget is re-rolled, so some kits differ (8% with the
      // grid-1 prices, plus the two war signatures): a Warfront UI shows gridCard(), not getCard().
      if (g.keywords.join() === d.keywords.join() && g.abilities.map(a => a.name).join() === d.abilities.map(a => a.name).join()) sameKit++;
    }
    expect(sameKit / all.length).toBeGreaterThan(0.9);
    expect(JSON.stringify(getCard('orphion'))).toBe(before);
    expect(allCards().map(c => c.slug)).toEqual(all);
  });

  it('hides the opponent hand and both decks; the board is public', () => {
    const s = createGrid(5, [{ name: 'A', avatar: '', deck: starterDeck('fire') }, { name: 'B', avatar: '', deck: starterDeck('earth') }]);
    const v = gridViewFor(s, 0);
    expect(v.players[0].hand).toHaveLength(GRID.startHand);
    expect(v.players[1].hand).toBeUndefined();
    expect(v.players[1].handCount).toBe(GRID.startHand);
    const json = JSON.stringify(v);
    expect(json).not.toContain('"deck"');
    expect(json).not.toContain('"rng"');
    for (const h of s.players[1].hand) expect(json).not.toContain(`"${h.uid}"`);
    expect(v.nodes).toEqual(s.nodes);
  });
});

describe('grid: movement', () => {
  it('earth: one step in any of 8 directions', () => {
    const s = board();
    expect(dests(s, put(s, 0, 3, 3, 't-earth'))).toHaveLength(8);
  });

  it('thunder: a straight orthogonal line, blocked by units, mountains and HQs', () => {
    const s = board(['...H...', '.......', '...m...', '.......', '.......', '.......', '...H...']);
    const u = put(s, 0, 3, 4, 't-thunder');
    put(s, 0, 5, 4, 't-earth');
    expect(dests(s, u)).toEqual(sorted([at(s, 3, 3), at(s, 0, 4), at(s, 1, 4), at(s, 2, 4), at(s, 4, 4), at(s, 3, 5)]));
  });

  it('air: diagonals up to 2, flying over units and mountains, landing only on empty tiles', () => {
    const s = board(['...H...', '.......', '....m..', '.......', '.......', '.......', '...H...']);
    const u = put(s, 0, 3, 3, 't-air');
    put(s, 1, 2, 2, 't-earth');
    const d = dests(s, u);
    expect(d).toContain(at(s, 1, 1));
    expect(d).toContain(at(s, 5, 1));
    expect(d).not.toContain(at(s, 2, 2));
    expect(d).not.toContain(at(s, 4, 2));
    expect(d).not.toContain(at(s, 3, 2));
    expect(d).toHaveLength(6);
  });

  it('fire: up to 2 king steps', () => {
    const s = board();
    expect(dests(s, put(s, 0, 3, 3, 't-fire'))).toHaveLength(24);
  });

  it('water: one step, or a run along water tiles; entering water ends any other move', () => {
    const s = board(['...H...', '.......', '.......', '~~~~...', '.......', '.......', '...H...']);
    const w = put(s, 0, 4, 3, 't-water');
    const d = dests(s, w);
    expect(d).toContain(at(s, 2, 3)); // two tiles along the river
    expect(d).toContain(at(s, 1, 2)); // and one step off it as the run's last step
    expect(d).not.toContain(at(s, 0, 3)); // four steps
    const f = put(s, 0, 4, 4, 't-fire');
    const fd = dests(s, f);
    expect(fd).toContain(at(s, 3, 3));
    expect(fd).not.toContain(at(s, 2, 2)); // its only two-step path runs through the water at (3,3)
  });

  it('card speed moves the range by one, never below 1', () => {
    const s = board();
    expect(dests(s, put(s, 0, 0, 3, 't-thunder', { speed: 1 }))).toContain(at(s, 4, 3));
    expect(dests(s, put(s, 0, 6, 1, 't-thunder'))).not.toContain(at(s, 2, 1));
    expect(dests(s, put(s, 0, 0, 0, 't-earth', { speed: -1 }))).toHaveLength(3);
  });

  it('the uniform control moves everyone up to 2 steps orthogonally', () => {
    const s = board();
    GRID.movement = 'uniform';
    const e = put(s, 0, 5, 5, 't-air');
    expect(dests(s, e)).toEqual(sorted([at(s, 5, 3), at(s, 4, 4), at(s, 5, 4), at(s, 6, 4), at(s, 3, 5), at(s, 4, 5), at(s, 6, 5), at(s, 4, 6), at(s, 5, 6), at(s, 6, 6)]));
  });

  it('Guard: moving next to an enemy Guard ends the move', () => {
    const s = board();
    put(s, 1, 3, 2, 't-guard');
    const t = put(s, 0, 3, 5, 't-thunder');
    const stop = moveOptions(s, t).find(x => x.to === at(s, 3, 3));
    expect(stop?.stopped).toBe(true);
    expect(dests(s, t)).not.toContain(at(s, 3, 1));
    const f = put(s, 0, 1, 3, 't-fire');
    expect(dests(s, f)).toContain(at(s, 2, 2));
    expect(dests(s, f)).not.toContain(at(s, 3, 1));
  });
});

describe('grid: orders and combat', () => {
  it('an order is a move then an attack; a unit acts once; three orders a turn', () => {
    let s = board();
    const a = put(s, 0, 3, 4, 't-earth');
    const foe = put(s, 1, 3, 2, 't-guard');
    s = act(s, { type: 'move', uid: a.uid, to: at(s, 3, 3) });
    expect(s.ordersLeft).toBe(2);
    expect(s.pending).toBe(a.uid);
    s = act(s, { type: 'attack', uid: a.uid, target: foe.tile });
    expect(s.ordersLeft).toBe(2);
    expect(unit(s, foe.uid)!.health).toBe(5);
    expect(unit(s, a.uid)!.health).toBe(3); // struck back for 1
    expect(() => act(s, { type: 'move', uid: a.uid, to: at(s, 2, 3) })).toThrow(/already acted/);
    const b = put(s, 0, 0, 6, 't-earth'), c = put(s, 0, 6, 6, 't-earth'), d = put(s, 0, 1, 6, 't-earth');
    s = act(s, { type: 'move', uid: b.uid, to: at(s, 0, 5) });
    s = act(s, { type: 'move', uid: c.uid, to: at(s, 6, 5) });
    expect(s.ordersLeft).toBe(0);
    expect(() => act(s, { type: 'move', uid: d.uid, to: at(s, 1, 5) })).toThrow(/No orders left/);
    const log = s.log.filter(e => e.k === 'move');
    expect(log[0]).toMatchObject({ k: 'move', from: at(s, 3, 4), to: at(s, 3, 3), path: [at(s, 3, 3)] });
  });

  it('melee defenders that survive strike back; Ranged attackers are never struck back', () => {
    let s = board();
    const a = put(s, 0, 3, 3, 't-earth');
    const d = put(s, 1, 3, 2, 't-big');
    s = act(s, { type: 'attack', uid: a.uid, target: d.tile });
    expect(unit(s, d.uid)!.health).toBe(6);
    expect(unit(s, a.uid)).toBeUndefined(); // 5 back, 4 health
    expect(s.log.some(e => e.k === 'retaliate')).toBe(true);
    expect(s.log.find(e => e.k === 'death')).toMatchObject({ uid: a.uid, tile: at(s, 3, 3) });
    const r = put(s, 0, 3, 4, 't-ranged');
    s = act(s, { type: 'attack', uid: r.uid, target: d.tile });
    expect(unit(s, d.uid)!.health).toBe(4);
    expect(unit(s, r.uid)!.health).toBe(3);
    // A Ranged defender does not strike back either.
    const m = put(s, 0, 5, 5, 't-earth');
    const rd = put(s, 1, 5, 4, 't-ranged', { health: 9 });
    s = act(s, { type: 'attack', uid: m.uid, target: rd.tile });
    expect(unit(s, m.uid)!.health).toBe(4);
    GRID.retaliation = false;
  });

  it('Ranged needs a clear straight line up to 2 tiles', () => {
    const s = board(['...H...', '.......', '.......', '.......', '.....m.', '.......', '...H...']);
    const r = put(s, 0, 3, 5, 't-ranged');
    const far = put(s, 1, 3, 3, 't-earth');
    put(s, 1, 0, 3, 't-earth');
    const knight = put(s, 1, 4, 3, 't-earth');
    expect(attackTargets(s, r, r.tile).map(t => t.tile)).toEqual([far.tile]);
    put(s, 0, 3, 4, 't-earth');
    expect(attackTargets(s, r, r.tile)).toHaveLength(0);
    // From (5,5) the mountain at (5,4) blocks the line to (5,3).
    const r2 = put(s, 0, 6, 5, 't-ranged');
    put(s, 1, 6, 3, 't-earth');
    expect(attackTargets(s, r2, at(s, 5, 5)).map(t => t.tile)).not.toContain(at(s, 5, 3));
    void knight;
  });

  it('flanking: +1 per other friendly unit next to the target (and off as a control)', () => {
    let s = board();
    const a = put(s, 0, 3, 4, 't-earth');
    const t = put(s, 1, 3, 3, 't-big');
    put(s, 0, 2, 3, 't-earth');
    put(s, 0, 4, 2, 't-earth');
    expect(flankBonus(s, 0, a.uid, t.tile)).toBe(2);
    s = act(s, { type: 'attack', uid: a.uid, target: t.tile });
    expect(unit(s, t.uid)!.health).toBe(4);
    expect(s.log.find(e => e.k === 'attack')).toMatchObject({ flank: 2 });
    GRID.flank = 0;
    expect(flankBonus(s, 0, a.uid, t.tile)).toBe(0);
  });

  it('Pierce also hits the enemy straight behind the target', () => {
    let s = board();
    const p = put(s, 0, 3, 4, 't-pierce');
    const front = put(s, 1, 3, 3, 't-big');
    const back = put(s, 1, 3, 2, 't-big');
    const side = put(s, 1, 4, 2, 't-big');
    s = act(s, { type: 'attack', uid: p.uid, target: front.tile });
    expect(unit(s, front.uid)!.health).toBe(5);
    expect(unit(s, back.uid)!.health).toBe(5);
    expect(unit(s, side.uid)!.health).toBe(9);
    expect(s.log.some(e => e.k === 'pierce')).toBe(true);
  });

  it('Brace halves damage until its side\'s next turn, and everyone can see it', () => {
    let s = board();
    const b = put(s, 0, 3, 3, 't-big');
    s = act(s, { type: 'brace', uid: b.uid });
    expect(unit(s, b.uid)!.bracedUntil).toBe(s.turn + 1);
    expect(gridViewFor(s, 1).units.find(u => u.uid === b.uid)!.bracedUntil).toBe(s.turn + 1);
    s = endTurn(s);
    const a = put(s, 1, 3, 2, 't-big');
    s = act(s, { type: 'attack', uid: a.uid, target: b.tile });
    expect(unit(s, b.uid)!.health).toBe(7); // floor(5 / 2)
    expect(s.log.find(e => e.k === 'damage' && e.braced)).toBeTruthy();
    s = endTurn(s);
    expect(unit(s, b.uid)!.bracedUntil).toBeLessThan(s.turn);
  });

  it('Stealth cannot be targeted until it attacks or an enemy ends a move next to it', () => {
    let s = board();
    const st = put(s, 1, 3, 2, 't-stealth');
    const a = put(s, 0, 3, 4, 't-earth');
    expect(attackTargets(s, a, at(s, 3, 3))).toHaveLength(0);
    s = act(s, { type: 'move', uid: a.uid, to: at(s, 3, 3) });
    expect(unit(s, st.uid)!.stealth).toBe(false);
    expect(s.log.some(e => e.k === 'reveal' && e.uid === st.uid)).toBe(true);
    s = act(s, { type: 'attack', uid: a.uid, target: st.tile });
    expect(unit(s, st.uid)).toBeUndefined();
  });

  it('units cannot act the turn they arrive, unless they have Rush; deploying costs emeralds, not orders', () => {
    let s = board();
    s.players[0].hand = [{ uid: 'h1', slug: 't-earth' }, { uid: 'h2', slug: 't-rush' }];
    s = act(s, { type: 'deploy', uid: 'h1', tile: at(s, 2, 6) });
    expect(s.ordersLeft).toBe(3);
    expect(s.players[0].emeralds).toBe(8 - 1);
    expect(() => act(s, { type: 'move', uid: 'h1', to: at(s, 2, 5) })).toThrow(/arrive/);
    s = act(s, { type: 'deploy', uid: 'h2', tile: at(s, 4, 6) });
    s = act(s, { type: 'move', uid: 'h2', to: at(s, 4, 3) });
    expect(unit(s, 'h2')!.tile).toBe(at(s, 4, 3));
  });

  it('freeze: a frozen unit cannot act through its next turn, and does not strike back meanwhile', () => {
    let s = board();
    const f = put(s, 0, 3, 4, 't-frost');
    const foe = put(s, 1, 3, 2, 't-big');
    s = act(s, { type: 'ability', uid: f.uid, target: foe.tile });
    expect(s.players[0].emeralds).toBe(8 - 2);
    const e = put(s, 0, 2, 3, 't-earth');
    s = act(s, { type: 'attack', uid: e.uid, target: foe.tile });
    expect(unit(s, e.uid)!.health).toBe(4);
    s = endTurn(s);
    expect(() => act(s, { type: 'move', uid: foe.uid, to: at(s, 3, 1) })).toThrow(/frozen/);
    s = endTurn(s);
    s = endTurn(s);
    s = act(s, { type: 'move', uid: foe.uid, to: at(s, 3, 1) });
    expect(unit(s, foe.uid)!.tile).toBe(at(s, 3, 1));
  });
});

describe('grid: nodes, connection and the HQ', () => {
  const NODES = ['...H...', '.......', '...n...', '.......', '..n....', '..n....', '...H...'];

  it('a node is claimed by ending your turn on it with no enemy next to it, and held until the enemy does the same', () => {
    let s = board(NODES);
    const u = put(s, 0, 2, 5, 't-earth');
    const x = put(s, 0, 2, 4, 't-earth');
    put(s, 1, 3, 3, 't-earth');
    s = endTurn(s);
    expect(s.nodes.find(nd => nd.tile === u.tile)!.owner).toBe(0);
    expect(s.nodes.find(nd => nd.tile === x.tile)!.owner).toBeNull(); // an enemy is next to it
    expect(s.log.some(e => e.k === 'claim' && e.tile === u.tile)).toBe(true);
    s = endTurn(s);
    s.units = s.units.filter(v => v.uid !== u.uid);
    s = endTurn(s);
    expect(s.nodes.find(nd => nd.tile === at(s, 2, 5))!.owner).toBe(0);
  });

  it('connection runs through orthogonal chains of your units and nodes; cutting the chain disconnects', () => {
    let s = board(NODES);
    s.nodes.forEach(nd => { if (nd.tile !== at(s, 3, 2)) nd.owner = 0; });
    expect(connectedNodes(s, 0)).toEqual([]); // the HQ touches (2,5) only diagonally
    // HQ (3,6) -> (2,6) unit -> (2,5) node -> (2,4) node.
    const link = put(s, 0, 2, 6, 't-earth');
    expect(connectedNodes(s, 0)).toEqual(sorted([at(s, 2, 4), at(s, 2, 5)]));
    expect(hqArmour(s, 0)).toBe(2 * GRID.armourPerNode);
    // An enemy standing on (2,5) cuts (2,4) off, and (2,5) does not count while occupied.
    const raider = put(s, 1, 2, 5, 't-earth');
    expect(connectedNodes(s, 0)).toEqual([]);
    s.units = s.units.filter(v => v.uid !== raider.uid);
    // Killing the link cuts both, and the log says so.
    const killer = put(s, 1, 1, 5, 't-big');
    s = endTurn(s);
    s = act(s, { type: 'attack', uid: killer.uid, target: link.tile });
    expect(unit(s, link.uid)).toBeUndefined();
    expect(connectedNodes(s, 0)).toEqual([]);
    expect(s.log.find(e => e.k === 'connection' && e.side === 0)).toMatchObject({ nodes: [] });
  });

  it('HQ armour: each connected node takes 1 off every hit on the HQ, never below armourMin', () => {
    let s = board(['...H...', '...n...', '.......', '.......', '.......', '.......', '...H...']);
    GRID.flank = 0; // flanking adds to HQ hits too
    const a = put(s, 0, 2, 1, 't-big');
    s = act(s, { type: 'attack', uid: a.uid, target: s.hq[1] });
    expect(s.players[1].hp).toBe(15);
    s.nodes[0].owner = 1; // (3,1) touches side 1's HQ orthogonally
    expect(connectedNodes(s, 1)).toEqual([at(s, 3, 1)]);
    const b = put(s, 0, 4, 1, 't-earth');
    s = act(s, { type: 'attack', uid: b.uid, target: s.hq[1] });
    expect(s.players[1].hp).toBe(13);
    expect(s.log.filter(e => e.k === 'damage' && 'hq' in e.target).pop()).toMatchObject({ n: 2, armour: 1 });
    GRID.armourPerNode = 5;
    const c = put(s, 0, 2, 0, 't-earth');
    s = act(s, { type: 'attack', uid: c.uid, target: s.hq[1] });
    expect(s.players[1].hp).toBe(13 - GRID.armourMin);
  });

  it('the HQ fires at an adjacent enemy at the start of its turn, preferring one it can kill', () => {
    let s = board();
    GRID.hqFire = 2;
    const weak = put(s, 1, 2, 5, 't-earth', { health: 2 });
    const strong = put(s, 1, 4, 5, 't-big');
    s = endTurn(s);
    s = endTurn(s);
    expect(unit(s, weak.uid)).toBeUndefined();
    expect(unit(s, strong.uid)!.health).toBe(9);
    expect(s.log.find(e => e.k === 'hqfire')).toMatchObject({ side: 0, target: weak.uid });
  });

  it('with hqReach 2 an HQ can be attacked from two tiles away', () => {
    const s = board();
    const a = put(s, 0, 3, 2, 't-earth');
    expect(attackTargets(s, a, a.tile).some(t => t.hq === 1)).toBe(false);
    GRID.hqReach = 2;
    expect(attackTargets(s, a, a.tile)).toContainEqual({ tile: s.hq[1], hq: 1 });
  });

  it('deploy zones: the back row, tiles next to a connected node, and never next to an enemy when contested', () => {
    const s = board(['...H...', '.......', '.......', '.......', '...n...', '...n...', '...H...']);
    expect(deployTiles(s, 0).map(d => d.tile)).toEqual([0, 1, 2, 4, 5, 6].map(x => at(s, x, 6)));
    s.nodes.forEach(nd => { nd.owner = 0; });
    const all = deployTiles(s, 0);
    expect(all.filter(d => d.forward).map(d => d.tile)).toContain(at(s, 3, 3));
    expect(all.find(d => d.tile === at(s, 2, 6))!.forward).toBe(false);
    put(s, 1, 1, 5, 't-earth');
    GRID.contested = true;
    const now = deployTiles(s, 0).map(d => d.tile);
    expect(now).not.toContain(at(s, 0, 6));
    expect(now).not.toContain(at(s, 2, 4));
    expect(now).toContain(at(s, 4, 6));
  });

  it('the turn limit is judged on connected nodes, then HQ health, then a draw', () => {
    let s = board(['...H...', '.......', '.......', '.......', '.......', '...n...', '...H...']);
    GRID.turnLimit = 3;
    s.nodes[0].owner = 0;
    s.players[0].hp = 3;
    s = endTurn(s);
    expect(s.phase).toBe('main');
    s = endTurn(s);
    expect(s.phase).toBe('over');
    expect(s.endReason).toBe('turn_limit');
    expect(s.winner).toBe(0);
    const t = board();
    t.players[1].hp = 7;
    expect(judgeGrid(t)).toBe(0);
    t.players[1].hp = 20;
    expect(judgeGrid(t)).toBeNull();
  });

  it('destroying the enemy HQ wins at once', () => {
    let s = board();
    s.players[1].hp = 2;
    const a = put(s, 0, 3, 1, 't-earth');
    s = act(s, { type: 'attack', uid: a.uid, target: s.hq[1] });
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(0);
    expect(s.endReason).toBe('hq');
  });

  it('Drain heals your HQ by the damage it deals (scaled by hqHealShare)', () => {
    let s = board();
    s.players[0].hp = 10;
    const d = put(s, 0, 3, 3, 't-drain');
    const foe = put(s, 1, 3, 2, 't-big');
    s = act(s, { type: 'attack', uid: d.uid, target: foe.tile });
    expect(s.players[0].hp).toBe(13);
    GRID.hqHealShare = 0;
    const d2 = put(s, 0, 2, 3, 't-drain');
    s = act(s, { type: 'attack', uid: d2.uid, target: foe.tile });
    expect(s.players[0].hp).toBe(13);
  });

  it('surround capture (a control, off by default): no free orthogonal neighbour, destroyed at the end of the enemy turn', () => {
    let s = board();
    GRID.surround = true;
    const v = put(s, 1, 0, 3, 't-big');
    put(s, 0, 0, 2, 't-earth');
    put(s, 0, 0, 4, 't-earth');
    put(s, 0, 1, 3, 't-earth');
    s = endTurn(s);
    expect(unit(s, v.uid)).toBeUndefined();
    expect(s.log.find(e => e.k === 'death' && e.uid === v.uid)).toMatchObject({ captured: true });
  });

  it('the unit cap closes the deploy zone', () => {
    const s = board();
    GRID.maxUnits = 2;
    put(s, 0, 0, 3, 't-earth');
    expect(deployTiles(s, 0).length).toBeGreaterThan(0);
    put(s, 0, 1, 3, 't-earth');
    expect(deployTiles(s, 0)).toEqual([]);
  });
});

describe('grid: whole games', () => {
  it('every listed legal action applies, and random legal play always reaches an end', () => {
    for (let g = 0; g < 6; g++) {
      const rng = new Rng(100 + g);
      let s = createGrid(200 + g, [{ name: 'A', avatar: '', deck: starterDeck('fire') }, { name: 'B', avatar: '', deck: starterDeck('water') }], undefined, { size: g % 2 ? 5 : 7 });
      s = act(act(s, { type: 'mulligan', replace: [] }, 0), { type: 'mulligan', replace: [] }, 1);
      for (let i = 0; i < 3000 && s.phase === 'main'; i++) {
        const legal = legalGridActions(s, s.active);
        expect(legal.length).toBeGreaterThan(0);
        s = act(s, rng.float() < 0.15 ? { type: 'end_turn' } : rng.pick(legal));
      }
      expect(s.phase).toBe('over');
    }
  });

  it('bot games finish on both boards, in every mode, and log a replayable story', () => {
    for (const size of [7, 5] as const) {
      const r = playGridGame(starterDeck('earth'), starterDeck('air'), 5, { grid: { size }, trace: true });
      expect(['hero', 'turn_limit']).toContain(r.reason);
      expect(r.turns).toBeLessThanOrEqual(2 * gridRulesFor(size).turnLimit);
      expect(r.trace!.leads.length).toBe(r.turns);
      const g = playGridGame(starterDeck('fire'), starterDeck('thunder'), 6, { grid: { size }, bots: [{ mode: 'greedy' }, { mode: 'random' }] });
      expect(['hero', 'turn_limit']).toContain(g.reason);
    }
    let s = createGrid(9, [{ name: 'A', avatar: '', deck: starterDeck('fire') }, { name: 'B', avatar: '', deck: starterDeck('earth') }]);
    s = act(act(s, { type: 'mulligan', replace: [] }, 0), { type: 'mulligan', replace: [] }, 1);
    for (let i = 0; i < 40 && s.phase === 'main'; i++) s = runGridBot(s, s.active);
    const kinds = new Set<string>(s.log.map(e => e.k));
    for (const k of ['turn', 'income', 'deploy', 'move', 'attack', 'damage', 'end_turn']) expect(kinds.has(k)).toBe(true);
    for (const e of s.log) if (e.k === 'move') expect(e.path[e.path.length - 1]).toBe(e.to);
  });
});

describe('grid: v2 rules', () => {
  it('airStep: Air also walks orthogonally (blocked like anyone), keeping its diagonal flight', () => {
    const s = board(['...H...', '.......', '.......', '...m...', '.......', '.......', '...H...']);
    const a = put(s, 0, 3, 4, 't-air');
    expect(dests(s, a)).not.toContain(at(s, 3, 5));
    GRID.airStep = 1;
    const d = dests(s, a);
    expect(d).toContain(at(s, 3, 5));
    expect(d).toContain(at(s, 2, 4));
    expect(d).not.toContain(at(s, 3, 3)); // the mountain blocks a walk
    expect(d).toContain(at(s, 1, 2)); // flight still goes 2 diagonally
    expect(moveOptions(s, a).find(m => m.to === at(s, 4, 4))!.path).toEqual([at(s, 4, 4)]);
  });

  it("autoBrace 'idle': units that did not act end the turn braced, for free and in the open", () => {
    let s = board();
    GRID.autoBrace = 'idle';
    const idle = put(s, 0, 1, 4, 't-earth');
    const mover = put(s, 0, 5, 4, 't-earth');
    const fresh = put(s, 0, 0, 6, 't-earth', { fresh: true });
    s = act(s, { type: 'move', uid: mover.uid, to: at(s, 5, 3) });
    // A brace in place costs no order while the stance is free.
    const other = put(s, 0, 3, 3, 't-earth');
    s = act(s, { type: 'brace', uid: other.uid });
    expect(s.ordersLeft).toBe(2);
    s = endTurn(s);
    expect(unit(s, idle.uid)!.bracedUntil).toBe(s.turn);
    expect(unit(s, fresh.uid)!.bracedUntil).toBe(s.turn);
    expect(unit(s, mover.uid)!.bracedUntil).toBe(0);
    const autos = s.log.filter(e => e.k === 'brace' && e.auto).map(e => (e as { uid: string }).uid).sort();
    expect(autos).toEqual([idle.uid, fresh.uid].sort());
    // The enemy's hit is halved.
    const foe = put(s, 1, 1, 3, 't-big');
    s = act(s, { type: 'attack', uid: foe.uid, target: unit(s, idle.uid)!.tile });
    expect(unit(s, idle.uid)!.health).toBe(4 - 2);
  });

  it("autoBrace 'passive': a unit that only moved braces too; one that attacked does not", () => {
    let s = board();
    GRID.autoBrace = 'passive';
    const mover = put(s, 0, 5, 4, 't-earth');
    const fighter = put(s, 0, 3, 3, 't-earth');
    const foe = put(s, 1, 3, 2, 't-guard');
    s = act(s, { type: 'move', uid: mover.uid, to: at(s, 5, 3) });
    s = act(s, { type: 'attack', uid: fighter.uid, target: foe.tile });
    s = endTurn(s);
    expect(unit(s, mover.uid)!.bracedUntil).toBe(s.turn);
    expect(unit(s, fighter.uid)!.bracedUntil).toBe(0);
    // Tracking resets at the owner's next turn.
    s = endTurn(s);
    expect(unit(s, fighter.uid)!.fought).toBeUndefined();
  });

  it('setback: losing a connected node on the enemy turn gives extra orders, emeralds and cheaper deploys next turn', () => {
    let s = board(['...H...', '.......', '.......', '.......', '.......', '...n...', '...H...']);
    Object.assign(GRID, { setbackOn: 'node', setbackOrders: 1, setbackEmeralds: 2, setbackDiscount: 1, perks: false, catchUp: 0, incomeStep: 0 });
    s.nodes[0].owner = 0;
    expect(connectedNodes(s, 0)).toEqual([at(s, 3, 5)]);
    s = endTurn(s); // side 0 marks 1 connected node
    expect(s.marks![0]).toEqual({ nodes: 1, hp: s.players[0].hp });
    const raider = put(s, 1, 3, 4, 't-earth');
    s = act(s, { type: 'move', uid: raider.uid, to: at(s, 3, 5) }, 1);
    s.players[0].emeralds = 0;
    s = endTurn(s);
    expect(s.active).toBe(0);
    expect(s.ordersLeft).toBe(GRID.orders + 1);
    expect(s.setback).toBe(true);
    expect(s.log.find(e => e.k === 'setback')).toMatchObject({ side: 0, reason: 'node', orders: 1, emeralds: 2, discount: 1 });
    expect(s.players[0].emeralds).toBe(GRID.income + 2);
    s.extraDefs = { ...s.extraDefs, 't-big': { ...DEFS['t-big'], cost: 5 } };
    expect(cardCost(s, 't-big', 0)).toBe(Math.ceil(0.6 * 5 - 1e-9) - 1);
    expect(cardCost(s, 't-big', 1)).toBe(Math.ceil(0.6 * 5 - 1e-9));
    s = endTurn(s);
    expect(s.setback).toBeUndefined();
    // No new loss: the next turn is normal.
    s = endTurn(s);
    expect(s.ordersLeft).toBe(GRID.orders);
    expect(s.log.filter(e => e.k === 'setback')).toHaveLength(1);
  });

  it('setback on HQ damage: at least setbackHq taken since your last turn', () => {
    let s = board();
    Object.assign(GRID, { setbackOn: 'hq', setbackHq: 3, setbackOrders: 1, flank: 0 });
    s = endTurn(s);
    const a = put(s, 1, 3, 5, 't-earth');
    s = act(s, { type: 'attack', uid: a.uid, target: s.hq[0] }, 1);
    s = endTurn(s);
    expect(s.ordersLeft).toBe(GRID.orders + 1);
    expect(s.log.find(e => e.k === 'setback')).toMatchObject({ reason: 'hq' });
  });

  it('size presets: a 5x5 game stores its whole config and plays by it; 7x7 reads GRID', () => {
    GRID_PRESETS[5] = { hqReach: 1, turnLimit: 9 };
    const deck = starterDeck('fire');
    const s = createGrid(4, [{ name: 'A', avatar: '', deck }, { name: 'B', avatar: '', deck }], undefined, { size: 5 });
    expect(s.cfg).toMatchObject({ size: 5, hqReach: 1, turnLimit: 9, hqHp: GRID.hqHp });
    expect(gridViewFor(s, 0).cfg).toEqual(s.cfg);
    GRID.hqReach = 3;
    // A unit two tiles from the enemy HQ cannot siege under the stored preset.
    const t: GridState = { ...s, phase: 'main', turn: 3, active: 0, ordersLeft: 3, units: [] };
    const hx = t.hq[1] % t.width, hy = Math.floor(t.hq[1] / t.width);
    const u = put(t, 0, hx, hy + 2, 't-earth');
    t.extraDefs = DEFS;
    expect(attackTargets(t, u, u.tile).some(x => x.hq === 1)).toBe(false);
    expect(unitOrders(gridViewFor(t, 0), u.uid)!.attacks.some(x => x.hq === 1)).toBe(false);
    const seven = createGrid(4, [{ name: 'A', avatar: '', deck }, { name: 'B', avatar: '', deck }], undefined, { size: 7 });
    expect(seven.cfg).toBeUndefined();
  });
});

describe('grid: v2 comeback and order rules', () => {
  it('reinforcements: fewer units than the enemy makes cards cheaper (never below 1); reinforceReady lets them act', () => {
    let s = board();
    Object.assign(GRID, { reinforceDiscount: 3 });
    s.extraDefs = { ...s.extraDefs, 't-big': { ...DEFS['t-big'], cost: 7 } };
    const full = Math.ceil(0.6 * 7 - 1e-9);
    expect(cardCost(s, 't-big', 0)).toBe(full);
    put(s, 1, 0, 1, 't-earth');
    expect(cardCost(s, 't-big', 0)).toBe(full - 3);
    expect(cardCost(s, 't-big', 1)).toBe(full);
    expect(cardCost(s, 't-earth', 0)).toBe(1); // cost 1 card stays at 1
    GRID.reinforceGap = 2;
    expect(cardCost(s, 't-big', 0)).toBe(full);
    GRID.reinforceGap = 1;
    GRID.reinforceReady = true;
    s.players[0].hand = [{ uid: 'h1', slug: 't-earth' }];
    s = act(s, { type: 'deploy', uid: 'h1', tile: at(s, 0, 6) });
    expect(s.log.find(e => e.k === 'deploy')).toMatchObject({ ready: true });
    expect(unit(s, 'h1')!.fresh).toBe(false);
    s = act(s, { type: 'move', uid: 'h1', to: at(s, 0, 5) });
  });

  it('abilityAttack: a move ability leaves the order open for an attack, once a turn', () => {
    let s = board();
    GRID.abilityAttack = true;
    const f = put(s, 0, 3, 3, 't-frost');
    const foe = put(s, 1, 3, 2, 't-earth');
    s = act(s, { type: 'ability', uid: f.uid, target: foe.tile });
    expect(s.pending).toBe(f.uid);
    expect(s.ordersLeft).toBe(2);
    expect(() => act(s, { type: 'ability', uid: f.uid, target: foe.tile })).toThrow(/already used/);
    expect(legalGridActions(s, 0).some(a => a.type === 'ability' && a.uid === f.uid)).toBe(false);
    s = act(s, { type: 'attack', uid: f.uid, target: foe.tile });
    expect(unit(s, foe.uid)!.health).toBe(3); // frozen: no strike-back
    expect(unit(s, f.uid)!.health).toBe(5);
    expect(s.pending).toBeNull();
    GRID.abilityAttack = false;
    const g = put(s, 0, 4, 3, 't-frost');
    s = act(s, { type: 'ability', uid: g.uid, target: foe.tile });
    expect(s.pending).toBeNull();
  });

  it('outnumbered: fewer units on the board adds to every attack, HQ hits included', () => {
    let s = board();
    Object.assign(GRID, { outnumbered: 2, flank: 0 });
    const a = put(s, 0, 3, 3, 't-earth');
    const d = put(s, 1, 3, 2, 't-big');
    put(s, 1, 0, 0, 't-earth');
    s = act(s, { type: 'attack', uid: a.uid, target: d.tile });
    expect(unit(s, d.uid)!.health).toBe(9 - 5);
  });

  it('last stand: once a game the HQ at half health or less is repaired', () => {
    let s = board();
    Object.assign(GRID, { lastStand: 4, lastStandAt: 0.5 });
    s.players[1].hp = 9;
    s = endTurn(s);
    expect(s.players[1].hp).toBe(13);
    expect(s.log.find(e => e.k === 'laststand')).toMatchObject({ side: 1, n: 4, hp: 13 });
    s.players[1].hp = 5;
    s = endTurn(s);
    s = endTurn(s);
    expect(s.players[1].hp).toBe(5);
  });

  it('HQ fire reach and shots: several enemies in reach are hit', () => {
    let s = board();
    Object.assign(GRID, { hqFire: 2, hqFireReach: 2, hqFireShots: 2 });
    const a = put(s, 1, 3, 4, 't-earth');
    const b = put(s, 1, 1, 5, 't-earth');
    const c = put(s, 1, 0, 3, 't-earth');
    s = endTurn(s);
    s = endTurn(s);
    expect(unit(s, a.uid)!.health).toBe(2);
    expect(unit(s, b.uid)!.health).toBe(2);
    expect(unit(s, c.uid)!.health).toBe(4); // three tiles away
  });

  it('the free stance takes autoBraceTaken; a brace after a move is a full brace', () => {
    let s = board();
    Object.assign(GRID, { autoBrace: 'passive', autoBraceTaken: 0.75 });
    const idle = put(s, 0, 1, 4, 't-big');
    const mover = put(s, 0, 5, 4, 't-big');
    s = act(s, { type: 'move', uid: mover.uid, to: at(s, 5, 3) });
    s = act(s, { type: 'brace', uid: mover.uid });
    s = endTurn(s);
    expect(unit(s, idle.uid)!.stance).toBe(true);
    expect(unit(s, mover.uid)!.stance).toBeUndefined();
    const x = put(s, 1, 1, 3, 't-big');
    const y = put(s, 1, 5, 2, 't-big');
    s = act(s, { type: 'attack', uid: x.uid, target: unit(s, idle.uid)!.tile });
    s = act(s, { type: 'attack', uid: y.uid, target: unit(s, mover.uid)!.tile });
    expect(unit(s, idle.uid)!.health).toBe(9 - 3); // floor(5 * 0.75)
    expect(unit(s, mover.uid)!.health).toBe(9 - 2); // floor(5 * 0.5)
  });
});

describe('grid: v3 territory score', () => {
  // Side 0's HQ (3,6); a unit on (2,6) links (2,5) and (2,4) to it. (3,2) is on side 1's half.
  const NODES = ['...H...', '.......', '...n...', '.......', '..n....', '..n....', '...H...'];
  const home = (s: GridState) => { for (const t of [at(s, 2, 4), at(s, 2, 5)]) nodeAt(s, t)!.owner = 0; put(s, 0, 2, 6, 't-earth'); };

  it("connected nodes score at the start of their owner's turn; a cut node scores nothing unless scoreConnected is off", () => {
    let s = board(NODES);
    GRID.scoreTarget = 30;
    home(s);
    nodeAt(s, at(s, 3, 2))!.owner = 0; // held, but not connected
    s = endTurn(s); // side 1's upkeep: it holds nothing
    expect(s.players[1].score ?? 0).toBe(0);
    s = endTurn(s); // side 0's upkeep
    expect(s.players[0].score).toBe(2);
    expect(s.log.find(e => e.k === 'score')).toMatchObject({ side: 0, n: 2, total: 2 });
    expect((s.log.find(e => e.k === 'score') as { nodes: unknown[] }).nodes).toHaveLength(2);
    GRID.scoreConnected = false;
    s = endTurn(endTurn(s));
    expect(s.players[0].score).toBe(5);
  });

  it('reaching the target wins at once ("score"); HQ destruction still wins too', () => {
    let s = board(NODES);
    GRID.scoreTarget = 10;
    home(s);
    s.players[0].score = 8;
    s = endTurn(s);
    expect(s.phase).toBe('main');
    s = endTurn(s);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(0);
    expect(s.endReason).toBe('score');
    expect(s.log.at(-1)).toMatchObject({ k: 'end', winner: 0, reason: 'score' });
  });

  it('the city, the enemy half, rising stakes and the underdog change what a node scores', () => {
    const s = board(['...H...', '.......', '...n...', '...c...', '..n....', '..n....', '...H...']);
    Object.assign(GRID, { scoreTarget: 20, scoreCity: 2, scoreFar: 3 });
    const city = nodeAt(s, at(s, 3, 3))!;
    const far = nodeAt(s, at(s, 3, 2))!;
    expect(nodeScore(s, city, 0).n).toBe(2);
    expect(nodeScore(s, far, 0).n).toBe(3); // past the middle row for side 0
    expect(nodeScore(s, far, 1).n).toBe(1); // side 1's own half
    GRID.scoreRamp = 2; // turn 5 is round 3: +1
    expect(nodeScore(s, far, 1).n).toBe(2);
    GRID.scoreRamp = 0;
    home(s);
    s.players[1].score = 4;
    expect(scoringNodes(s, 0).reduce((a, x) => a + x.n, 0)).toBe(2);
    GRID.scoreBehind = 2;
    expect(scoringNodes(s, 0).reduce((a, x) => a + x.n, 0)).toBe(4);
  });

  it("scoreWhen 'end': a node scores as soon as it is claimed", () => {
    let s = board(NODES);
    Object.assign(GRID, { scoreTarget: 30, scoreWhen: 'end' });
    put(s, 0, 2, 6, 't-earth');
    put(s, 0, 2, 5, 't-earth');
    s = endTurn(s);
    expect(s.players[0].score).toBe(1);
    expect(s.log.findIndex(e => e.k === 'claim')).toBeLessThan(s.log.findIndex(e => e.k === 'score'));
  });

  it('HQ damage scores for the attacker with scoreHq', () => {
    let s = board();
    Object.assign(GRID, { scoreTarget: 30, scoreHq: 3, flank: 0 });
    const a = put(s, 0, 3, 1, 't-big');
    s = act(s, { type: 'attack', uid: a.uid, target: s.hq[1] });
    expect(s.players[0].score).toBe(1); // 5 damage: one point per 3
    expect(s.log.find(e => e.k === 'score')).toMatchObject({ side: 0, n: 1, hq: true, nodes: [] });
    const b = put(s, 0, 2, 1, 't-big');
    s = act(s, { type: 'attack', uid: b.uid, target: s.hq[1] });
    expect(s.players[0].score).toBe(3); // 10 damage
  });

  it('the turn limit goes to the higher score, then HQ health', () => {
    let s = board();
    Object.assign(GRID, { scoreTarget: 30, turnLimit: 3 });
    s.players[0].score = 2;
    s.players[1].score = 4;
    s.players[1].hp = 3;
    s = endTurn(endTurn(s));
    expect(s.endReason).toBe('turn_limit');
    expect(s.winner).toBe(1);
    const t = board();
    GRID.scoreTarget = 30;
    t.players[0].score = 5;
    t.players[1].score = 5;
    t.players[1].hp = 7;
    expect(judgeGrid(t)).toBe(0);
  });

  it('the rotating objective is announced ahead, starts on time, scores its bonus and moves on', () => {
    let s = board(NODES);
    Object.assign(GRID, { scoreTarget: 50, scoreConnected: false, objectiveEvery: 4, objectiveWarn: 2, objectiveFirst: 9, objectiveBonus: 2 });
    for (const n of s.nodes) n.owner = 0;
    s = endTurn(s); // turn 6
    expect(s.nextObjective ?? null).toBeNull();
    s = endTurn(s); // turn 7: the turn-9 objective is announced
    const next = s.nextObjective!;
    expect(next).toMatchObject({ from: 9, until: 12 });
    expect(s.log.find(e => e.k === 'objective')).toMatchObject({ tile: next.tile, announced: true });
    expect(gridViewFor(s, 1).nextObjective).toEqual(next);
    const before = s.players[0].score!;
    s = endTurn(endTurn(s)); // turn 9: it starts, then side 0 scores
    expect(s.objective).toMatchObject({ tile: next.tile, from: 9 });
    const ev = s.log.filter(e => e.k === 'score').at(-1) as Extract<GridState['log'][number], { k: 'score' }>;
    expect(ev.nodes.find(x => x.tile === next.tile)).toMatchObject({ n: 3, objective: true });
    expect(s.players[0].score).toBe(before + 3 + 2);
    for (let i = 0; i < 4; i++) s = endTurn(s); // turn 13: the next one
    expect(s.objective!.from).toBe(13);
    expect(s.objective!.tile).not.toBe(next.tile);
  });

  it('armour growth: a damaged HQ gets +1 armour per armourGrowth health lost', () => {
    let s = board();
    Object.assign(GRID, { armourGrowth: 4, flank: 0 });
    s.players[1].hp = 12; // 8 lost
    expect(hqArmour(s, 1)).toBe(2);
    const a = put(s, 0, 3, 1, 't-big');
    s = act(s, { type: 'attack', uid: a.uid, target: s.hq[1] });
    expect(s.players[1].hp).toBe(9);
    expect(s.log.find(e => e.k === 'damage')).toMatchObject({ n: 3, armour: 2 });
  });

  it('claimAdjacent: a node is claimed even with an enemy next to it', () => {
    let s = board(NODES);
    const u = put(s, 0, 2, 5, 't-earth');
    put(s, 1, 1, 4, 't-earth');
    GRID.claimAdjacent = true;
    s = endTurn(s);
    expect(nodeAt(s, u.tile)!.owner).toBe(0);
  });

  it('scores are public in the view, and the bot plays score games to an end', () => {
    Object.assign(GRID, { scoreTarget: 12, objectiveEvery: 4, armourGrowth: 4 });
    const r = playGridGame(starterDeck('earth'), starterDeck('water'), 11, { trace: true });
    expect(['hero', 'turn_limit']).toContain(r.reason);
    expect(r.grid.scores.some(x => x > 0)).toBe(true);
    const s = createGrid(3, [{ name: 'A', avatar: '', deck: starterDeck('fire') }, { name: 'B', avatar: '', deck: starterDeck('air') }]);
    expect(s.players.map(p => p.score)).toEqual([0, 0]);
    s.players[0].score = 4;
    expect(gridViewFor(s, 1).players[0].score).toBe(4);
  });
});
