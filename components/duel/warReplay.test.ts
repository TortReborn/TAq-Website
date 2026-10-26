// The reveal's board rebuild (warReplay.ts) against the real engine: every
// round of many random wars must rebuild to exactly the server's positions
// and towers, and every step must carry narration.

import { describe, expect, it } from 'vitest';
import { starterDeck } from '@/lib/duel/deck';
import { Rng } from '@/lib/duel/rng';
import type { Element } from '@/lib/duel/types';
import { chooseWarMulligan, chooseWarPlan } from '@/lib/duel/war/ai';
import { applyWarAction, createWar, defOf, orderOptions, planCost, validatePlan } from '@/lib/duel/war/engine';
import { LANES, type Lane, type Plan, type Side, type WarState } from '@/lib/duel/war/types';
import { warViewFor } from '@/lib/duel/war/view';
import { buildReplay } from './warReplay';

const ELEMENTS: Element[] = ['fire', 'water', 'earth', 'thunder', 'air'];

/** A legal plan chosen at random: switches, shifts, braces, moves and deploys all get exercised. */
function randomPlan(s: WarState, side: Side, rng: Rng): Plan {
  const v = warViewFor(s, side);
  const p = v.players[side];
  const plan: Plan = { orders: [null, null, null], deploys: [], hq: null };
  const usedG = new Set<number>();
  for (const lane of LANES) {
    const opts = orderOptions(v, side, lane).filter(o => o.k !== 'switch' || !usedG.has(o.garrison));
    if (!opts.length || rng.float() < 0.1) continue;
    const o = opts[rng.int(opts.length)];
    if (o.k === 'switch') usedG.add(o.garrison);
    if (o.k === 'shift' && !p.active[(lane + o.dir) as Lane] && rng.float() < 0.7) {
      const to = (lane + o.dir) as Lane;
      const hits = orderOptions({ ...v, players: v.players.map((x, i) => (i === side ? { ...x, active: x.active.map((u, l) => (l === to ? x.active[lane] : l === lane ? null : u)) } : x)) as typeof v.players }, side, to)
        .flatMap(x => (x.k === 'attack' ? [x.target] : []));
      if (hits.length) { plan.orders[lane] = { ...o, attack: hits[rng.int(hits.length)] }; continue; }
    }
    plan.orders[lane] = o;
  }
  const empty = LANES.filter(l => !p.active[l]);
  for (const h of p.hand ?? []) {
    if (rng.float() < 0.5) continue;
    const to = empty.length && rng.float() < 0.8 ? empty.shift()! : 'garrison';
    plan.deploys.push({ uid: h.uid, to });
    if (planCost(v, side, plan) > p.emeralds) plan.deploys.pop();
  }
  if (rng.float() < 0.2) plan.hq = {};
  try { validatePlan(v, side, plan); return plan; } catch { /* fall back */ }
  plan.hq = null;
  plan.deploys = plan.deploys.filter(d => d.to !== 'garrison');
  try { validatePlan(v, side, plan); return plan; } catch { /* fall back */ }
  return { orders: plan.orders.map(o => (o?.k === 'move' ? null : o)), deploys: [], hq: null };
}

function playAndCheck(seed: number, bot: boolean) {
  const rng = new Rng(seed);
  const a = starterDeck(ELEMENTS[seed % 5]);
  const b = starterDeck(ELEMENTS[(seed * 3 + 1) % 5]);
  let s = createWar(seed, [{ name: 'A', avatar: '', deck: a }, { name: 'B', avatar: '', deck: b }]);
  for (const side of [0, 1] as Side[]) s = applyWarAction(s, side, chooseWarMulligan(s, side));
  let rounds = 0;
  const bad: string[] = [];
  while (s.phase === 'plan' && rounds < 40) {
    const me = (seed % 2) as Side;
    const before = warViewFor(s, me);
    for (const side of [0, 1] as Side[]) {
      let plan = bot ? chooseWarPlan(s, side) : randomPlan(s, side, rng);
      try { validatePlan(s, side, plan); } catch { plan = { orders: [null, null, null], deploys: [], hq: null }; }
      s = applyWarAction(s, side, { type: 'plan', plan });
    }
    rounds++;
    const after = warViewFor(s, me);
    const from = before.logBase + before.log.length;
    const fresh = after.log.slice(Math.max(0, from - after.logBase));
    const card = (slug: string) => defOf(slug, after.extraDefs);
    const r = buildReplay(from, before, after, fresh, card);
    expect(r).not.toBeNull();
    if (!r!.ok) bad.push(`seed ${seed} round ${r!.round}: ${r!.mismatch}`);
    for (const st of r!.steps) {
      expect(st.headline, `${st.kind} headline`).toBeTruthy();
      expect(st.phase).toBeTruthy();
      expect(st.recap).toBeTruthy();
      expect(st.headline).not.toMatch(/undefined|NaN|A unit/);
      for (const line of st.results) expect(line).not.toMatch(/undefined|NaN/);
    }
    // Every attack and strike-back gets its own step, in log order.
    const heads = r!.steps.map(x => x.events[0].k);
    expect(heads.filter(k => k === 'attack').length).toBe(fresh.filter(e => e.k === 'attack').length);
    expect(heads.filter(k => k === 'counter').length).toBe(fresh.filter(e => e.k === 'counter').length);
    expect(r!.steps.flatMap(x => x.events).length).toBe(fresh.filter(e => e.k !== 'resolved').length);
  }
  return bad;
}

describe('war reveal rebuild', () => {
  it('rebuilds every round of random wars to the server board', () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 60; seed++) bad.push(...playAndCheck(seed, false));
    expect(bad).toEqual([]);
  });

  it('rebuilds every round of bot wars to the server board', () => {
    const bad: string[] = [];
    for (let seed = 101; seed <= 106; seed++) bad.push(...playAndCheck(seed, true));
    expect(bad).toEqual([]);
  }, 120_000);
});
