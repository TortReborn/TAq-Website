// Rules text for Three-Front War, where it differs from the duel game's
// (../text.ts). Card effects keep the duel wording (abilityText); keywords
// and the tank ability read differently on a lane board, so a war UI shows
// these instead.

import { KEYWORD_TEXT, abilityText } from '../text';
import type { Keyword } from '../types';
import { WAR } from './config';
import { hqAbility } from './engine';
import type { WarPlayer } from './types';

/** Keyword text under the current WAR settings. */
export function warKeywordText(kw: Keyword): { name: string; text: string } {
  const name = KEYWORD_TEXT[kw].name;
  switch (kw) {
    case 'guard':
      return { name, text: WAR.guard === 'opposite' ? 'The enemy unit in this lane must attack it first.' : 'Enemies that can reach it must attack it first.' };
    case 'stealth':
      return { name, text: `Cannot be targeted until it acts.${WAR.stealthStrike ? ' Its first attack ignores Guard.' : ''}` };
    case 'ranged':
      return { name, text: 'Can attack any lane.' };
    case 'rush':
      return { name, text: 'Acts before units without Rush.' };
    case 'drain':
      return { name, text: 'Attack damage it deals repairs your tower in its lane.' };
    case 'pierce':
      return { name, text: 'Attack damage beyond a unit\'s health hits the tower in that lane.' };
    case 'regen':
      return { name, text: `Restores ${Math.round(2 * WAR.healthMult)} health each round.` };
    case 'shield':
      return KEYWORD_TEXT.shield;
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const share = (x: number) => (x >= 1 ? '' : x === 0.5 ? 'half ' : `${pct(x)} of `);

/** What the Brace order does under the current settings. */
export function warBraceText(): string {
  const taken = WAR.braceTaken <= 0.34 && WAR.braceTaken >= 0.33 ? 'a third of the damage' : WAR.braceTaken === 0.5 ? 'half damage' : `${pct(WAR.braceTaken)} of the damage`;
  const when = WAR.braceStance === 'extend' ? 'this round and next'
    : WAR.braceStance === 'next' ? 'next round' : 'this round';
  const open = WAR.braceStance === 'off' ? ''
    : ' Your opponent sees the stance while planning next round. Switching out or shifting ends it.';
  const back = WAR.braceCounterFlat > 0 ? ` If it survives a hit, it strikes back at the attacker for ${WAR.braceCounterFlat}.`
    : WAR.braceCounter > 0 ? ` If it survives a hit, it strikes back at the attacker for ${share(WAR.braceCounter)}its power (rounded up).` : '';
  return `Take ${taken} ${when} (rounded down).${open}${back}`;
}

/** A short badge for a unit holding a brace stance (WAR.braceStance). */
export function warStanceText(): string {
  return `Braced: takes ${WAR.braceTaken === 0.5 ? 'half' : pct(WAR.braceTaken)} damage this round${WAR.braceCounterFlat > 0 || WAR.braceCounter > 0 ? ' and strikes back' : ''}.`;
}

/** What Switch and Shift do under the current settings. */
export function warSwitchText(): string {
  return `Swap with a garrison unit before attacks resolve.${WAR.switchBrace && WAR.brace ? ' The unit coming in is braced this round.' : ''}`;
}
export function warShiftText(): string {
  if (!WAR.shiftAttack) return 'Move to the next slot, swapping with whoever is there. It does not attack this round.';
  const into = WAR.shiftAttack === 'empty' ? 'Shifting into an empty slot, it' : 'It';
  const how = [WAR.shiftAttackTiming === 'last' ? 'after every other action' : '', WAR.shiftAttackPower < 1 ? `at ${WAR.shiftAttackPower === 0.5 ? 'half' : pct(WAR.shiftAttackPower)} power` : ''].filter(Boolean).join(', ');
  return `Move to the next slot, swapping with whoever is there. ${into} can still attack from its new lane${how ? `, ${how}` : ''}.`;
}

/** Income, including any growth over the war and the war chest. */
export function warIncomeText(): string {
  const grow = WAR.incomeStep > 0 ? `, rising by 1 every ${WAR.incomeStep === 1 ? 'round' : `${WAR.incomeStep} rounds`}` : '';
  const chest = WAR.lostTowerIncome > 0 ? ` Each of your towers that has fallen adds ${WAR.lostTowerIncome} more.` : '';
  return `+${WAR.income} emeralds a round${grow} (bank up to ${WAR.bankCap}).${chest}`;
}

/** The comeback rules in force, one line each (empty when none are on). */
export function warComebackText(): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  if (WAR.rebuild > 0) {
    const times = WAR.rebuildMax === 1 ? 'once a war' : `up to ${WAR.rebuildMax} times a war`;
    out.push({ name: 'Retake', text: `If you hold the front of a lane whose tower fell (your unit there, none opposite) at upkeep, that tower is rebuilt with ${WAR.rebuild} health, ${times}.` });
  }
  if (WAR.underdogInitiative) {
    const behind = WAR.underdogInitiative === 'fallen' ? 'The side that has lost more towers' : 'The side behind on towers (fewer standing, then less tower health)';
    out.push({ name: 'Initiative', text: `${behind} wins speed ties and deploys first.` });
  }
  if (WAR.fallBounty > 0) out.push({ name: 'Bounty', text: `When one of your towers falls you gain ${WAR.fallBounty} emeralds.` });
  if (WAR.lastStand > 0) out.push({ name: 'Last stand', text: `When one of your towers falls, your other towers gain ${WAR.lastStand} health.` });
  if (WAR.lostTowerIncome > 0) out.push({ name: 'War chest', text: `+${WAR.lostTowerIncome} emerald income for each of your towers that has fallen.` });
  return out;
}

/** The tank (HQ) ability of a side, in emeralds. */
export function warTankText(p: Pick<WarPlayer, 'tank'>): { name: string; cost: number; text: string } {
  const a = hqAbility(p);
  return { name: a.name ?? 'Tank', cost: a.cost ?? 0, text: `${abilityText(a).text} Once a round.` };
}
