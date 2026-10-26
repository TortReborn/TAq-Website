// The Warfront replay's board rebuild (gridReplay.ts) against the real
// engine: every opponent turn of many games must rebuild to exactly the
// server's positions, HQ health and node owners, and every step must carry
// narration.

import { describe, expect, it } from 'vitest';
import { starterDeck } from '@/lib/duel/deck';
import { Rng } from '@/lib/duel/rng';
import type { Element } from '@/lib/duel/types';
import { runGridBot } from '@/lib/duel/grid/ai';
import { applyGridAction, createGrid, legalGridActions } from '@/lib/duel/grid/engine';
import type { GridState, Side } from '@/lib/duel/grid/types';
import { gridViewFor } from '@/lib/duel/grid/view';
import { buildReplay, cardLookup, describe as describeEvent } from './gridReplay';

const ELEMENTS: Element[] = ['fire', 'water', 'earth', 'thunder', 'air'];

function myTurn(s: GridState, side: Side, rng: Rng): GridState {
  let state = s;
  for (let i = 0; i < 25 && state.phase === 'main' && state.active === side; i++) {
    const legal = legalGridActions(state, side).filter(a => a.type !== 'end_turn');
    if (!legal.length || rng.float() < 0.1) break;
    try { state = applyGridAction(state, side, legal[rng.int(legal.length)]); } catch { break; }
  }
  return state;
}

function play(seed: number, size: 5 | 7, foeMode: 'greedy' | 'random') {
  const rng = new Rng(seed);
  const me = (seed % 2) as Side;
  const foe = (1 - me) as Side;
  const decks = [starterDeck(ELEMENTS[seed % 5]), starterDeck(ELEMENTS[(seed * 3 + 1) % 5])];
  let s = createGrid(seed, [{ name: 'A', avatar: '', deck: decks[0] }, { name: 'B', avatar: '', deck: decks[1] }], undefined, { size });
  // The bot mulligans first; the player's mulligan may hand the bot its first turn.
  s = runGridBot(s, foe);
  let before = gridViewFor(s, me);
  s = applyGridAction(s, me, { type: 'mulligan', replace: [] });
  const bad: string[] = [];
  let replays = 0;
  let steps = 0;
  const check = () => {
    const final = gridViewFor(s, me);
    const from = before.logBase + before.log.length;
    const fresh = final.log.slice(Math.max(0, from - final.logBase));
    const r = buildReplay(from, before, final, fresh, cardLookup(final));
    if (r) {
      replays++;
      steps += r.steps.length;
      if (!r.ok) bad.push(`seed ${seed} turn ${final.turn}: ${r.mismatch}`);
      for (const st of r.steps) {
        if (!st.headline) bad.push(`seed ${seed}: empty headline for ${st.kind}`);
        if (!st.recap) bad.push(`seed ${seed}: empty recap for ${st.kind}`);
      }
    }
    for (const e of fresh) describeEvent(e, final, () => 'x', cardLookup(final));
  };
  if (s.phase === 'main' && s.active === foe) { s = runGridBot(s, foe, { mode: foeMode, width: 2, reply: false, prune: 8, replyPrune: 4 }); check(); }
  for (let turn = 0; turn < 40 && s.phase === 'main'; turn++) {
    s = myTurn(s, me, rng);
    if (s.phase !== 'main') break;
    before = gridViewFor(s, me);
    s = applyGridAction(s, me, { type: 'end_turn' });
    if (s.phase === 'main' && s.active === foe) s = runGridBot(s, foe, { mode: foeMode, width: 2, reply: false, prune: 8, replyPrune: 4 });
    check();
  }
  return { bad, replays, steps };
}

describe('grid replay rebuild', () => {
  it('matches the engine on every opponent turn (7x7, greedy bot)', () => {
    let replays = 0;
    const bad: string[] = [];
    for (let seed = 1; seed <= 16; seed++) {
      const r = play(seed, 7, 'greedy');
      replays += r.replays;
      bad.push(...r.bad);
    }
    expect(bad).toEqual([]);
    expect(replays).toBeGreaterThan(40);
  });

  it('matches the engine on every opponent turn (5x5, random bot)', () => {
    const bad: string[] = [];
    for (let seed = 101; seed <= 116; seed++) bad.push(...play(seed, 5, 'random').bad);
    expect(bad).toEqual([]);
  });
});

describe('grid replay rebuild with the v2 knobs', () => {
  it('matches the engine with auto-brace, ability-then-attack, setbacks, last stand and wide HQ fire', async () => {
    const { GRID } = await import('@/lib/duel/grid/config');
    const snap = structuredClone(GRID);
    const variants: Partial<typeof GRID>[] = [
      { autoBrace: 'idle', autoBraceTaken: 0.75, abilityAttack: true },
      { autoBrace: 'passive', setbackOn: 'either', setbackOrders: 1, setbackEmeralds: 1, setbackDiscount: 1 },
      { lastStand: 3, lastStandAt: 0.5, hqFireReach: 2, hqFireShots: 2 },
    ];
    const bad: string[] = [];
    try {
      variants.forEach((knobs, vi) => {
        Object.assign(GRID, structuredClone(snap), knobs);
        for (let seed = 201 + vi * 10; seed < 209 + vi * 10; seed++) bad.push(...play(seed, seed % 2 ? 5 : 7, 'greedy').bad.map(x => `v${vi} ${x}`));
      });
    } finally {
      Object.assign(GRID, structuredClone(snap));
    }
    expect(bad).toEqual([]);
  });
});

describe('grid replay rebuild with the v3 knobs', () => {
  it('matches the engine with the territory score, objectives, HQ points and armour growth', async () => {
    const { GRID } = await import('@/lib/duel/grid/config');
    const snap = structuredClone(GRID);
    const variants: Partial<typeof GRID>[] = [
      { scoreTarget: 14, objectiveEvery: 4, objectiveBonus: 2, armourGrowth: 4 },
      { scoreTarget: 12, scoreWhen: 'end', scoreHq: 3, scoreConnected: false, claimAdjacent: true },
      { scoreTarget: 20, scoreBehind: 1, scoreRamp: 3, scoreCity: 2, scoreFar: 2, objectiveEvery: 2, objectiveWarn: 0 },
    ];
    const bad: string[] = [];
    let scored = 0;
    try {
      variants.forEach((knobs, vi) => {
        Object.assign(GRID, structuredClone(snap), knobs);
        for (let seed = 301 + vi * 10; seed < 309 + vi * 10; seed++) {
          const r = play(seed, 7, 'greedy');
          bad.push(...r.bad.map(x => `v${vi} ${x}`));
          scored += r.steps;
        }
      });
    } finally {
      Object.assign(GRID, structuredClone(snap));
    }
    expect(bad).toEqual([]);
    expect(scored).toBeGreaterThan(0);
  });
});
