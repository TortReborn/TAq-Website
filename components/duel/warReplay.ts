// A round's reveal, rebuilt step by step on the client.
//
// The server sends the resolved view and the round's log at once. To show
// cause before effect, the board is rebuilt from the view the player was
// planning on (`before`) by applying the log's events in order, one step per
// action. Each step keeps the board as it was just before and just after it,
// so the reveal can pause, step back and jump anywhere.
//
// Most events carry what the board needs (damage and heal carry the health
// left; switch, shift, deploy and death say who moved where). A few effects
// are not logged (buffs, grants, tide), so health or power can drift until the
// next logged hit corrects it. Positions and towers must match the server's
// final view exactly; if they do not, `ok` is false and the reveal shows the
// server's board throughout (narration still plays).
//
// Pure TypeScript: no React, no DOM.

import {
  emeraldCost, hqAbility, hqSpeed, moveCost, moveOf, other, WAR, warHealth, warSpeed,
  type CardDef, type Lane, type Side, type SlotRef, type WarEvent, type WarUnit, type WarView,
} from '@/lib/duel/war/client';
import { LANE_NAME } from './warShared';

const SPEED_WORD: Record<number, string> = { 1: 'slow', 2: 'normal speed', 3: 'fast' };

export type StepKind = 'stance' | 'switch' | 'shift' | 'deploy' | 'action' | 'counter' | 'upkeep' | 'end';

/** Something on the board a line can be drawn from or to. */
export type Spot =
  | { k: 'slot'; side: Side; lane: Lane }
  | { k: 'tower'; side: Side; lane: Lane }
  | { k: 'garrison'; side: Side; g: number }
  | { k: 'hq'; side: Side };

export interface Line { from: Spot; to: Spot; kind: 'attack' | 'move' | 'swap' }

export interface ReplayStep {
  i: number;
  kind: StepKind;
  events: WarEvent[];
  /** The board just before and just after this step. */
  before: WarView;
  after: WarView;
  /** "Switches & shifts", "Deploys", "Actions: 2 of 7"... */
  phase: string;
  /** The side acting (null: both / neither). */
  side: Side | null;
  /** The acting unit (highlighted), if any. */
  actor?: string;
  /** The acting tank (HQ), if any. */
  hq?: Side;
  /** Slots to mark as the target, while the step is announced and once it lands. */
  aim: SlotRef[];
  hitAim: SlotRef[];
  /** The line drawn while announcing, and once it lands (e.g. after a Guard redirect). */
  cueLine?: Line;
  hitLine?: Line;
  /** Shown while the step is announced: who is about to do what. */
  headline: string;
  /** Shown once it lands: what happened and why. */
  results: string[];
  /** One line for the round recap. */
  recap: string;
  /** How much the recap line matters (0: routine, hidden unless expanded). */
  weight: 0 | 1;
}

export interface RoundTally { round: number; dealt: number; taken: number; lost: number; killed: number; towersWon: number; towersLost: number }

export interface Replay {
  /** Identifies the replay (the log position it starts at). */
  id: number;
  round: number;
  steps: ReplayStep[];
  /** The rebuilt board matches the server's final view. */
  ok: boolean;
  /** Why it did not match, for the console. */
  mismatch?: string;
  final: WarView;
  tally: RoundTally;
}

const clone = <T>(x: T): T => structuredClone(x);
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
export const ordinal = (n: number) => {
  const t = n % 100;
  const suf = t >= 11 && t <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suf}`;
};
const lane = (l: Lane) => LANE_NAME[l].toLowerCase();

// --- The war log sentence builder (shared with the war log panel) ---------------

export function describe(e: WarEvent, v: WarView, nameOf: (uid: string) => string, card: (slug: string) => CardDef): string | null {
  const who = (side: Side) => (side === v.you ? 'You' : v.players[side].name);
  const slot = (r: SlotRef) => `${r.side === v.you ? 'your' : `${v.players[r.side].name}'s`} ${lane(r.lane)}`;
  const tower = (r: SlotRef) => cap(`${slot(r)} tower`);
  switch (e.k) {
    case 'round': return null;
    case 'income': return e.side === v.you ? `You gain ${e.n} emeralds.` : null;
    case 'perk': return `${who(e.side)} ${e.side === v.you ? 'hold' : 'holds'} ${v.territories[e.lane].name}: ${e.perk === 'city' ? 'city income' : e.perk}.`;
    case 'draw': return e.side === v.you ? `You draw ${e.n === 1 ? 'a card' : `${e.n} cards`}.` : null;
    case 'burn': return `${who(e.side)} ${e.side === v.you ? 'have' : 'has'} a full hand; ${card(e.slug).name} is burned.`;
    case 'deploy': return `${who(e.side)} ${e.side === v.you ? 'deploy' : 'deploys'} ${card(e.slug).name}${e.to === 'garrison' ? ' to the garrison' : ` ${lane(e.to)}`}.`;
    case 'switch': return `${who(e.side)} ${e.side === v.you ? 'switch' : 'switches'} ${nameOf(e.in)} in for ${nameOf(e.out)}.`;
    case 'shift': return `${who(e.side)} ${e.side === v.you ? 'shift' : 'shifts'} ${lane(e.from)} to ${lane(e.to)}.`;
    case 'brace': return e.until !== undefined ? `${nameOf(e.uid)} braces, and holds the stance next round.` : `${nameOf(e.uid)} braces.`;
    case 'attack': return e.hit === 'fizzle'
      ? `${nameOf(e.uid)} attacks ${slot(e.target)}: nothing there.`
      : e.hit === 'tower' ? `${nameOf(e.uid)} hits ${slot(e.target)} tower.`
        : `${nameOf(e.uid)} attacks ${slot(e.target)}${e.swapped ? ', catching the unit that swapped in' : ''}.`;
    case 'move': return `${nameOf(e.uid)} uses ${e.name}.`;
    case 'hq': return `${who(e.side)} ${e.side === v.you ? 'use' : 'uses'} ${e.name}.`;
    case 'damage': return e.tower ? `${tower(e.target)} takes ${e.n} (${Math.max(0, e.hp)} left).` : `${e.uid ? nameOf(e.uid) : 'It'} takes ${e.n}${e.braced ? ', braced' : ''}.`;
    case 'heal': return e.tower ? `${tower(e.target)} repairs ${e.n}.` : `${v.players[e.target.side].active[e.target.lane] ? nameOf(v.players[e.target.side].active[e.target.lane]!.uid) : 'A unit'} heals ${e.n}.`;
    case 'shield': return `${nameOf(e.uid)}'s shield breaks.`;
    case 'freeze': return `${nameOf(e.uid)} is frozen.`;
    case 'bounce': return `${card(e.slug).name} returns to hand.`;
    case 'death': return `${card(e.slug).name} is defeated.`;
    case 'tower': return `${tower({ side: e.side, lane: e.lane })} falls!`;
    case 'counter': return `${nameOf(e.uid)} strikes back.`;
    case 'rebuild': return `${tower({ side: e.side, lane: e.lane })} is rebuilt (${e.hp} health).`;
    case 'bounty': return `${who(e.side)} ${e.side === v.you ? 'gain' : 'gains'} ${e.n} emeralds from the fallen tower.`;
    case 'laststand': return `${who(e.side)} ${e.side === v.you ? 'make' : 'makes'} a last stand: other towers +${e.n}.`;
    case 'end': return e.winner === null ? 'The war is a draw.' : `${who(e.winner)} ${e.winner === v.you ? 'win' : 'wins'}!`;
    default: return null;
  }
}

// --- Applying events to a board ----------------------------------------------------

function findOnBoard(v: WarView, uid: string): { side: Side; lane: Lane | null; g: number; unit: WarUnit } | null {
  for (const side of [0, 1] as Side[]) {
    const p = v.players[side];
    for (let l = 0; l < 3; l++) if (p.active[l]?.uid === uid) return { side, lane: l as Lane, g: -1, unit: p.active[l]! };
    const g = p.garrison.findIndex(x => x.uid === uid);
    if (g >= 0) return { side, lane: null, g, unit: p.garrison[g] };
  }
  return null;
}

function newUnit(def: CardDef, uid: string): WarUnit {
  const health = warHealth(def);
  return {
    uid, slug: def.slug, power: Math.round(def.power * WAR.powerMult), health, maxHealth: health, keywords: def.keywords.slice(),
    speed: warSpeed(def), shield: def.keywords.includes('shield'), stealth: def.keywords.includes('stealth'), frozenRound: 0, boost: 0,
  };
}

/**
 * Apply one logged event to a board, in place. `final` is the server's view
 * after the round, used only to learn which cards a draw brought in.
 */
export function applyEvent(b: WarView, e: WarEvent, card: (slug: string) => CardDef, final: WarView): void {
  const bank = (side: Side, n: number) => { const p = b.players[side]; p.emeralds = Math.max(0, Math.min(WAR.bankCap, p.emeralds + n)); };
  switch (e.k) {
    case 'round': {
      b.round = e.round;
      for (const p of b.players) for (const u of [...p.active, ...p.garrison]) if (u) u.boost = 0;
      return;
    }
    case 'income': bank(e.side, e.n); return;
    case 'bounty': bank(e.side, e.n); return;
    case 'perk': {
      if (e.perk === 'ore') { const u = b.players[e.side].active[e.lane]; if (u) u.boost += WAR.perk.ore; }
      return;
    }
    case 'draw': {
      const p = b.players[e.side];
      p.handCount += e.n;
      p.deckCount = Math.max(0, p.deckCount - e.n);
      if (p.hand) {
        const have = new Set(p.hand.map(h => h.uid));
        const incoming = (final.players[e.side].hand ?? []).filter(h => !have.has(h.uid)).slice(0, e.n);
        p.hand = [...p.hand, ...incoming];
      }
      return;
    }
    case 'burn': { const p = b.players[e.side]; p.deckCount = Math.max(0, p.deckCount - 1); return; }
    case 'deploy': {
      const p = b.players[e.side];
      const def = card(e.slug);
      const fromHand = p.hand ? p.hand.some(h => h.uid === e.uid) : def.tier !== 'token';
      const u = newUnit(def, e.uid);
      if (e.to === 'garrison') p.garrison.push(u);
      else p.active[e.to] = u;
      if (fromHand) {
        bank(e.side, -emeraldCost(def.cost));
        p.handCount = Math.max(0, p.handCount - 1);
        if (p.hand) p.hand = p.hand.filter(h => h.uid !== e.uid);
      }
      return;
    }
    case 'switch': {
      const p = b.players[e.side];
      const out = p.active[e.lane];
      const g = p.garrison.findIndex(x => x.uid === e.in);
      if (!out || out.uid !== e.out || g < 0) throw new Error(`switch ${e.out}->${e.in} not on board`);
      p.active[e.lane] = p.garrison[g];
      p.garrison[g] = out;
      out.bracedUntil = 0;
      return;
    }
    case 'shift': {
      const p = b.players[e.side];
      [p.active[e.from], p.active[e.to]] = [p.active[e.to], p.active[e.from]];
      for (const x of [p.active[e.from], p.active[e.to]]) if (x) x.bracedUntil = 0;
      return;
    }
    case 'brace': {
      const f = findOnBoard(b, e.uid);
      // A switch-in brace (no `until`) lasts this round only: shown as a stance for the round.
      if (f) f.unit.bracedUntil = e.until ?? Math.max(f.unit.bracedUntil ?? 0, b.round);
      return;
    }
    case 'attack': {
      const f = findOnBoard(b, e.uid);
      if (f) f.unit.stealth = false;
      return;
    }
    case 'move': {
      const f = findOnBoard(b, e.uid);
      if (f) {
        f.unit.stealth = false;
        bank(e.side, -moveCost(moveOf(card(f.unit.slug))?.cost ?? 0));
      }
      return;
    }
    case 'hq': bank(e.side, -(hqAbility(b.players[e.side]).cost ?? 0)); return;
    case 'damage': {
      const p = b.players[e.target.side];
      if (e.tower) { p.towers[e.target.lane] = Math.max(0, e.hp); return; }
      const u = (e.uid ? findOnBoard(b, e.uid)?.unit : null) ?? p.active[e.target.lane];
      if (u) u.health = e.hp;
      return;
    }
    case 'heal': {
      const p = b.players[e.target.side];
      if (e.tower) { p.towers[e.target.lane] = e.hp; return; }
      const u = p.active[e.target.lane];
      if (u) u.health = e.hp;
      return;
    }
    case 'shield': { const f = findOnBoard(b, e.uid); if (f) f.unit.shield = false; return; }
    case 'freeze': { const f = findOnBoard(b, e.uid); if (f) f.unit.frozenRound = Math.max(f.unit.frozenRound, b.round + 1); return; }
    case 'bounce': {
      const f = findOnBoard(b, e.uid);
      if (!f || f.lane === null) throw new Error(`bounce ${e.uid} not on board`);
      b.players[f.side].active[f.lane] = null;
      if (card(e.slug).tier !== 'token') b.players[f.side].handCount++;
      return;
    }
    case 'death': {
      const p = b.players[e.side];
      if (p.active[e.lane]?.uid !== e.uid) throw new Error(`death ${e.uid} not in ${e.side}:${e.lane}`);
      p.active[e.lane] = null;
      return;
    }
    case 'tower': b.players[e.side].towers[e.lane] = 0; return;
    case 'rebuild': {
      const p = b.players[e.side];
      p.towers[e.lane] = e.hp;
      p.rebuilds = (p.rebuilds ?? 0) + 1;
      return;
    }
    case 'laststand': {
      const p = b.players[e.side];
      p.towers = p.towers.map(t => (t > 0 ? t + e.n : t));
      return;
    }
    case 'end': b.phase = 'over'; b.winner = e.winner; b.endReason = e.reason; return;
    case 'counter': case 'resolved': return;
  }
}

/** Where the rebuilt board and the server's disagree on who stands where, or on towers. */
function diverges(a: WarView, b: WarView): string | null {
  for (const side of [0, 1] as Side[]) {
    const x = a.players[side];
    const y = b.players[side];
    for (let l = 0; l < 3; l++) {
      if ((x.active[l]?.uid ?? null) !== (y.active[l]?.uid ?? null)) return `side ${side} lane ${l}: ${x.active[l]?.uid} vs ${y.active[l]?.uid}`;
      if (x.towers[l] !== y.towers[l]) return `side ${side} tower ${l}: ${x.towers[l]} vs ${y.towers[l]}`;
    }
    const gx = x.garrison.map(u => u.uid).sort().join();
    const gy = y.garrison.map(u => u.uid).sort().join();
    if (gx !== gy) return `side ${side} garrison: ${gx} vs ${gy}`;
  }
  return null;
}

// --- Grouping events into steps -----------------------------------------------------

interface Group { kind: StepKind; events: WarEvent[] }

function group(fresh: WarEvent[]): Group[] {
  const out: Group[] = [];
  let stage: 'pre' | 'moves' | 'deploys' | 'actions' | 'upkeep' = 'pre';
  const cur = () => out[out.length - 1];
  const open = (kind: StepKind, e: WarEvent) => { out.push({ kind, events: [e] }); };
  for (const e of fresh) {
    // Upkeep never braces, moves or attacks: one of those means a second round
    // arrived in the same view (a missed poll), so start its phases again.
    if (stage === 'upkeep' && ['brace', 'switch', 'shift', 'attack', 'move', 'hq'].includes(e.k)) stage = 'pre';
    if (stage === 'upkeep' && e.k !== 'end') { if (cur()?.kind === 'upkeep') cur().events.push(e); else open('upkeep', e); continue; }
    switch (e.k) {
      case 'brace':
        if (stage === 'pre') { if (cur()?.kind === 'stance') cur().events.push(e); else open('stance', e); }
        else if (cur()) cur().events.push(e);
        else open('stance', e);
        break;
      case 'switch': case 'shift': stage = 'moves'; open(e.k, e); break;
      case 'deploy':
        // A deploy during the action phase is a summon: part of the action that made it.
        if (stage === 'actions' && cur()) cur().events.push(e);
        else { stage = 'deploys'; open('deploy', e); }
        break;
      case 'attack': case 'move': case 'hq': stage = 'actions'; open('action', e); break;
      case 'counter': open('counter', e); break;
      case 'resolved': stage = 'upkeep'; break;
      case 'end': open('end', e); break;
      default:
        if (cur()) cur().events.push(e);
        else open('upkeep', e);
    }
  }
  return out;
}

// --- Narration -----------------------------------------------------------------------

export function buildReplay(
  id: number, before: WarView, final: WarView, fresh: WarEvent[], card: (slug: string) => CardDef,
): Replay | null {
  const resolved = fresh.find((e): e is Extract<WarEvent, { k: 'resolved' }> => e.k === 'resolved');
  if (!resolved) return null;
  const me = final.you;
  const board = clone(before);
  board.phase = 'plan';
  const start = clone(before);

  const names = new Map<string, string>();
  const note = (uid: string, slug: string) => { try { names.set(uid, card(slug).name); } catch { /* unknown card */ } };
  for (const v of [before, final]) for (const p of v.players) for (const u of [...p.active, ...p.garrison]) if (u) note(u.uid, u.slug);
  for (const e of [...before.log, ...fresh]) if ('uid' in e && 'slug' in e) note(e.uid, e.slug);
  const nameOf = (uid: string) => names.get(uid) ?? 'A unit';

  const groups = group(fresh);
  // Action numbering: every attack, move or tank order is one action, except an
  // attack that follows its own unit's move (move-and-attack is one order).
  let total = 0;
  const actionNo: number[] = [];
  groups.forEach((g, i) => {
    const h = g.events[0];
    if (g.kind !== 'action') { actionNo[i] = total; return; }
    const prev = groups[i - 1]?.events[0];
    const followUp = h.k === 'attack' && prev?.k === 'move' && prev.uid === h.uid;
    if (!followUp) total++;
    actionNo[i] = total;
  });

  // Units that shifted into an empty slot this round: their attack lands late.
  const shifters = new Set<string>();
  let chipExplained = false;

  const whose = (side: Side, v: WarView) => (side === me ? 'your' : `${v.players[side].name}'s`);
  const Whose = (side: Side, v: WarView) => cap(whose(side, v));
  const slotName = (r: SlotRef, v: WarView) => `${whose(r.side, v)} ${lane(r.lane)}`;
  const towerName = (r: SlotRef, v: WarView) => `${whose(r.side, v)} ${lane(r.lane)} tower`;
  const speedOf = (u: WarUnit | undefined | null) => (!u ? '' : u.keywords.includes('rush') ? 'Rush' : SPEED_WORD[u.speed] ?? `speed ${u.speed}`);

  const tally: RoundTally = { round: resolved.round, dealt: 0, taken: 0, lost: 0, killed: 0, towersWon: 0, towersLost: 0 };
  for (const e of fresh) {
    if (e.k === 'damage' && e.tower) { if (e.target.side === me) tally.taken += e.n; else tally.dealt += e.n; }
    if (e.k === 'death') { if (e.side === me) tally.lost++; else tally.killed++; }
    if (e.k === 'tower') { if (e.side === me) tally.towersLost++; else tally.towersWon++; }
  }

  const steps: ReplayStep[] = [];
  let ok = true;
  let mismatch: string | undefined;
  groups.forEach((g, gi) => {
    const pre = clone(board);
    try {
      for (const e of g.events) applyEvent(board, e, card, final);
    } catch (err) {
      if (ok) mismatch = (err as Error).message;
      ok = false;
    }
    const post = clone(board);
    const step: ReplayStep = {
      i: steps.length, kind: g.kind, events: g.events, before: pre, after: post, phase: '', side: null,
      aim: [], hitAim: [], headline: '', results: [], recap: '', weight: 1,
    };
    narrate(step, gi);
    steps.push(step);
  });

  if (ok) {
    const d = diverges(board, final);
    if (d) { ok = false; mismatch = d; }
  }

  return { id, round: resolved.round, steps, ok, mismatch, final, tally };

  // Consequence sentences for the events after a step's opener.
  function consequences(step: ReplayStep, events: WarEvent[], opts: { attacker?: WarUnit } = {}): string[] {
    const v = step.after;
    const out: string[] = [];
    let unitHitSeen = false;
    let towerHits = 0;
    for (const e of events) {
      switch (e.k) {
        case 'damage':
          if (e.tower) {
            const t = towerName(e.target, v);
            if (unitHitSeen) {
              towerHits++;
              const pierce = opts.attacker?.keywords.includes('pierce') && towerHits === 1 && (WAR.siege === 'none' || WAR.siege === 'chip');
              if (pierce) out.push(`Pierce: ${e.n} carries through to ${t} (${Math.max(0, e.hp)} left).`);
              else {
                // Explain chip once a round; after that the short form is enough.
                out.push(chipExplained ? `Chip: ${t} loses ${e.n} (${Math.max(0, e.hp)} left).`
                  : `Chip: a hit on a lane's defender also wears its tower, so ${t} loses ${e.n} (${Math.max(0, e.hp)} left).`);
                chipExplained = true;
              }
            } else out.push(`${cap(t)} takes ${e.n} (${Math.max(0, e.hp)} left).`);
          } else {
            unitHitSeen = true;
            const n = e.uid ? nameOf(e.uid) : 'The unit';
            out.push(`${n} takes ${e.n}${e.braced ? ' (braced: halved)' : ''}, ${Math.max(0, e.hp)} health left.`);
          }
          break;
        case 'heal':
          if (e.tower) out.push(`${cap(towerName(e.target, v))} repairs ${e.n}${opts.attacker?.keywords.includes('drain') ? ' (Drain)' : ''}.`);
          else {
            const u = v.players[e.target.side].active[e.target.lane];
            out.push(`${u ? nameOf(u.uid) : 'A unit'} heals ${e.n} (${e.hp} health).`);
          }
          break;
        case 'shield': unitHitSeen = true; out.push(`${nameOf(e.uid)}'s shield absorbs the hit and breaks.`); break;
        case 'death': out.push(`${nameOf(e.uid)} is defeated.`); break;
        case 'tower': out.push(`${cap(towerName({ side: e.side, lane: e.lane }, v))} falls!`); break;
        case 'brace': out.push(e.until !== undefined ? `${nameOf(e.uid)} braces: half damage this round and next.` : `${nameOf(e.uid)} comes in braced: half damage this round.`); break;
        default: {
          const t = describe(e, v, nameOf, card);
          if (t) out.push(t);
        }
      }
    }
    return out;
  }

  function narrate(step: ReplayStep, gi: number) {
    const [h, ...rest] = step.events;
    const b = step.before;
    const n = actionNo[gi];
    switch (step.kind) {
      case 'stance': {
        const braces = step.events.filter((e): e is Extract<WarEvent, { k: 'brace' }> => e.k === 'brace');
        const list = braces.map(e => {
          const f = findOnBoard(b, e.uid);
          return `${f ? whose(f.side, b) + ' ' : ''}${nameOf(e.uid)}`;
        });
        step.phase = 'Orders revealed';
        step.headline = `${cap(joinAnd(list))} ${braces.length === 1 ? 'braces' : 'brace'}.`;
        step.results = [WAR.braceStance === 'extend'
          ? `A braced unit takes half damage this round and next, and strikes back for ${WAR.braceCounterFlat || 'part of its power'} if it survives a hit.`
          : 'A braced unit takes reduced damage this round.'];
        step.recap = `Brace: ${joinAnd(braces.map(e => nameOf(e.uid)))}`;
        const sides = new Set(braces.map(e => findOnBoard(b, e.uid)?.side));
        step.side = sides.size === 1 ? ([...sides][0] ?? null) : null;
        step.weight = 0;
        return;
      }
      case 'switch': {
        if (h.k !== 'switch') return;
        const g = b.players[h.side].garrison.findIndex(u => u.uid === h.in);
        step.phase = 'Switches & shifts';
        step.side = h.side;
        step.actor = h.in;
        step.headline = `${Whose(h.side, b)} ${nameOf(h.in)} switches in for ${nameOf(h.out)} (${lane(h.lane)}).`;
        step.results = [
          ...(b.players[h.side].active[h.lane]?.bracedUntil ?? 0) >= b.round ? [`${nameOf(h.out)} leaves its brace stance behind.`] : [],
          ...consequences(step, rest),
          'Switches happen before any attack, so attacks aimed at this slot now hit the newcomer.',
        ];
        step.recap = `${nameOf(h.in)} in for ${nameOf(h.out)} (${lane(h.lane)})`;
        if (g >= 0) step.cueLine = step.hitLine = { from: { k: 'garrison', side: h.side, g }, to: { k: 'slot', side: h.side, lane: h.lane }, kind: 'swap' };
        return;
      }
      case 'shift': {
        if (h.k !== 'shift') return;
        const mover = b.players[h.side].active[h.from];
        const bumped = b.players[h.side].active[h.to];
        step.phase = 'Switches & shifts';
        step.side = h.side;
        step.actor = mover?.uid;
        if (mover && !bumped) shifters.add(mover.uid);
        const late = mover && !bumped && laterAttack(gi, mover.uid);
        step.headline = `${Whose(h.side, b)} ${mover ? nameOf(mover.uid) : 'unit'} shifts from the ${lane(h.from)} to the ${lane(h.to)}${bumped ? `, swapping places with ${nameOf(bumped.uid)}` : ''}.`;
        step.results = [
          ...[mover, bumped].some(u => u && (u.bracedUntil ?? 0) >= b.round) ? ['Shifting ends a brace stance.'] : [],
          ...late ? [`It will attack from its new lane after every other action, at ${WAR.shiftAttackPower === 0.5 ? 'half' : `${Math.round(WAR.shiftAttackPower * 100)}%`} power.`] : [],
          ...consequences(step, rest),
        ];
        if (!step.results.length) step.results = ['Shifts happen before any attack.'];
        step.recap = `${mover ? nameOf(mover.uid) : 'Unit'} ${lane(h.from)} → ${lane(h.to)}`;
        step.cueLine = step.hitLine = { from: { k: 'slot', side: h.side, lane: h.from }, to: { k: 'slot', side: h.side, lane: h.to }, kind: 'swap' };
        return;
      }
      case 'deploy': {
        if (h.k !== 'deploy') return;
        step.phase = 'Deploys';
        step.side = h.side;
        step.actor = h.uid;
        step.headline = `${h.side === me ? 'You deploy' : `${b.players[h.side].name} deploys`} ${card(h.slug).name}${h.to === 'garrison' ? ' to the garrison' : ` to the ${lane(h.to)}`}.`;
        step.results = consequences(step, rest);
        if (!step.results.length) step.results = [h.to === 'garrison' ? 'It waits in the garrison, ready to switch in.' : 'Deploys land before attacks, so it can be hit this round.'];
        step.recap = `Deploy ${card(h.slug).name}${h.to === 'garrison' ? ' (garrison)' : ` (${lane(h.to)})`}`;
        if (h.to !== 'garrison') step.aim = step.hitAim = [{ side: h.side, lane: h.to }];
        return;
      }
      case 'action': {
        step.phase = `Actions: ${n} of ${total}`;
        if (h.k === 'attack') return narrateAttack(step, h, rest, n, gi);
        if (h.k === 'move') {
          const u = findOnBoard(b, h.uid)?.unit;
          step.side = h.side;
          step.actor = h.uid;
          step.headline = `${Whose(h.side, b)} ${nameOf(h.uid)} (${speedOf(u)}, acts ${ordinal(n)}) uses ${h.name}${h.target ? ` on ${slotName(h.target, b)}` : ''}.`;
          step.results = consequences(step, rest, { attacker: u });
          if (!step.results.length) step.results = ['No visible effect.'];
          step.recap = `${nameOf(h.uid)}: ${h.name}${h.target ? ` → ${slotName(h.target, b)}` : ''}`;
          if (h.target) {
            step.aim = step.hitAim = [h.target];
            step.cueLine = step.hitLine = { from: { k: 'slot', side: h.side, lane: h.from }, to: { k: 'slot', side: h.target.side, lane: h.target.lane }, kind: 'move' };
          }
          return;
        }
        if (h.k === 'hq') {
          step.side = h.side;
          step.hq = h.side;
          step.headline = `${h.side === me ? 'Your' : `${b.players[h.side].name}'s`} tank (speed ${hqSpeed(b.players[h.side])}, acts ${ordinal(n)}) uses ${h.name}${h.target ? ` on ${slotName(h.target, b)}` : ''}.`;
          step.results = consequences(step, rest);
          if (!step.results.length) step.results = ['No visible effect.'];
          step.recap = `Tank: ${h.name}${h.target ? ` → ${slotName(h.target, b)}` : ''}`;
          if (h.target) {
            step.aim = step.hitAim = [h.target];
            step.cueLine = step.hitLine = { from: { k: 'hq', side: h.side }, to: { k: 'slot', side: h.target.side, lane: h.target.lane }, kind: 'move' };
          }
        }
        return;
      }
      case 'counter': {
        if (h.k !== 'counter') return;
        const f = findOnBoard(b, h.uid);
        const attacker = b.players[h.target.side].active[h.target.lane];
        step.phase = `Actions: ${n} of ${total} · strike-back`;
        step.side = f?.side ?? null;
        step.actor = h.uid;
        step.aim = step.hitAim = [h.target];
        step.headline = `${f ? Whose(f.side, b) + ' ' : ''}${nameOf(h.uid)} is braced and survived the hit, so it strikes back at ${attacker ? nameOf(attacker.uid) : 'the attacker'}.`;
        step.results = consequences(step, rest);
        step.recap = `${nameOf(h.uid)} strikes back${damageText(rest)}`;
        if (f && f.lane !== null) step.cueLine = step.hitLine = { from: { k: 'slot', side: f.side, lane: f.lane }, to: { k: 'slot', side: h.target.side, lane: h.target.lane }, kind: 'attack' };
        return;
      }
      case 'upkeep': {
        const r = step.events.find((e): e is Extract<WarEvent, { k: 'round' }> => e.k === 'round');
        step.phase = r ? `Round ${r.round} begins` : 'Upkeep';
        step.headline = r ? `Round ${resolved!.round} is over. Upkeep for round ${r.round}: income, fronts held, cards drawn.` : 'Upkeep.';
        const foeIncome = step.events.find((e): e is Extract<WarEvent, { k: 'income' }> => e.k === 'income' && e.side !== me);
        step.results = [
          ...consequences(step, step.events.filter(e => e.k !== 'round')),
          ...foeIncome ? [`${step.after.players[foeIncome.side].name} gains ${foeIncome.n} emeralds.`] : [],
        ];
        step.recap = step.events.some(e => e.k === 'rebuild' || e.k === 'death') ? `Upkeep: ${step.results.filter(t => /rebuilt|defeated/.test(t)).join(' ')}` : 'Upkeep';
        step.weight = step.events.some(e => e.k === 'rebuild' || e.k === 'death') ? 1 : 0;
        return;
      }
      case 'end': {
        if (h.k !== 'end') return;
        step.phase = 'War over';
        step.headline = h.winner === null ? 'The war is a draw.' : h.winner === me ? 'You win the war!' : `${b.players[h.winner].name} wins the war.`;
        step.results = [h.reason === 'towers' ? `${WAR.towersToWin} towers have fallen.` : h.reason === 'round_limit' ? 'The round limit is reached.' : h.reason === 'concede' ? 'A side conceded.' : 'Decided on time.'];
        step.recap = step.headline;
      }
    }
  }

  function narrateAttack(step: ReplayStep, h: Extract<WarEvent, { k: 'attack' }>, rest: WarEvent[], n: number, gi: number) {
    const b = step.before;
    const foe = other(h.side);
    const u = findOnBoard(b, h.uid)?.unit;
    const aimed = h.aimed ?? h.target;
    const prevHead = groups[gi - 1]?.events[0];
    const followUp = prevHead?.k === 'move' && prevHead.uid === h.uid;
    const late = !followUp && shifters.has(h.uid) && WAR.shiftAttackTiming === 'last';
    step.side = h.side;
    step.actor = h.uid;
    step.aim = [aimed];
    step.hitAim = [h.target];
    const how = followUp ? 'then attacks' : late ? 'attacks from its new lane' : 'attacks';
    step.headline = `${Whose(h.side, b)} ${nameOf(h.uid)} (${speedOf(u)}, acts ${ordinal(n)}) ${how} ${slotName(aimed, b)}.`;
    const res: string[] = [];
    if (late) res.push(`A shift's attack lands last, at ${WAR.shiftAttackPower === 0.5 ? 'half' : `${Math.round(WAR.shiftAttackPower * 100)}%`} power.`);
    if (h.redirected && h.aimed) {
      const g = b.players[foe].active[h.target.lane];
      res.push(`Guard: ${g ? nameOf(g.uid) : 'a Guard'} in the ${lane(h.target.lane)} pulls the attack onto itself.`);
    }
    const occ = b.players[foe].active[h.target.lane];
    const planned = start.players[foe].active[h.target.lane];
    if (h.hit === 'fizzle') {
      if (h.target.side !== foe) res.push('Out of reach: it misses.');
      else if (occ?.stealth) res.push(`${nameOf(occ.uid)} is hidden (Stealth), so the attack misses.`);
      else if (!occ && planned && planned.uid !== occ) {
        const gone = !findOnBoard(b, planned.uid);
        res.push(gone ? `${nameOf(planned.uid)} already fell, and the slot is empty: miss.` : `${nameOf(planned.uid)} moved out of that slot, so the attack hits nothing.`);
        if (h.target.lane !== h.from) res.push('An empty slot only exposes the tower straight ahead.');
      } else if (h.target.lane !== h.from) res.push('The slot is empty, and it is not straight ahead, so there is no tower to hit: miss.');
      else res.push('The slot is empty and its tower is already down: miss.');
      step.recap = `${nameOf(h.uid)} → ${slotName(aimed, b)}: miss`;
    } else if (h.hit === 'tower') {
      res.push(`Nobody stands straight ahead, so it hits ${towerName(h.target, b)}.`);
      res.push(...consequences(step, rest, { attacker: u }));
      step.recap = `${nameOf(h.uid)} → ${towerName(h.target, b)}${damageText(rest, true)}`;
    } else {
      if (h.swapped && occ) {
        const was = findOnBoard(start, occ.uid);
        const how = !was ? 'was deployed there this round' : was.lane === null ? 'switched in this round' : 'shifted in this round';
        res.push(`${nameOf(occ.uid)} ${how}, so it takes the hit.`);
      }
      const cs = consequences(step, rest, { attacker: u });
      const landed = rest.some(e => (e.k === 'damage' && !e.tower) || e.k === 'shield');
      if (!landed && occ) res.push((occ.bracedUntil ?? 0) >= b.round ? `${nameOf(occ.uid)} is braced: the halved hit rounds down to nothing.` : 'It does no damage.');
      res.push(...cs);
      step.recap = `${nameOf(h.uid)} → ${occ ? nameOf(occ.uid) : slotName(h.target, b)}${damageText(rest)}`;
    }
    step.results = res;
    const tower = h.hit === 'tower';
    step.cueLine = { from: { k: 'slot', side: h.side, lane: h.from }, to: { k: 'slot', side: aimed.side, lane: aimed.lane }, kind: 'attack' };
    step.hitLine = { from: { k: 'slot', side: h.side, lane: h.from }, to: tower ? { k: 'tower', side: h.target.side, lane: h.target.lane } : { k: 'slot', side: h.target.side, lane: h.target.lane }, kind: 'attack' };
  }

  function laterAttack(gi: number, uid: string) {
    return groups.slice(gi + 1).some(g => g.events[0].k === 'attack' && (g.events[0] as { uid: string }).uid === uid);
  }

  function damageText(events: WarEvent[], towerOnly = false): string {
    const parts: string[] = [];
    for (const e of events) {
      if (e.k === 'damage' && (!towerOnly || e.tower)) parts.push(`${e.tower && !towerOnly ? 'tower ' : ''}−${e.n}${e.braced ? ' braced' : ''}`);
      if (e.k === 'shield') parts.push('shield broken');
      if (e.k === 'death') parts.push(`${nameOf(e.uid)} defeated`);
      if (e.k === 'tower') parts.push('tower falls');
    }
    return parts.length ? `: ${parts.join(', ')}` : '';
  }
}

function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** The unit standing in a slot of a board (for ghosts and highlights). */
export function unitAt(v: WarView, r: SlotRef): WarUnit | null {
  return v.players[r.side].active[r.lane] ?? null;
}
