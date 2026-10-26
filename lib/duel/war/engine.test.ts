import { afterEach, describe, expect, it } from 'vitest';
import { starterDeck } from '../deck';
import type { Ability, CardDef, Keyword } from '../types';
import { WAR } from './config';
import { applyWarAction, createWar, reachOf, underdog, validatePlan } from './engine';
import { playWarGame } from './sim';
import type { Lane, Order, Plan, Side, WarState } from './types';
import { warViewFor } from './view';

function card(slug: string, power: number, health: number, keywords: Keyword[] = [], abilities: Ability[] = [], extra: Partial<CardDef> = {}): CardDef {
  return { slug, name: slug, tier: 'normal', element: 'water', cost: 1, power, health, keywords, abilities, image: '', ...extra };
}

const DEFS: Record<string, CardDef> = Object.fromEntries([
  card('t-vanilla', 3, 3),
  card('t-big', 5, 6),
  card('t-guard', 1, 6, ['guard']),
  card('t-ranged', 2, 2, ['ranged']),
  card('t-fast', 4, 2, [], [], { element: 'air' }),
  card('t-slow', 4, 4, [], [], { element: 'earth' }),
  card('t-pierce', 6, 6, ['pierce']),
  card('t-frost', 1, 3, [], [{ when: 'move', cost: 2, target: 'enemy_unit', effects: [{ k: 'freeze', t: 'chosen' }] }], { element: 'air' }),
].map(d => [d.slug, d]));

const SNAPSHOT = structuredClone(WAR);
afterEach(() => Object.assign(WAR, structuredClone(SNAPSHOT)));

let n = 1000;
function blank(): WarState {
  const deck = Array(20).fill('t-vanilla');
  const s = createWar(42, [{ name: 'A', avatar: '', deck }, { name: 'B', avatar: '', deck }], DEFS);
  s.phase = 'plan';
  s.round = 3;
  for (const p of s.players) { p.hand = []; p.emeralds = 8; p.mulliganed = true; }
  return s;
}
function put(s: WarState, side: Side, lane: Lane, slug: string): string {
  const d = DEFS[slug];
  const uid = `u${n++}`;
  s.players[side].active[lane] = {
    uid, slug, power: d.power, health: d.health, maxHealth: d.health, keywords: d.keywords.slice(),
    speed: WAR.speed[d.element], shield: d.keywords.includes('shield'), stealth: d.keywords.includes('stealth'), frozenRound: 0, boost: 0,
  };
  return uid;
}
function garrison(s: WarState, side: Side, slug: string): string {
  const keep = s.players[side].active[0];
  const uid = put(s, side, 0, slug);
  s.players[side].garrison.push(s.players[side].active[0]!);
  s.players[side].active[0] = keep;
  return uid;
}
const plan = (orders: (Order | null)[] = [null, null, null], extra: Partial<Plan> = {}): Plan => ({ orders, deploys: [], ...extra });
function round(s: WarState, a: Plan, b: Plan): WarState {
  return applyWarAction(applyWarAction(s, 0, { type: 'plan', plan: a }), 1, { type: 'plan', plan: b });
}
const attack = (side: Side, lane: Lane): Order => ({ k: 'attack', target: { side, lane } });

describe('war: setup and hidden information', () => {
  it('draws three territories with a city in the centre, and deals equal hands', () => {
    const s = createWar(7, [{ name: 'A', avatar: '', deck: starterDeck('fire') }, { name: 'B', avatar: '', deck: starterDeck('earth') }]);
    expect(s.territories).toHaveLength(3);
    expect(s.territories[1].city).toBe(true);
    expect(new Set(s.territories.map(t => t.name)).size).toBe(3);
    expect(s.players.map(p => p.hand.length)).toEqual([WAR.startHand, WAR.startHand]);
    expect(s.players[0].towers).toEqual([WAR.towerHp, WAR.towerHp, WAR.towerHp]);
  });

  it('keeps a plan secret until both are in', () => {
    const s = blank();
    put(s, 0, 0, 't-vanilla');
    const t = applyWarAction(s, 0, { type: 'plan', plan: plan([attack(1, 0), null, null]) });
    expect(t.round).toBe(3);
    const theirs = warViewFor(t, 1);
    expect(theirs.players[0].planned).toBe(true);
    expect(theirs.players[0].plan).toBeUndefined();
    expect(theirs.players[0].hand).toBeUndefined();
    const json = JSON.stringify(theirs);
    expect(json).not.toContain('"deck"');
    expect(json).not.toContain('"rng"');
    expect(() => applyWarAction(t, 0, { type: 'plan', plan: plan() })).toThrow('already in');
  });
});

describe('war: lanes and targeting', () => {
  it('hits the tower through an empty slot opposite, and misses an empty slot elsewhere', () => {
    const s = blank();
    put(s, 0, 1, 't-vanilla');
    let t = round(s, plan([null, attack(1, 1), null]), plan());
    expect(t.players[1].towers[1]).toBe(WAR.towerHp - 3);
    t = round(t, plan([null, attack(1, 0), null]), plan());
    expect(t.players[1].towers).toEqual([WAR.towerHp, WAR.towerHp - 3, WAR.towerHp]);
  });

  it('has soft lanes: flanks reach opposite and centre, the centre and Ranged reach all', () => {
    expect(reachOf(0, false)).toEqual([0, 1]);
    expect(reachOf(1, false)).toEqual([0, 1, 2]);
    expect(reachOf(2, true)).toEqual([0, 1, 2]);
    WAR.lanes = 'hard';
    expect(reachOf(1, false)).toEqual([1]);
    const s = blank();
    put(s, 0, 0, 't-vanilla');
    put(s, 1, 2, 't-vanilla');
    expect(() => validatePlan(s, 0, plan([attack(1, 2), null, null]))).toThrow('Not a legal order');
  });

  it('resolves a slot target against whoever stands there: a switch is a read', () => {
    WAR.switchBrace = false;
    const s = blank();
    put(s, 0, 0, 't-big');
    put(s, 1, 0, 't-vanilla');
    const fresh = garrison(s, 1, 't-guard');
    const t = round(s, plan([attack(1, 0), null, null]), plan([{ k: 'switch', garrison: 0 }, null, null]));
    expect(t.players[1].active[0]!.uid).toBe(fresh);
    expect(t.players[1].active[0]!.health).toBe(1);
    expect(t.log.some(e => e.k === 'attack' && e.swapped)).toBe(true);
  });

  it('redirects to a Guard in reach at resolution (guard: reach)', () => {
    WAR.guard = 'reach';
    const s = blank();
    put(s, 0, 1, 't-vanilla');
    put(s, 1, 0, 't-guard');
    const t = round(s, plan([null, attack(1, 1), null]), plan());
    expect(t.players[1].towers[1]).toBe(WAR.towerHp);
    expect(t.players[1].active[0]!.health).toBe(3);
  });

  it('sends Pierce overflow into the tower of the target\'s lane', () => {
    WAR.siege = 'none';
    const s = blank();
    put(s, 0, 0, 't-pierce');
    put(s, 1, 0, 't-vanilla');
    const t = round(s, plan([attack(1, 0), null, null]), plan());
    expect(t.players[1].active[0]).toBeNull();
    expect(t.players[1].towers[0]).toBe(WAR.towerHp - 3);
  });
});

describe('war: v2 rules', () => {
  it('guard "opposite" only pulls the enemy unit in its own lane', () => {
    WAR.guard = 'opposite';
    const s = blank();
    put(s, 0, 1, 't-vanilla');
    put(s, 1, 0, 't-guard');
    const t = round(s, plan([null, attack(1, 1), null]), plan());
    expect(t.players[1].towers[1]).toBe(WAR.towerHp - 3);
  });

  it('lets a unit attacking out of Stealth ignore Guard', () => {
    WAR.guard = 'reach';
    WAR.stealthStrike = true;
    const s = blank();
    put(s, 0, 1, 't-vanilla');
    s.players[0].active[1]!.stealth = true;
    put(s, 1, 0, 't-guard');
    const t = round(s, plan([null, attack(1, 1), null]), plan());
    expect(t.players[1].towers[1]).toBe(WAR.towerHp - 3);
  });

  it('leaves a bounced slot open to attacks from any lane this round', () => {
    WAR.bounceOpens = true;
    WAR.airTank = 'gust';
    const s = blank();
    s.players[0].tank = 'air';
    put(s, 0, 1, 't-vanilla');
    s.players[0].active[1]!.speed = 0;
    put(s, 1, 0, 't-vanilla');
    const t = round(s, plan([null, attack(1, 0), null], { hq: { target: { side: 1, lane: 0 } } }), plan());
    expect(t.players[1].active[0]).toBeNull();
    expect(t.players[1].towers[0]).toBe(WAR.towerHp - 3);
  });

  it('judges the round limit on towers destroyed, then tower damage dealt', () => {
    WAR.limitJudge = 'damage';
    WAR.roundLimit = 3;
    const s = blank();
    s.players[0].towerLost = 2;
    s.players[1].towerLost = 5;
    s.players[1].towers = [WAR.towerHp, WAR.towerHp, WAR.towerHp];
    const t = round(s, plan(), plan());
    expect(t.phase).toBe('over');
    expect(t.endReason).toBe('round_limit');
    expect(t.winner).toBe(0);
  });
});

describe('war: siege and pacing (v1)', () => {
  it('overflow: damage past a knocked-out defender hits its tower', () => {
    WAR.siege = 'overflow';
    const s = blank();
    put(s, 0, 0, 't-big');
    put(s, 1, 0, 't-guard');
    s.players[1].active[0]!.health = 2;
    const t = round(s, plan([attack(1, 0), null, null]), plan());
    expect(t.players[1].towers[0]).toBe(WAR.towerHp - 3);
  });

  it('chip: a defender taking attack damage costs its tower', () => {
    WAR.siege = 'chip';
    const s = blank();
    put(s, 0, 0, 't-vanilla');
    put(s, 1, 0, 't-big');
    const t = round(s, plan([attack(1, 0), null, null]), plan());
    expect(t.players[1].towers[0]).toBe(WAR.towerHp - WAR.chip);
    expect(t.players[1].active[0]!.health).toBe(3);
  });

  it('scales unit health, and prices per-card speed in health', async () => {
    const { warHealth, warSpeed } = await import('./engine');
    const def = DEFS['t-big'];
    WAR.speedMode = 'element';
    WAR.healthMult = 2;
    expect(warHealth(def)).toBe(12);
    WAR.speedMode = 'card';
    const sp = warSpeed(def);
    expect([1, 2, 3]).toContain(sp);
    expect(warHealth(def)).toBe(12 - (sp - 2) * WAR.speedHealth);
  });
});

describe('war: resolution', () => {
  it('halves damage to a braced unit, rounding down', () => {
    WAR.braceTaken = 0.5;
    const s = blank();
    put(s, 0, 0, 't-big');
    put(s, 1, 0, 't-big');
    const t = round(s, plan([attack(1, 0), null, null]), plan([{ k: 'brace' }, null, null]));
    expect(t.players[1].active[0]!.health).toBe(6 - 2);
  });

  it('acts by speed: the faster unit kills the slower one before it swings', () => {
    const s = blank();
    put(s, 0, 0, 't-fast');
    put(s, 1, 0, 't-vanilla');
    const t = round(s, plan([attack(1, 0), null, null]), plan([attack(0, 0), null, null]));
    expect(t.players[1].active[0]).toBeNull();
    expect(t.players[0].active[0]!.health).toBe(2);
  });

  it('freezes a unit that has not acted yet out of this round', () => {
    const s = blank();
    put(s, 0, 0, 't-frost');
    put(s, 1, 0, 't-slow');
    const t = round(s, plan([{ k: 'move', target: { side: 1, lane: 0 } }, null, null]), plan([attack(0, 0), null, null]));
    expect(t.players[0].active[0]!.health).toBe(3);
    expect(t.players[0].emeralds).toBe(Math.min(WAR.bankCap, 8 - 2 + WAR.income));
  });

  it('ends the war when a side loses two towers', () => {
    const s = blank();
    s.players[1].towers = [0, 3, WAR.towerHp];
    put(s, 0, 1, 't-vanilla');
    const t = round(s, plan([null, attack(1, 1), null]), plan());
    expect(t.phase).toBe('over');
    expect(t.winner).toBe(0);
    expect(t.endReason).toBe('towers');
  });

  it('pays deploys in emeralds and puts the unit in the chosen empty slot', () => {
    const s = blank();
    WAR.perks = false;
    s.players[0].hand = [{ uid: 'h1', slug: 't-vanilla' }];
    const t = round(s, plan(undefined, { deploys: [{ uid: 'h1', to: 2 }] }), plan());
    expect(t.players[0].active[2]!.slug).toBe('t-vanilla');
    expect(t.players[0].hand).toHaveLength(1); // the next round's draw
  });

  it('gives the front holder the territory perk', () => {
    WAR.incomeStep = 0;
    WAR.rebuild = 0;
    const s = blank();
    s.territories = [{ name: 'W', city: false, resource: 'wood' }, { name: 'C', city: true, resource: 'ore' }, { name: 'F', city: false, resource: 'fish' }];
    s.players[0].towers[0] = 3;
    s.players[0].emeralds = 0;
    put(s, 0, 0, 't-guard');
    put(s, 0, 1, 't-guard');
    const t = round(s, plan(), plan());
    expect(t.players[0].towers[0]).toBe(3 + WAR.perk.wood);
    expect(t.players[0].active[1]!.boost).toBe(WAR.perk.ore);
    expect(t.players[0].emeralds).toBe(WAR.income + WAR.perk.city);
  });
});

describe('war: v3 rules', () => {
  it('brace strikes back: a braced unit still standing hits each attacker for its power', () => {
    WAR.braceTaken = 0.5;
    WAR.braceCounter = 1;
    WAR.braceCounterFlat = 0;
    const s = blank();
    put(s, 0, 0, 't-big');
    put(s, 1, 0, 't-vanilla');
    const t = round(s, plan([attack(1, 0), null, null]), plan([{ k: 'brace' }, null, null]));
    expect(t.players[1].active[0]!.health).toBe(3 - 2);
    expect(t.players[0].active[0]!.health).toBe(6 - 3);
    expect(t.log.some(e => e.k === 'counter')).toBe(true);
  });

  it('brace does not strike back when the braced unit falls, or when off', () => {
    WAR.braceTaken = 0.5;
    WAR.braceCounter = 1;
    WAR.braceCounterFlat = 0;
    const s = blank();
    put(s, 0, 0, 't-pierce');
    put(s, 1, 0, 't-vanilla');
    let t = round(s, plan([attack(1, 0), null, null]), plan([{ k: 'brace' }, null, null]));
    expect(t.players[1].active[0]).toBeNull();
    expect(t.players[0].active[0]!.health).toBe(6);
    WAR.braceCounter = 0;
    const s2 = blank();
    put(s2, 0, 0, 't-big');
    put(s2, 1, 0, 't-vanilla');
    t = round(s2, plan([attack(1, 0), null, null]), plan([{ k: 'brace' }, null, null]));
    expect(t.players[0].active[0]!.health).toBe(6);
  });

  it('braces a unit switching in from the garrison (switchBrace)', () => {
    WAR.switchBrace = true;
    WAR.braceTaken = 0.5;
    WAR.braceCounter = 0;
    const s = blank();
    put(s, 0, 0, 't-big');
    put(s, 1, 0, 't-vanilla');
    garrison(s, 1, 't-big');
    const t = round(s, plan([attack(1, 0), null, null]), plan([{ k: 'switch', garrison: 0 }, null, null]));
    expect(t.players[1].active[0]!.health).toBe(6 - 2);
  });

  it('lets a shift attack from the new lane (shiftAttack), and checks its reach', () => {
    WAR.shiftAttack = true;
    WAR.shiftAttackPower = 1;
    WAR.shiftAttackTiming = 'normal';
    const s = blank();
    put(s, 0, 0, 't-vanilla');
    const order: Order = { k: 'shift', dir: 1, attack: { side: 1, lane: 1 } };
    expect(() => validatePlan(s, 0, plan([order, null, null]))).not.toThrow();
    const t = round(s, plan([order, null, null]), plan());
    expect(t.players[0].active[1]!.slug).toBe('t-vanilla');
    expect(t.players[1].towers[1]).toBe(WAR.towerHp - 3);
    const s2 = blank();
    put(s2, 0, 1, 't-vanilla');
    expect(() => validatePlan(s2, 0, plan([null, { k: 'shift', dir: -1, attack: { side: 1, lane: 2 } }, null]))).toThrow('after that shift');
    WAR.shiftAttack = false;
    expect(() => validatePlan(s, 0, plan([order, null, null]))).toThrow('cannot also attack');
  });

  it("shiftAttack 'empty': only a shift into an empty slot may also attack", () => {
    WAR.shiftAttack = 'empty';
    const s = blank();
    put(s, 0, 0, 't-vanilla');
    const order: Order = { k: 'shift', dir: 1, attack: { side: 1, lane: 1 } };
    expect(() => validatePlan(s, 0, plan([order, null, null]))).not.toThrow();
    put(s, 0, 1, 't-guard');
    expect(() => validatePlan(s, 0, plan([order, null, null]))).toThrow('empty slot');
    expect(() => validatePlan(s, 0, plan([{ k: 'shift', dir: 1 }, null, null]))).not.toThrow();
  });

  it('grows income every incomeStep rounds, and adds the war chest per tower lost', () => {
    WAR.perks = false;
    WAR.bankCap = 20;
    WAR.income = 2;
    WAR.incomeStep = 2;
    WAR.lostTowerIncome = 1;
    const s = blank();
    s.round = 4; // next round is 5: 2 + floor(4 / 2) = 4
    s.players[0].emeralds = 0;
    s.players[1].emeralds = 0;
    s.players[1].towers = [0, WAR.towerHp, WAR.towerHp];
    const t = round(s, plan(), plan());
    expect(t.players[0].emeralds).toBe(4);
    expect(t.players[1].emeralds).toBe(5);
  });

  it('rebuilds a fallen tower whose lane you hold (rebuild), up to rebuildMax', () => {
    WAR.perks = false;
    WAR.rebuild = 4;
    WAR.rebuildMax = 1;
    const s = blank();
    s.players[0].towers = [0, WAR.towerHp, WAR.towerHp];
    put(s, 0, 0, 't-guard');
    let t = round(s, plan(), plan());
    expect(t.players[0].towers[0]).toBe(4);
    expect(t.log.some(e => e.k === 'rebuild')).toBe(true);
    t.players[0].towers[0] = 0;
    t = round(t, plan(), plan());
    expect(t.players[0].towers[0]).toBe(0);
  });

  it('gives the side behind on towers the speed ties (underdogInitiative)', () => {
    WAR.underdogInitiative = true;
    const s = blank();
    s.players[1].towers = [2, WAR.towerHp, WAR.towerHp];
    put(s, 0, 0, 't-vanilla');
    put(s, 1, 0, 't-vanilla');
    const t = round(s, plan([attack(1, 0), null, null]), plan([attack(0, 0), null, null]));
    expect(t.players[1].active[0]).not.toBeNull();
    expect(t.players[0].active[0]).toBeNull();
    expect(underdog(s)).toBe(1);
    // 'fallen': only towers lost count, not tower health.
    expect(underdog(s, true)).toBeNull();
    s.players[1].towers = [0, WAR.towerHp, WAR.towerHp];
    expect(underdog(s, true)).toBe(1);
    s.players[1].towers = [WAR.towerHp, WAR.towerHp, WAR.towerHp];
    expect(underdog(s)).toBeNull();
  });

  it('pays a bounty and raises the other towers when a tower falls (fallBounty, lastStand)', () => {
    WAR.fallBounty = 2;
    WAR.lastStand = 2;
    WAR.bankCap = 20;
    WAR.perks = false;
    const s = blank();
    s.players[1].towers = [3, WAR.towerHp, WAR.towerHp];
    s.players[1].emeralds = 0;
    put(s, 0, 0, 't-vanilla');
    const t = round(s, plan([attack(1, 0), null, null]), plan());
    expect(t.players[1].towers).toEqual([0, WAR.towerHp + 2, WAR.towerHp + 2]);
    expect(t.players[1].emeralds).toBe(2 + WAR.income + (WAR.incomeStep ? Math.floor(3 / WAR.incomeStep) : 0));
  });
});

describe('war: brace stance and shift timing', () => {
  it("braceStance 'extend': a brace holds this round and the next, visibly, and ends on a shift", () => {
    WAR.braceStance = 'extend';
    WAR.braceTaken = 0.5;
    WAR.braceCounter = 0;
    WAR.braceCounterFlat = 0;
    const s = blank();
    put(s, 0, 0, 't-big');
    put(s, 1, 0, 't-big');
    let t = round(s, plan([attack(1, 0), null, null]), plan([{ k: 'brace' }, null, null]));
    expect(t.players[1].active[0]!.health).toBe(6 - 2);
    expect(t.players[1].active[0]!.bracedUntil).toBe(4);
    expect(warViewFor(t, 0).players[1].active[0]!.bracedUntil).toBe(4);
    t = round(t, plan([attack(1, 0), null, null]), plan([attack(0, 0), null, null]));
    expect(t.players[1].active[0]!.health).toBe(6 - 4);
    t = round(t, plan([attack(1, 0), null, null]), plan());
    expect(t.players[1].active[0]).toBeNull();
    const s2 = blank();
    put(s2, 1, 0, 't-big');
    s2.players[1].active[0]!.bracedUntil = 3;
    const t2 = round(s2, plan(), plan([{ k: 'shift', dir: 1 }, null, null]));
    expect(t2.players[1].active[1]!.bracedUntil).toBe(0);
  });

  it("braceStance 'next': the brace only takes effect next round", () => {
    WAR.braceStance = 'next';
    WAR.braceTaken = 0.5;
    WAR.braceCounter = 0;
    const s = blank();
    put(s, 0, 0, 't-big');
    put(s, 1, 0, 't-big');
    let t = round(s, plan([attack(1, 0), null, null]), plan([{ k: 'brace' }, null, null]));
    expect(t.players[1].active[0]!.health).toBe(6 - 5);
    t.players[1].active[0]!.health = 6;
    t = round(t, plan([attack(1, 0), null, null]), plan());
    expect(t.players[1].active[0]!.health).toBe(6 - 2);
  });

  it('strikes back for a flat amount (braceCounterFlat)', () => {
    WAR.braceStance = 'off';
    WAR.braceTaken = 0.5;
    WAR.braceCounterFlat = 1;
    const s = blank();
    put(s, 0, 0, 't-big');
    put(s, 1, 0, 't-big');
    const t = round(s, plan([attack(1, 0), null, null]), plan([{ k: 'brace' }, null, null]));
    expect(t.players[0].active[0]!.health).toBe(6 - 1);
  });

  it("resolves a shift's attack last and at shiftAttackPower", () => {
    WAR.shiftAttack = true;
    WAR.shiftAttackTiming = 'last';
    WAR.shiftAttackPower = 0.5;
    WAR.underdogInitiative = false;
    const s = blank();
    put(s, 0, 0, 't-big');
    s.players[0].active[0]!.speed = 9;
    put(s, 1, 1, 't-vanilla');
    const t = round(s, plan([{ k: 'shift', dir: 1, attack: { side: 1, lane: 1 } }, null, null]), plan([null, attack(0, 1), null]));
    // The enemy acts first (its attack lands on the unit that shifted in), then the half-power shift attack.
    const acts = t.log.filter(e => e.k === 'attack');
    expect(acts[acts.length - 1].k === 'attack' && acts[acts.length - 1].side).toBe(0);
    expect(t.players[0].active[1]!.health).toBe(6 - 3);
    expect(t.players[1].active[1]!.health).toBe(3 - 2);
  });
});

describe('war: bot', () => {
  it('plays whole games with legal plans, deterministically', () => {
    const a = playWarGame(starterDeck('fire'), starterDeck('water'), 5, { trace: true });
    const b = playWarGame(starterDeck('fire'), starterDeck('water'), 5, { trace: true });
    expect(a.reason).not.toBeNull();
    expect(a.turns).toBeGreaterThan(2);
    expect(a.war.orders.attack).toBeGreaterThan(0);
    expect(a.winner).toBe(b.winner);
  });

  it('measures what each brace decision was worth (the luck read)', async () => {
    const { summarizeWar } = await import('./sim');
    const games = [1, 2, 3, 4].map(seed => playWarGame(starterDeck('earth'), starterDeck('water'), seed, { trace: true }));
    const luck = summarizeWar(games).braceLuck;
    expect(luck.n).toBe(games.reduce((x, g) => x + g.war.braceSwing.n, 0));
    expect(luck.wasted + luck.big).toBeLessThanOrEqual(1);
    expect(luck.sd).toBeGreaterThanOrEqual(0);
  });
});

describe('war: text', () => {
  it('describes the war tank and keywords from the current settings', async () => {
    const { warKeywordText, warTankText } = await import('./text');
    WAR.airTank = 'gust';
    expect(warTankText({ tank: 'air' }).text).toContain('Return an enemy unit');
    WAR.guard = 'opposite';
    expect(warKeywordText('guard').text).toContain('this lane');
  });
});

describe('war: client contract', () => {
  it('plans from a WarView with the same helpers the server uses', async () => {
    const { orderOptions, validatePlan, warGuide } = await import('./client');
    const s = blank();
    put(s, 0, 1, 't-vanilla');
    s.players[0].hand = [{ uid: 'h1', slug: 't-vanilla' }];
    const view = warViewFor(s, 0);
    const opts = orderOptions(view, 0, 1);
    expect(opts.some(o => o.k === 'attack')).toBe(true);
    expect(() => validatePlan(view, 0, plan([null, opts[0], null], { deploys: [{ uid: 'h1', to: 0 }] }))).not.toThrow();
    expect(() => validatePlan(warViewFor(s, 1), 1, plan(undefined, { deploys: [{ uid: 'h1', to: 0 }] }))).toThrow('not in your hand');
    expect(warGuide().towerHp).toBe(WAR.towerHp);
  });
});

describe('war: live prices', () => {
  it('live games price cards from war/balance-coefficients.json, keeping tier and element', async () => {
    const { allCards, getCard } = await import('../catalog');
    const { defOf } = await import('./engine');
    const { warCard, warCards } = await import('./cards');
    const { WAR_SIGNATURES } = await import('./signatures');
    const before = JSON.stringify(getCard('orphion'));
    const all = allCards().map(c => c.slug);
    let differ = 0;
    for (const slug of all) {
      const w = defOf(slug);
      const d = getCard(slug)!;
      expect(w).toBe(warCard(slug));
      expect([w.tier, w.element]).toEqual([d.tier, d.element]);
      // War prices add a cost-6 bucket for normals, so only normal cards may change cost.
      if (d.tier !== 'normal') expect(w.cost, slug).toBe(d.cost);
      if (w.power !== d.power || w.health !== d.health) differ++;
    }
    // The war prices are not the duel's: many cards change stats.
    expect(differ / all.length).toBeGreaterThan(0.2);
    // Her Majesty and Syndra use their war kits.
    for (const slug of Object.keys(WAR_SIGNATURES)) {
      expect(defOf(slug).abilities.map(a => JSON.stringify(a.effects))).toEqual(WAR_SIGNATURES[slug].abilities!.map(a => JSON.stringify(a.effects)));
      expect(defOf(slug).abilities).not.toEqual(getCard(slug)!.abilities);
    }
    expect(warCards().map(c => c.slug).sort()).toEqual(all.slice().sort());
    // Member cards (extraDefs) still win, and the duel catalog is untouched.
    const member = card('m-1', 1, 1);
    expect(defOf('m-1', { 'm-1': member })).toBe(member);
    expect(JSON.stringify(getCard('orphion'))).toBe(before);
  });

  it('the lab measures exactly the cards live games play', async () => {
    const { allCards } = await import('../catalog');
    const { applyConfig, currentConfig } = await import('../lab');
    const { K } = await import('../balance');
    const { warCards, WAR_PRICES } = await import('./cards');
    const { WAR_SIGNATURES } = await import('./signatures');
    const prices = (await import('./balance-coefficients.json')).default;
    const live = JSON.stringify(warCards().slice().sort((a, b) => a.slug.localeCompare(b.slug)));
    const saved = currentConfig();
    try {
      // What lab-cli does for --ruleset=war: war prices and signatures into the live catalog.
      applyConfig({ ruleset: 'war', signatures: WAR_SIGNATURES, coefficients: prices as typeof K });
      expect(WAR_PRICES.live).toBe(true);
      expect(JSON.stringify(allCards().slice().sort((a, b) => a.slug.localeCompare(b.slug)))).toBe(live);
    } finally {
      applyConfig(saved);
    }
    expect(WAR_PRICES.live).toBe(false);
  });

  it('a live war state (no extraDefs) deploys units with war-priced stats', async () => {
    const { allCards, getCard } = await import('../catalog');
    const { warCard } = await import('./cards');
    const { warHealth } = await import('./engine');
    // A cheap vanilla-ish card whose war health differs from its duel health.
    const slug = allCards().find(c => c.tier === 'normal' && c.cost <= 3 && !c.abilities.length && !c.keywords.length
      && warHealth(warCard(c.slug)!) !== warHealth(getCard(c.slug)!))!.slug;
    const deck = Array(20).fill(slug);
    const s = createWar(4242, [{ name: 'A', avatar: '', deck }, { name: 'B', avatar: '', deck }]);
    s.phase = 'plan';
    s.round = 3;
    WAR.perks = false;
    for (const p of s.players) { p.hand = []; p.emeralds = 8; p.mulliganed = true; }
    s.players[0].hand = [{ uid: 'h1', slug }];
    const t = round(s, plan(undefined, { deploys: [{ uid: 'h1', to: 2 }] }), plan());
    const u = t.players[0].active[2]!;
    expect(u.slug).toBe(slug);
    expect(u.maxHealth).toBe(warHealth(warCard(slug)!));
    expect(u.maxHealth).not.toBe(warHealth(getCard(slug)!));
  });
});
