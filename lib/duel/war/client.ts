// Everything the war battle screen needs, in one browser-safe import (no
// pg, crypto or fs anywhere below). The planning helpers take the player's
// WarView directly (it satisfies WarBoard), so the browser offers exactly
// the orders the server will accept and can run validatePlan before sending.

export {
  canOrder, defOf, emeraldCostOf, frontHolder, hqAbility, hqSpeed, moveOf, orderOptions, other, planCost, playOf, underdog,
  reachOf, specSlots, towerAlive, towersDown, validatePlan, WarError, warHealth, warSpeed,
  type WarBoard, type WarBoardSide,
} from './engine';
export { warCard, warCards } from './cards';
export { emeraldCost, moveCost, WAR, WAR_ROUND_SECONDS, TERRITORIES, type WarConfig } from './config';
export { warBraceText, warComebackText, warStanceText, warIncomeText, warKeywordText, warShiftText, warSwitchText, warTankText } from './text';
export { type WarView, type WarPlayerView } from './view';
export * from './types';

import { WAR, WAR_ROUND_SECONDS } from './config';
import { MULLIGAN_SECONDS } from '../rules';

/** The numbers a rules guide shows, from the live config. */
export function warGuide() {
  return {
    towerHp: WAR.towerHp,
    towersToWin: WAR.towersToWin,
    roundLimit: WAR.roundLimit,
    startHand: WAR.startHand,
    income: WAR.income,
    bankCap: WAR.bankCap,
    garrison: WAR.garrison,
    handMax: WAR.handMax,
    healthMult: WAR.healthMult,
    chip: WAR.siege === 'chip' || WAR.siege === 'both' ? WAR.chip : 0,
    braceTaken: WAR.braceTaken,
    braceCounter: WAR.braceCounter,
    switchBrace: WAR.switchBrace,
    shiftAttack: WAR.shiftAttack,
    incomeStep: WAR.incomeStep,
    lostTowerIncome: WAR.lostTowerIncome,
    rebuild: WAR.rebuild,
    rebuildMax: WAR.rebuildMax,
    fallBounty: WAR.fallBounty,
    lastStand: WAR.lastStand,
    underdogInitiative: WAR.underdogInitiative,
    braceCounterFlat: WAR.braceCounterFlat,
    braceStance: WAR.braceStance,
    shiftAttackTiming: WAR.shiftAttackTiming,
    shiftAttackPower: WAR.shiftAttackPower,
    perk: { ...WAR.perk },
    roundSeconds: WAR_ROUND_SECONDS,
    mulliganSeconds: MULLIGAN_SECONDS,
  };
}
