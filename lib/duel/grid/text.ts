// Rules text for Warfront, where it differs from the duel game's
// (../text.ts). Card effects keep the duel wording (abilityText); movement,
// keywords, the HQ and the tank ability read differently on a grid, so a
// Warfront UI shows these instead. Everything reads the live GRID knobs, so
// the words cannot drift from the engine.

import { KEYWORD_TEXT, abilityText } from '../text';
import type { CardDef, Element, Keyword } from '../types';
import { gridSpeed, moveRange } from './board';
import { GRID, type GridConfig } from './config';
import { gridHqAbility } from './engine';
import type { GridPlayer } from './types';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How a unit of this element (and speed) moves, in one sentence. */
export function gridMoveText(el: Element, speed = 0, g: GridConfig = GRID): string {
  if (g.movement === 'uniform') return 'Moves up to 2 tiles orthogonally.';
  const r = moveRange(el, speed, g);
  switch (el) {
    case 'earth': return r === 1 ? 'Moves 1 tile in any direction.' : `Moves up to ${plural(r, 'step')} in any direction.`;
    case 'thunder': return `Moves up to ${plural(r, 'tile')} in a straight line (not diagonally), stopped by units and mountains.`;
    case 'air': return `Flies up to ${plural(r, 'tile')} diagonally, over units and mountains, landing on an empty tile${g.airStep > 0 ? `, or walks ${plural(g.airStep, 'tile')} straight up, down or sideways` : ''}.`;
    case 'fire': return `Moves up to ${plural(r, 'step')} in any direction.`;
    case 'water': return `Moves 1 tile in any direction, or up to ${plural(r, 'tile')} along water.`;
  }
}

/** A card's movement line, from its element and its speed (fast +1, slow -1). */
export function gridCardMoveText(def: Pick<CardDef, 'slug' | 'tier' | 'element'>, g: GridConfig = GRID): { speed: 'fast' | 'normal' | 'slow'; text: string } {
  const sp = gridSpeed(def, g);
  return { speed: sp > 0 ? 'fast' : sp < 0 ? 'slow' : 'normal', text: gridMoveText(def.element, sp, g) };
}

/** Terrain, in one line each. */
export function gridTerrainText(): { name: string; text: string }[] {
  return [
    { name: 'Mountain', text: 'Blocks movement for everyone but Air, and blocks Ranged sight. Nobody can stand on it.' },
    { name: 'Water', text: 'Entering water ends a move, except for Water units, which can run along it.' },
  ];
}

/** Keyword text under the current GRID settings. */
export function gridKeywordText(kw: Keyword, g: GridConfig = GRID): { name: string; text: string } {
  const name = KEYWORD_TEXT[kw].name;
  switch (kw) {
    case 'guard': return { name, text: 'Zone of control: an enemy that moves next to it must stop there.' };
    case 'rush': return { name, text: 'Can act the turn it arrives.' };
    case 'ranged': return { name, text: `Attacks in a straight line up to ${plural(g.rangedReach, 'tile')} away, needing a clear line. Never struck back.` };
    case 'stealth': return { name, text: 'Cannot be targeted until it attacks or uses its ability, or an enemy ends a move next to it.' };
    case 'shield': return KEYWORD_TEXT.shield;
    case 'drain': return { name, text: `Attack damage it deals heals your HQ${g.hqHealShare < 1 ? g.hqHealShare > 0 ? ` (${Math.round(100 * g.hqHealShare)}%)` : ' (HQs cannot be healed in Warfront, so it does nothing)' : ''}.` };
    case 'pierce': return { name, text: `Also hits the enemy straight behind its target for ${g.pierceShare >= 1 ? 'its power' : `${Math.round(100 * g.pierceShare)}% of its power`}.` };
    case 'regen': return { name, text: `Restores ${Math.round(2 * g.healthMult)} health at the start of your turn.` };
  }
}

/** The combat rules, one line each. */
export function gridCombatText(g: GridConfig = GRID): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  out.push({ name: 'Attack', text: g.adjacency === 8 ? 'Hit an enemy on one of the eight tiles around you.' : 'Hit an enemy directly above, below or beside you.' });
  if (g.hqReach > 1) out.push({ name: 'Siege', text: `The enemy HQ can be attacked from up to ${plural(g.hqReach, 'tile')} away.` });
  if (g.retaliation) out.push({ name: 'Strike back', text: 'A defender that survives a melee hit strikes back for its power. Ranged units neither take nor give strike-backs.' });
  if (g.flank > 0) out.push({ name: 'Flanking', text: `+${g.flank} damage for each other friendly unit next to the target (up to +${g.flankCap}).` });
  out.push({ name: 'Brace', text: gridBraceText(g) });
  if (g.surround) out.push({ name: 'Surround', text: 'A unit with no free tile above, below or beside it (walls, edges and enemies count) is destroyed at the end of its enemy\'s turn.' });
  return out;
}

/** The HQ and node rules, one line each. */
export function gridHqText(g: GridConfig = GRID): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  out.push({ name: 'HQ', text: `${g.hqHp} health. Destroy the enemy HQ to win${g.scoreTarget > 0 ? ` (or reach ${g.scoreTarget} points)` : ''}.${g.hqHealShare <= 0 ? ' HQs cannot be healed.' : ''}` });
  if (g.armourGrowth > 0) out.push({ name: 'Hardening', text: `Your HQ gains +1 armour for every ${plural(g.armourGrowth, 'health', 'health')} it has lost, so a battered HQ is harder to finish.` });
  if (g.hqFire > 0) {
    const shots = Math.max(1, g.hqFireShots), reach = Math.max(1, g.hqFireReach);
    const who = `${shots === 1 ? 'one enemy' : `up to ${shots} enemies`} ${reach === 1 ? 'next to it' : `within ${plural(reach, 'tile')}`}`;
    out.push({ name: 'HQ fire', text: `At the start of your turn your HQ hits ${who} for ${g.hqFire}${g.hqFireRamp > 0 ? `, +1 for every ${g.hqFireRamp} health it has lost` : ''} (ones it can destroy first, then the strongest).` });
  }
  if (g.hqAura > 0) out.push({ name: 'Home ground', text: `Your units next to your HQ have +${g.hqAura} health.` });
  out.push({ name: 'Claim', text: g.claimAdjacent ? 'End your turn with a unit on a node: the node is yours until the enemy does the same.' : 'End your turn with a unit on a node and no enemy next to it: the node is yours until the enemy does the same.' });
  out.push({ name: 'Connection', text: 'A node is connected when a chain of your units and nodes, each next to the last above, below or beside it, links it to your HQ. An enemy standing on one of your nodes breaks the chain there.' });
  const gives = [
    ...(g.scoreTarget > 0 ? [`scores ${g.scoreConnected ? '' : '(as does any node you hold) '}at the start of your turn`] : []),
    ...(g.nodeIncome > 0 ? [`gives +${g.nodeIncome} emerald a turn`] : []),
    'lets you deploy next to it',
    ...(g.armourPerNode > 0 ? [`gives your HQ +${g.armourPerNode} armour: every hit on it does ${g.armourPerNode} less (never below ${g.armourMin})`] : []),
  ];
  out.push({ name: 'Connected nodes', text: `Each ${gives.slice(0, -1).join(', ')}${gives.length > 1 ? ' and ' : ''}${gives[gives.length - 1]}. Cut the chain to strip it.` });
  out.push(...gridScoreText(g));
  return out;
}

/** What a node is worth to its holder each time it scores (the city, a node past the middle, any other), before the objective's bonus. */
export function gridNodeValues(g: GridConfig = GRID): { node: number; city: number; far: number } {
  return { node: g.scoreNode, city: g.scoreCity, far: g.scoreFar };
}

/** The territory score and the rotating objective, one line each (empty when the score is off). */
export function gridScoreText(g: GridConfig = GRID): { name: string; text: string }[] {
  if (g.scoreTarget <= 0) return [];
  const out: { name: string; text: string }[] = [];
  const which = g.scoreConnected ? 'connected node you hold' : 'node you hold';
  const worth = [`${plural(g.scoreNode, 'point')}`];
  if (g.scoreFar !== g.scoreNode) worth.push(`${plural(g.scoreFar, 'point')} on the enemy's half`);
  if (g.scoreCity !== g.scoreNode) worth.push(`${plural(g.scoreCity, 'point')} for the city`);
  const when = g.scoreWhen === 'start' ? 'At the start of your turn' : 'At the end of your turn';
  out.push({ name: 'Territory score', text: `${when} each ${which} scores ${worth.join(', ')}. Reach ${g.scoreTarget} points to win.` });
  if (g.scoreHq > 0) out.push({ name: 'Raids', text: `Every ${plural(g.scoreHq, 'point')} of damage on the enemy HQ also scores you 1.` });
  if (g.objectiveEvery > 0) {
    out.push({ name: 'Objective', text: `One node at a time is the objective, for ${plural(g.objectiveEvery, 'turn')} (both players' turns count), and scores +${g.objectiveBonus} for whoever holds it. The next one is announced ${plural(g.objectiveWarn, 'turn')} before it starts.` });
  }
  return out;
}

/** Turns, economy and limits, one line each. */
export function gridTurnText(g: GridConfig = GRID): { name: string; text: string }[] {
  const grow = g.incomeStep > 0 ? `, rising by 1 every ${plural(g.incomeStep, 'turn')}` : '';
  const out = [
    { name: 'Upkeep', text: `+${g.income} emeralds${grow}${g.nodeIncome > 0 ? `, +${g.nodeIncome} per connected node` : ''} (bank up to ${g.bankCap})${g.scoreTarget > 0 && g.scoreWhen === 'start' ? ', your nodes score' : ''}, draw ${plural(g.draw, 'card')}, then your HQ fires.` },
    { name: 'Orders', text: `Up to ${g.orders} a turn. An order moves one unit, which may then attack, use its move ability${g.abilityAttack ? ' (and still attack after it)' : ''} or brace. The tank ability is an order too. Each unit acts once a turn.` },
    { name: 'Deploy', text: `Costs emeralds, not an order: onto your back row, or next to a connected node you hold${g.contested ? ', never next to an enemy unit' : ''}. New units act next turn unless they have Rush.${g.maxUnits > 0 ? ` At most ${g.maxUnits} units on the board.` : ''}` },
    { name: 'First turn', text: `The first player has ${plural(g.firstOrders, 'order')} on turn 1 and skips its draw; the second player starts with ${plural(g.startEmeralds + g.secondBonus, 'emerald')}.` },
    { name: 'Turn limit', text: `After ${plural(g.turnLimit, 'turn')} each: ${g.scoreTarget > 0 ? 'the higher score' : 'most connected nodes'} wins, then most HQ health, then a draw.` },
  ];
  if (g.catchUp > 0) out.push({ name: 'Catch-up', text: `+${g.catchUp} emerald${g.catchUp === 1 ? '' : 's'} a turn while you have fewer connected nodes than your enemy.` });
  if (g.rally > 0) out.push({ name: 'Rally', text: `+${plural(g.rally, 'order')} a turn while your HQ is at half health or less.` });
  out.push(...gridComebackText(g));
  return out;
}

/** The brace rule in one line: an order, a free stance, or both. */
export function gridBraceText(g: GridConfig = GRID): string {
  const half = `take ${g.braceTaken === 0.5 ? 'half' : `${Math.round(100 * g.braceTaken)}% of the`} damage (rounded down) until your next turn`;
  if (g.autoBrace === 'idle') return `Free: every unit of yours that did not act this turn ends it braced, and will ${half}. A unit can also brace after its move. Both players see it.`;
  if (g.autoBrace === 'passive') return `Free: every unit of yours that did not attack or use its ability this turn ends it braced, and will ${half}. Both players see it.`;
  return `${g.braceOrders ? 'An order' : 'Free for a unit that has not acted'}: ${half}. Both players see it.`;
}

/** The comeback rules in force, one line each (reinforcements, setbacks, outnumbered, last stand). */
export function gridComebackText(g: GridConfig = GRID): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  const gap = Math.max(1, g.reinforceGap);
  const fewer = gap === 1 ? 'fewer units on the board than your enemy' : `at least ${gap} fewer units on the board than your enemy`;
  if (g.reinforceDiscount > 0 || g.reinforceReady) {
    const parts = [
      ...(g.reinforceDiscount > 0 ? [`your cards cost ${plural(g.reinforceDiscount, 'emerald')} less (never below 1)`] : []),
      ...(g.reinforceReady ? ['a unit you deploy can act at once'] : []),
    ];
    out.push({ name: 'Reinforcements', text: `While you have ${fewer}, ${parts.join(' and ')}.` });
  }
  if (g.outnumbered > 0) out.push({ name: 'Outnumbered', text: `While you have fewer units on the board than your enemy, your attacks deal +${g.outnumbered}.` });
  if (g.setbackOn !== 'off' && (g.setbackOrders > 0 || g.setbackEmeralds > 0 || g.setbackDiscount > 0)) {
    const why = g.setbackOn === 'node' ? 'cost you a connected node' : g.setbackOn === 'hq' ? `took ${g.setbackHq} or more from your HQ` : `cost you a connected node or took ${g.setbackHq} or more from your HQ`;
    const gets = [
      ...(g.setbackOrders > 0 ? [`+${plural(g.setbackOrders, 'order')}`] : []),
      ...(g.setbackEmeralds > 0 ? [`+${plural(g.setbackEmeralds, 'emerald')}`] : []),
      ...(g.setbackDiscount > 0 ? [`cards ${g.setbackDiscount} cheaper`] : []),
    ];
    out.push({ name: 'Setback', text: `If the enemy's last turn ${why}, this turn you get ${gets.join(', ')}.` });
  }
  if (g.lastStand > 0) out.push({ name: 'Last stand', text: `Once a game, at the start of your turn with your HQ at ${Math.round(100 * g.lastStandAt)}% health or less, it is repaired by ${g.lastStand}.` });
  return out;
}

/** The tank (HQ) ability of a side, in emeralds. */
export function gridTankText(p: Pick<GridPlayer, 'tank'>, g: GridConfig = GRID): { name: string; cost: number; text: string } {
  const a = gridHqAbility(p, g);
  return { name: a.name ?? 'Tank', cost: a.cost ?? 0, text: `${abilityText(a).text} One order, once a turn.` };
}
