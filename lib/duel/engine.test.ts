import { describe, expect, it } from 'vitest';
import { chooseAction, runBot } from './ai';
import { starterDeck } from './deck';
import { ActionError, applyAction, BOARD_SLOTS, createGame, legalActions, MAX_HAND, RULES, START_HAND, tankElement, TURN_LIMIT } from './engine';
import type { Ability, CardDef, GameState, Keyword, Side, Unit } from './types';
import { viewFor } from './view';

// Test cards ride in extraDefs so each rule is exercised in isolation.
function card(slug: string, power: number, health: number, keywords: Keyword[] = [], abilities: Ability[] = [], extra: Partial<CardDef> = {}): CardDef {
  return { slug, name: slug, tier: 'normal', element: 'water', cost: 1, power, health, keywords, abilities, image: '', ...extra };
}

const DEFS: Record<string, CardDef> = Object.fromEntries([
  card('t-vanilla', 3, 3),
  card('t-wall', 0, 5, ['guard']),
  card('t-rush', 2, 1, ['rush']),
  card('t-ranged', 3, 1, ['ranged']),
  card('t-shield', 1, 1, ['shield']),
  card('t-pierce', 5, 5, ['pierce']),
  card('t-drain', 4, 4, ['drain']),
  card('t-stealth', 2, 2, ['stealth']),
  card('t-regen', 1, 6, ['regen']),
  card('t-fire', 2, 5, [], [], { element: 'fire' }),
  card('t-water', 2, 5, [], [], { element: 'water' }),
  card('t-bolt', 1, 1, [], [{ when: 'play', target: 'enemy', effects: [{ k: 'damage', n: 3, t: 'chosen' }] }]),
  card('t-frost', 1, 1, [], [{ when: 'move', cost: 2, target: 'enemy_unit', effects: [{ k: 'freeze', t: 'chosen' }] }]),
  card('t-gust', 1, 1, [], [{ when: 'play', target: 'enemy_unit', effects: [{ k: 'bounce', t: 'chosen', maxCost: 1 }] }]),
  card('t-martyr', 1, 1, [], [{ when: 'death', effects: [{ k: 'damage', n: 2, t: 'all_enemy_units' }] }]),
  card('t-big', 1, 1, [], [], { cost: 7 }),
].map(d => [d.slug, d]));

function blank(): GameState {
  const deck = Array(20).fill('t-vanilla');
  const s = createGame(42, [{ name: 'A', avatar: '', deck }, { name: 'B', avatar: '', deck }], DEFS);
  s.phase = 'main';
  s.turn = 5;
  s.active = 0;
  for (const p of s.players) {
    p.tide = p.maxTide = 10;
    p.hand = [];
    p.pearl = false;
    p.mulliganed = true;
  }
  return s;
}

let n = 1000;
function put(s: GameState, side: Side, slug: string, over: Partial<Unit> = {}): string {
  const d = DEFS[slug];
  const uid = `u${n++}`;
  s.players[side].board.push({
    uid, slug, power: d.power, health: d.health, maxHealth: d.health, keywords: d.keywords.slice(),
    ready: true, shield: d.keywords.includes('shield'), stealth: d.keywords.includes('stealth'), frozenUntil: 0, ...over,
  });
  return uid;
}
function hand(s: GameState, side: Side, slug: string): string {
  const uid = `h${n++}`;
  s.players[side].hand.push({ uid, slug });
  return uid;
}
const unit = (s: GameState, uid: string) => s.players.flatMap(p => p.board).find(u => u.uid === uid);
const HERO1 = { kind: 'hero', side: 1 } as const;

describe('duel engine: combat', () => {
  it('trades damage both ways and removes the dead', () => {
    const s = blank();
    const a = put(s, 0, 't-vanilla');
    const b = put(s, 1, 't-vanilla', { health: 2 });
    const t = applyAction(s, 0, { type: 'attack', uid: a, target: { kind: 'unit', uid: b } });
    expect(unit(t, b)).toBeUndefined();
    expect(unit(t, a)).toBeUndefined(); // 3 retaliation kills a 3-health attacker too
    expect(t.players[1].graveyard).toContain('t-vanilla');
  });

  it('never mutates the state it was given', () => {
    const s = blank();
    const a = put(s, 0, 't-vanilla');
    const before = JSON.stringify(s);
    applyAction(s, 0, { type: 'attack', uid: a, target: HERO1 });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('makes attackers go through Guard', () => {
    const s = blank();
    const a = put(s, 0, 't-vanilla');
    put(s, 1, 't-wall');
    expect(() => applyAction(s, 0, { type: 'attack', uid: a, target: HERO1 })).toThrow(ActionError);
  });

  it('lets Stealth hide a Guard until it acts', () => {
    const s = blank();
    const a = put(s, 0, 't-vanilla');
    put(s, 1, 't-wall', { stealth: true });
    const t = applyAction(s, 0, { type: 'attack', uid: a, target: HERO1 });
    expect(t.players[1].hp).toBe(17);
  });

  it('gives Ranged attackers no retaliation', () => {
    const s = blank();
    const a = put(s, 0, 't-ranged');
    const b = put(s, 1, 't-vanilla');
    const t = applyAction(s, 0, { type: 'attack', uid: a, target: { kind: 'unit', uid: b } });
    expect(unit(t, a)!.health).toBe(1);
    expect(unit(t, b)).toBeUndefined();
  });

  it('lets Shield absorb the first hit and stops Pierce going through it', () => {
    const s = blank();
    const a = put(s, 0, 't-pierce');
    const b = put(s, 1, 't-shield');
    const t = applyAction(s, 0, { type: 'attack', uid: a, target: { kind: 'unit', uid: b } });
    expect(unit(t, b)!.shield).toBe(false);
    expect(unit(t, b)!.health).toBe(1);
    expect(t.players[1].hp).toBe(20);
  });

  it('sends Pierce overflow to the hero', () => {
    const s = blank();
    const a = put(s, 0, 't-pierce');
    const b = put(s, 1, 't-vanilla', { health: 2 });
    const t = applyAction(s, 0, { type: 'attack', uid: a, target: { kind: 'unit', uid: b } });
    expect(t.players[1].hp).toBe(17);
  });

  it('heals the hero for Drain damage', () => {
    const s = blank();
    s.players[0].hp = 10;
    const a = put(s, 0, 't-drain');
    const t = applyAction(s, 0, { type: 'attack', uid: a, target: HERO1 });
    expect(t.players[0].hp).toBe(14);
    expect(t.players[1].hp).toBe(16);
  });

  it('deals plain power damage whatever the elements', () => {
    const s = blank();
    const w = put(s, 0, 't-water');
    const f = put(s, 1, 't-fire');
    const t = applyAction(s, 0, { type: 'attack', uid: w, target: { kind: 'unit', uid: f } });
    expect(unit(t, f)!.health).toBe(3);
    expect(unit(t, w)!.health).toBe(3);
  });

  it('stops a unit acting twice, or on the turn it arrives without Rush', () => {
    const s = blank();
    const h1 = hand(s, 0, 't-vanilla');
    const h2 = hand(s, 0, 't-rush');
    let t = applyAction(s, 0, { type: 'play', uid: h1 });
    expect(() => applyAction(t, 0, { type: 'attack', uid: h1, target: HERO1 })).toThrow(ActionError);
    t = applyAction(t, 0, { type: 'play', uid: h2 });
    t = applyAction(t, 0, { type: 'attack', uid: h2, target: HERO1 });
    expect(t.players[1].hp).toBe(18);
    expect(() => applyAction(t, 0, { type: 'attack', uid: h2, target: HERO1 })).toThrow(ActionError);
  });
});

describe('duel engine: abilities', () => {
  it('requires and validates a target for targeted entry effects', () => {
    const s = blank();
    const h = hand(s, 0, 't-bolt');
    const stealthy = put(s, 1, 't-stealth');
    expect(() => applyAction(s, 0, { type: 'play', uid: h })).toThrow('Choose a target');
    expect(() => applyAction(s, 0, { type: 'play', uid: h, target: { kind: 'unit', uid: stealthy } })).toThrow('Not a valid target');
    const t = applyAction(s, 0, { type: 'play', uid: h, target: HERO1 });
    expect(t.players[1].hp).toBe(17);
  });

  it('freezes a unit through its owner\'s next turn only', () => {
    const s = blank();
    const f = put(s, 0, 't-frost');
    const v = put(s, 1, 't-vanilla');
    let t = applyAction(s, 0, { type: 'move', uid: f, target: { kind: 'unit', uid: v } });
    expect(t.players[0].tide).toBe(8);
    t = applyAction(t, 0, { type: 'end_turn' });
    expect(legalActions(t, 1).some(a => a.type === 'attack' && a.uid === v)).toBe(false);
    t = applyAction(t, 1, { type: 'end_turn' });
    t = applyAction(t, 0, { type: 'end_turn' });
    expect(legalActions(t, 1).some(a => a.type === 'attack' && a.uid === v)).toBe(true);
  });

  it('bounces only within the cost cap, back to the owner\'s hand', () => {
    const s = blank();
    const cheap = put(s, 1, 't-vanilla');
    const pricey = put(s, 1, 't-big');
    const g1 = hand(s, 0, 't-gust');
    const g2 = hand(s, 0, 't-gust');
    let t = applyAction(s, 0, { type: 'play', uid: g1, target: { kind: 'unit', uid: pricey } });
    expect(unit(t, pricey)).toBeDefined();
    t = applyAction(t, 0, { type: 'play', uid: g2, target: { kind: 'unit', uid: cheap } });
    expect(unit(t, cheap)).toBeUndefined();
    expect(t.players[1].hand.map(h => h.slug)).toContain('t-vanilla');
  });

  it('fires death abilities, and chains deaths they cause', () => {
    const s = blank();
    const a = put(s, 0, 't-vanilla');
    const m = put(s, 1, 't-martyr');
    put(s, 0, 't-martyr');
    const t = applyAction(s, 0, { type: 'attack', uid: a, target: { kind: 'unit', uid: m } });
    // Their martyr dies -> 2 to my units -> my martyr dies -> 2 to theirs (none left).
    expect(t.players[0].board).toHaveLength(0);
    expect(t.log.filter(e => e.k === 'death')).toHaveLength(3);
  });

  it('regenerates at the start of its owner\'s turn', () => {
    const s = blank();
    const r = put(s, 1, 't-regen', { health: 2 });
    const t = applyAction(s, 0, { type: 'end_turn' });
    expect(unit(t, r)!.health).toBe(4);
  });
});

describe('duel engine: turns and resources', () => {
  it('ramps tide to ten and draws each turn', () => {
    const s = blank();
    s.players[1].maxTide = 3;
    const t = applyAction(s, 0, { type: 'end_turn' });
    expect(t.players[1].maxTide).toBe(4);
    expect(t.players[1].tide).toBe(4);
    expect(t.players[1].hand).toHaveLength(1);
  });

  it('burns draws past the hand limit and deals growing fatigue on an empty deck', () => {
    const s = blank();
    for (let i = 0; i < MAX_HAND; i++) hand(s, 1, 't-vanilla');
    let t = applyAction(s, 0, { type: 'end_turn' });
    expect(t.players[1].hand).toHaveLength(MAX_HAND);
    expect(t.log.some(e => e.k === 'burn')).toBe(true);
    t.players[0].deck = [];
    t = applyAction(t, 1, { type: 'end_turn' });
    t = applyAction(t, 0, { type: 'end_turn' });
    t = applyAction(t, 1, { type: 'end_turn' });
    expect(t.players[0].hp).toBe(20 - 1 - 2);
  });

  it('gives the second player a one-use Pearl', () => {
    const s = blank();
    s.players[0].pearl = true;
    s.players[0].tide = 2;
    const t = applyAction(s, 0, { type: 'pearl' });
    expect(t.players[0].tide).toBe(3);
    expect(() => applyAction(t, 0, { type: 'pearl' })).toThrow(ActionError);
  });

  it('forfeits after three missed turns in a row, and resets on a real turn', () => {
    let t = blank();
    t = applyAction(t, 0, { type: 'timeout' });
    t = applyAction(t, 1, { type: 'end_turn' });
    t = applyAction(t, 0, { type: 'timeout' });
    t = applyAction(t, 1, { type: 'end_turn' });
    t = applyAction(t, 0, { type: 'end_turn' });
    expect(t.players[0].timeouts).toBe(0);
    for (let i = 0; i < 3; i++) {
      t = applyAction(t, 1, { type: 'timeout' });
      if (t.phase === 'over') break;
      t = applyAction(t, 0, { type: 'end_turn' });
    }
    expect(t.phase).toBe('over');
    expect(t.winner).toBe(0);
    expect(t.endReason).toBe('timeout');
  });

  it('calls a stalled game on hero health at the turn limit', () => {
    let t = blank();
    t.turn = TURN_LIMIT;
    t.players[1].hp = 5;
    t = applyAction(t, 0, { type: 'end_turn' });
    expect(t.phase).toBe('over');
    expect(t.winner).toBe(0);
    expect(t.endReason).toBe('turn_limit');
  });

  it('rejects actions out of turn and after the end', () => {
    const s = blank();
    expect(() => applyAction(s, 1, { type: 'end_turn' })).toThrow('Not your turn');
    const over = applyAction(s, 1, { type: 'concede' });
    expect(over.winner).toBe(0);
    expect(() => applyAction(over, 0, { type: 'end_turn' })).toThrow('The duel is over');
  });
});

describe('duel engine: setup, hidden information, determinism', () => {
  const decks = () => [
    { name: 'A', avatar: '', deck: starterDeck('fire') },
    { name: 'B', avatar: '', deck: starterDeck('earth') },
  ] as [{ name: string; avatar: string; deck: string[] }, { name: string; avatar: string; deck: string[] }];

  it('deals START_HAND to each seat and the Pearl to the second', () => {
    const s = createGame(7, decks());
    const f = s.players[s.first];
    const sec = s.players[s.first === 0 ? 1 : 0];
    expect(f.hand).toHaveLength(START_HAND[0]);
    expect(sec.hand).toHaveLength(START_HAND[1]);
    expect(sec.pearl).toBe(true);
    expect(f.pearl).toBe(false);
  });

  it('mulligans replace the chosen cards and start the game once both have chosen', () => {
    let s = createGame(7, decks());
    const handBefore = s.players[0].hand.map(h => h.uid);
    s = applyAction(s, 0, { type: 'mulligan', replace: [handBefore[0]] });
    expect(s.phase).toBe('mulligan');
    expect(s.players[0].hand.map(h => h.uid)).not.toContain(handBefore[0]);
    expect(s.players[0].hand).toHaveLength(handBefore.length);
    s = applyAction(s, 1, { type: 'mulligan', replace: [] });
    expect(s.phase).toBe('main');
    expect(s.turn).toBe(1);
    expect(s.players[s.first].maxTide).toBe(1);
  });

  it('shows neither the opponent\'s hand, either deck, nor the RNG', () => {
    const s = createGame(7, decks());
    const v = viewFor(s, 0);
    const json = JSON.stringify(v);
    expect(v.players[0].hand).toHaveLength(s.players[0].hand.length);
    expect(v.players[1].hand).toBeUndefined();
    expect(v.players[1].handCount).toBe(s.players[1].hand.length);
    expect(json).not.toContain('"deck"');
    expect(json).not.toContain('"rng"');
    for (const h of s.players[1].hand) expect(json).not.toContain(h.uid + '"');
  });

  it('replays identically from the same seed and survives a JSON round trip', () => {
    const play = (roundTrip: boolean) => {
      let s = createGame(99, decks());
      for (let i = 0; i < 400 && s.phase !== 'over'; i++) {
        const side = (s.phase === 'mulligan' ? (s.players[0].mulliganed ? 1 : 0) : s.active) as Side;
        s = runBot(s, side);
        if (roundTrip) s = JSON.parse(JSON.stringify(s));
      }
      return s;
    };
    const a = play(false);
    const b = play(true);
    expect(a.phase).toBe('over');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the practice bot only ever picks legal actions', () => {
    let s = createGame(3, decks());
    for (let i = 0; i < 300 && s.phase !== 'over'; i++) {
      const side = (s.phase === 'mulligan' ? (s.players[0].mulliganed ? 1 : 0) : s.active) as Side;
      const a = chooseAction(s, side)!;
      expect(() => (s = applyAction(s, side, a))).not.toThrow();
    }
    expect(s.phase).toBe('over');
  });
});

describe('duel engine: the Tank ability', () => {
  it('takes the deck\'s main element, ties broken by total cost', () => {
    expect(tankElement([{ element: 'fire', cost: 1 }, { element: 'fire', cost: 1 }, { element: 'earth', cost: 5 }])).toBe('fire');
    expect(tankElement([{ element: 'fire', cost: 1 }, { element: 'earth', cost: 5 }])).toBe('earth');
    const s = createGame(1, [{ name: 'A', avatar: '', deck: Array(20).fill('t-fire') }, { name: 'B', avatar: '', deck: Array(20).fill('t-water') }], DEFS);
    expect(s.players.map(p => p.tank)).toEqual(['fire', 'water']);
  });

  it('costs tide, acts once a turn, and is ready again next turn', () => {
    const s = blank();
    s.players[0].tank = 'fire';
    const cost = RULES.tankCost.fire;
    let t = applyAction(s, 0, { type: 'tank', target: HERO1 });
    expect(t.players[1].hp).toBe(19);
    expect(t.players[0].tide).toBe(10 - cost);
    expect(t.log.some(e => e.k === 'tank' && e.name === 'Flare')).toBe(true);
    expect(legalActions(t, 0).some(a => a.type === 'tank')).toBe(false);
    expect(() => applyAction(t, 0, { type: 'tank', target: HERO1 })).toThrow('already acted');
    t = applyAction(t, 0, { type: 'end_turn' });
    t = applyAction(t, 1, { type: 'end_turn' });
    expect(legalActions(t, 0).some(a => a.type === 'tank')).toBe(true);
  });

  it('needs the tide and a legal target', () => {
    const s = blank();
    s.players[0].tank = 'fire';
    s.players[0].tide = RULES.tankCost.fire - 1;
    expect(() => applyAction(s, 0, { type: 'tank', target: HERO1 })).toThrow('Not enough tide');
    s.players[0].tide = 10;
    expect(() => applyAction(s, 0, { type: 'tank' })).toThrow('Choose a target');
  });

  it('gives each element its own ability', () => {
    const s = blank();
    s.players[0].hp = 15;
    s.players[0].tank = 'water';
    expect(applyAction(s, 0, { type: 'tank', target: { kind: 'hero', side: 0 } }).players[0].hp).toBe(17);
    s.players[0].tank = 'earth';
    const wall = applyAction(s, 0, { type: 'tank' }).players[0].board;
    expect(wall.map(u => u.slug)).toEqual(['token-stone-wall']);
    s.players[0].tank = 'thunder';
    expect(applyAction(s, 0, { type: 'tank' }).players[0].board[0].keywords).toContain('rush');
    s.players[0].tank = 'air';
    expect(applyAction(s, 0, { type: 'tank' }).players[0].hand).toHaveLength(1);
  });

  it('will not summon onto a full board', () => {
    const s = blank();
    s.players[0].tank = 'earth';
    for (let i = 0; i < BOARD_SLOTS; i++) put(s, 0, 't-vanilla');
    expect(() => applyAction(s, 0, { type: 'tank' })).toThrow('board is full');
    expect(legalActions(s, 0).some(a => a.type === 'tank')).toBe(false);
  });
});
