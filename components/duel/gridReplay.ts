// The opponent's turn, rebuilt step by step on the client (Warfront).
//
// Mirrors warReplay.ts. The server hands back the board once the turn is
// over, with the log of everything that happened. To show cause before
// effect, the board is rebuilt from the view the player last acted on
// (`before`) by applying the log's events in order, one step per order: an
// upkeep, the HQ firing, each deploy, move, attack, ability, brace, the
// claims at the end of a turn. Each step keeps the board just before and
// just after it, so the replay can pause, step back and jump anywhere.
//
// Most events carry what the board needs (moves carry the path, damage and
// heal the health left, claims the node). A few effects are not logged
// (buffs, keyword grants, emeralds from Tide), so a unit's numbers can drift
// until the next logged hit corrects them. Positions, HQ health and node
// owners must match the server's final view exactly; if they do not, `ok`
// is false and the replay shows the server's board (narration still plays).
//
// Pure TypeScript: no React, no DOM.

import {
  abilityCost, braceCost, cardCost, connection, gridDef, gridHealth, gridHqAbility, gridHqText, gridKeywordText, gridSpeed, hqSideAt, nodeAt, other,
  rulesOf, unitById, type CardDef, type GridConfig, type GridEvent, type GridUnit, type GridView, type HitRef, type Side,
} from '@/lib/duel/grid/client';

export type StepKind = 'upkeep' | 'hqfire' | 'deploy' | 'move' | 'attack' | 'ability' | 'hq' | 'brace' | 'claim' | 'endturn' | 'end';

/** Something drawn on the board for a step: a path, an arrow, a ring. Tiles are state tiles. */
export interface Mark {
  kind: 'move' | 'attack' | 'pierce' | 'strike' | 'fire' | 'effect';
  from: number;
  to: number;
  /** Tiles entered in order (moves). */
  path?: number[];
}

export interface ReplayStep {
  i: number;
  kind: StepKind;
  events: GridEvent[];
  before: GridView;
  after: GridView;
  /** Who is acting (null: nobody in particular). */
  side: Side | null;
  /** The acting unit, highlighted. */
  actor?: string;
  /** The acting HQ, highlighted. */
  hq?: Side;
  /** Tiles marked as the target while the step is announced and once it lands. */
  aim: number[];
  /** Lines drawn while announcing, and once landed. */
  cueMarks: Mark[];
  hitMarks: Mark[];
  /** "Turn 5 · Orders 2 of 3". */
  phase: string;
  /** Shown while announced: who is about to do what. */
  headline: string;
  /** Shown once landed: what happened and why. */
  results: string[];
  /** One line for the turn recap. */
  recap: string;
  /** 0: routine, hidden in the recap unless expanded. */
  weight: 0 | 1;
}

export interface TurnTally {
  /** The opponent's turn number being replayed (player-turns count). */
  turn: number;
  hqTaken: number;
  hqDealt: number;
  lost: number;
  killed: number;
  nodesLost: string[];
  nodesWon: string[];
  /** Connected nodes, yours and theirs, at the end. */
  mine: number;
  theirs: number;
  /** Territory score (GRID.scoreTarget): points each side scored in the replayed turns, and the scores at the end (target 0: no score). */
  scoredMine: number;
  scoredTheirs: number;
  scoreMine: number;
  scoreTheirs: number;
  target: number;
}

export interface Replay {
  /** Identifies the replay: the log position it starts from. */
  id: number;
  steps: ReplayStep[];
  ok: boolean;
  mismatch?: string;
  final: GridView;
  tally: TurnTally;
}

const clone = <T>(x: T): T => structuredClone(x);
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Player-turns to each player's own turn number (turn 3 is the first player's second turn). */
const own = (turn: number) => Math.ceil(turn / 2);

export function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

// --- Applying events to a board ------------------------------------------------------

function newUnit(def: CardDef, uid: string, side: Side, tile: number, g: GridConfig): GridUnit {
  const health = gridHealth(def, g);
  return {
    uid, slug: def.slug, side, element: def.element, tile, power: def.power, health, maxHealth: health, keywords: def.keywords.slice(),
    speed: gridSpeed(def, g), shield: def.keywords.includes('shield'), stealth: def.keywords.includes('stealth'),
    frozenUntil: 0, acted: false, fresh: true, bracedUntil: 0, aura: 0, boost: 0,
  };
}

/** An order starts (or finishes the pending one): orders and the acted flag, as the engine counts them. */
function spendOrder(b: GridView, uid: string, cost = 1) {
  const u = unitById(b, uid);
  if (b.pending === uid) { b.pending = null; return; }
  b.ordersLeft = Math.max(0, b.ordersLeft - cost);
  b.pending = null;
  if (u) u.acted = true;
}

function setHp(b: GridView, t: HitRef, hp: number) {
  if ('hq' in t) b.players[t.hq].hp = hp;
  else { const u = unitById(b, t.unit); if (u) u.health = hp; }
}

/** Apply one logged event to a board, in place. Hands are not rebuilt: the replay shows your live hand. */
export function applyEvent(b: GridView, e: GridEvent, card: (slug: string) => CardDef): void {
  const G = rulesOf(b);
  const bank = (side: Side, n: number) => { const p = b.players[side]; p.emeralds = Math.max(0, Math.min(G.bankCap, p.emeralds + n)); };
  switch (e.k) {
    case 'turn':
      b.turn = e.turn;
      b.active = e.side;
      b.phase = 'main';
      b.ordersLeft = e.orders;
      b.pending = null;
      b.hqUsed = false;
      delete b.setback;
      for (const u of b.units) if (u.side === e.side) { u.acted = false; u.fresh = false; u.boost = 0; delete u.fought; delete u.usedAbility; }
      return;
    case 'setback': b.setback = true; return;
    case 'laststand': b.players[e.side].hp = e.hp; return;
    case 'income': bank(e.side, e.n); return;
    case 'draw': { const p = b.players[e.side]; p.handCount += e.n; p.deckCount = Math.max(0, p.deckCount - e.n); return; }
    case 'burn': { const p = b.players[e.side]; p.deckCount = Math.max(0, p.deckCount - 1); return; }
    case 'perk':
      if (e.perk === 'ore' && e.uid) { const u = unitById(b, e.uid); if (u) u.boost += G.perk.ore; }
      return;
    case 'deploy': {
      const p = b.players[e.side];
      const cost = cardCost(b, e.slug, e.side);
      b.units.push(newUnit(card(e.slug), e.uid, e.side, e.tile, G));
      bank(e.side, -cost);
      p.handCount = Math.max(0, p.handCount - 1);
      return;
    }
    case 'summon': b.units.push(newUnit(card(e.slug), e.uid, e.side, e.tile, G)); return;
    case 'move': {
      const u = unitById(b, e.uid);
      if (!u) throw new Error(`move ${e.uid} not on board`);
      spendOrder(b, e.uid);
      u.tile = e.to;
      b.pending = e.uid;
      return;
    }
    case 'attack': {
      const u = unitById(b, e.uid);
      if (u) u.stealth = false;
      spendOrder(b, e.uid);
      return;
    }
    case 'ability': {
      const u = unitById(b, e.uid);
      spendOrder(b, e.uid);
      if (u) {
        u.stealth = false;
        bank(e.side, -abilityCost(card(u.slug), G));
        // G.abilityAttack: the order stays open for an attack or a brace.
        if (G.abilityAttack) { b.pending = e.uid; u.usedAbility = true; }
      }
      return;
    }
    case 'brace': {
      const u = unitById(b, e.uid);
      if (!u) return;
      u.bracedUntil = e.until;
      // The free end-of-turn stance costs nothing.
      if (e.auto) { if (G.autoBraceTaken !== G.braceTaken) u.stance = true; return; }
      const inPlace = b.pending !== e.uid;
      spendOrder(b, e.uid, braceCost(G));
      if (inPlace && G.autoBrace !== 'off' && G.autoBraceTaken !== G.braceTaken) u.stance = true;
      else delete u.stance;
      return;
    }
    case 'hq':
      b.ordersLeft = Math.max(0, b.ordersLeft - 1);
      b.hqUsed = true;
      b.pending = null;
      bank(e.side, -(gridHqAbility(b.players[e.side], G).cost ?? 0));
      return;
    case 'damage': case 'heal': setHp(b, e.target, e.hp); return;
    case 'shield': { const u = unitById(b, e.uid); if (u) u.shield = false; return; }
    case 'freeze': { const u = unitById(b, e.uid); if (u) u.frozenUntil = e.until; return; }
    case 'reveal': { const u = unitById(b, e.uid); if (u) u.stealth = false; return; }
    case 'bounce': {
      const u = unitById(b, e.uid);
      if (!u) throw new Error(`bounce ${e.uid} not on board`);
      b.units = b.units.filter(x => x !== u);
      if (card(e.slug).tier !== 'token') b.players[u.side].handCount++;
      return;
    }
    case 'death': {
      if (!unitById(b, e.uid)) throw new Error(`death ${e.uid} not on board`);
      b.units = b.units.filter(x => x.uid !== e.uid);
      if (b.pending === e.uid) b.pending = null;
      return;
    }
    case 'claim': { const n = nodeAt(b, e.tile); if (n) n.owner = e.side; return; }
    case 'score': b.players[e.side].score = e.total; return;
    case 'objective': {
      const o = { tile: e.tile, name: e.name, from: e.from, until: e.until };
      if (e.announced) b.nextObjective = o;
      else { b.objective = o; b.nextObjective = null; }
      return;
    }
    case 'end_turn': b.pending = null; delete b.setback; return;
    case 'end': b.phase = 'over'; b.winner = e.winner; b.endReason = e.reason; b.pending = null; return;
    default: return;
  }
}

/** Where the rebuilt board and the server's disagree on positions, HQ health or node owners. */
function diverges(a: GridView, b: GridView): string | null {
  const pos = (v: GridView) => v.units.map(u => `${u.uid}@${u.tile}`).sort().join();
  if (pos(a) !== pos(b)) return `units: ${pos(a)} vs ${pos(b)}`;
  for (const side of [0, 1] as Side[]) if (a.players[side].hp !== b.players[side].hp) return `HQ ${side}: ${a.players[side].hp} vs ${b.players[side].hp}`;
  for (const n of b.nodes) if (nodeAt(a, n.tile)?.owner !== n.owner) return `node ${n.name}: ${nodeAt(a, n.tile)?.owner} vs ${n.owner}`;
  for (const side of [0, 1] as Side[]) if ((a.players[side].score ?? 0) !== (b.players[side].score ?? 0)) return `score ${side}: ${a.players[side].score} vs ${b.players[side].score}`;
  return null;
}

// --- The log sentence builder (shared with the log panel) --------------------------

export function describe(e: GridEvent, v: GridView, nameOf: (uid: string) => string, card: (slug: string) => CardDef): string | null {
  const G = rulesOf(v);
  const who = (side: Side) => (side === v.you ? 'You' : v.players[side].name);
  const s = (side: Side, you: string, them: string) => (side === v.you ? you : them);
  const hit = (t: HitRef) => ('hq' in t ? `${t.hq === v.you ? 'your' : `${v.players[t.hq].name}'s`} HQ` : nameOf(t.unit));
  switch (e.k) {
    case 'income': return `${who(e.side)} ${s(e.side, 'gain', 'gains')} ${plural(e.n, 'emerald')}.`;
    case 'draw': return e.side === v.you ? `You draw ${e.n === 1 ? 'a card' : `${e.n} cards`}.` : `${v.players[e.side].name} draws ${e.n === 1 ? 'a card' : `${e.n} cards`}.`;
    case 'burn': return `${who(e.side)} ${s(e.side, 'have', 'has')} a full hand: ${card(e.slug).name} is burned.`;
    case 'perk': {
      const n = nodeAt(v, e.tile);
      const what = e.perk === 'city' ? 'city income' : e.perk === 'ore' ? `+${G.perk.ore} power` : e.perk === 'crops' ? 'a heal' : e.perk === 'fish' ? 'a draw' : 'a repair';
      return `${n?.name ?? 'A node'} gives ${who(e.side).toLowerCase() === 'you' ? 'you' : v.players[e.side].name} ${what}.`;
    }
    case 'hqfire': return `${cap(s(e.side, 'your', `${v.players[e.side].name}'s`))} HQ fires at ${nameOf(e.target)}.`;
    case 'deploy': return `${who(e.side)} ${s(e.side, 'deploy', 'deploys')} ${card(e.slug).name}${e.forward ? ' forward' : ''}.`;
    case 'summon': return `${card(e.slug).name} is summoned.`;
    case 'move': return `${nameOf(e.uid)} moves ${plural(e.path.length, 'tile')}${e.stopped ? ', stopped by a Guard' : ''}.`;
    case 'attack': return `${nameOf(e.uid)} attacks ${hit(e.target)}${e.flank ? ` (+${e.flank} flank)` : ''}.`;
    case 'retaliate': return `${nameOf(e.uid)} strikes back.`;
    case 'pierce': return `${nameOf(e.uid)} pierces through.`;
    case 'damage': return `${cap(hit(e.target))} takes ${e.n}${e.armour ? ` (armour ${e.armour})` : ''}${e.braced ? ', braced' : ''}: ${Math.max(0, e.hp)} left.`;
    case 'heal': return `${cap(hit(e.target))} heals ${e.n}.`;
    case 'shield': return `${nameOf(e.uid)}'s shield breaks.`;
    case 'freeze': return `${nameOf(e.uid)} is frozen.`;
    case 'bounce': return `${card(e.slug).name} returns to hand.`;
    case 'reveal': return `${nameOf(e.uid)} is revealed.`;
    case 'brace': return e.auto ? `${nameOf(e.uid)} holds its ground (free brace).` : `${nameOf(e.uid)} braces.`;
    case 'setback': return `${who(e.side)} ${s(e.side, 'rally', 'rallies')} after a setback${e.orders ? `: +${plural(e.orders, 'order')}` : ''}${e.emeralds ? `, +${plural(e.emeralds, 'emerald')}` : ''}${e.discount ? `, deploys ${e.discount} cheaper` : ''}.`;
    case 'laststand': return `${cap(s(e.side, 'your', `${v.players[e.side].name}'s`))} HQ makes a last stand: +${e.n} (${e.hp}).`;
    case 'ability': return `${nameOf(e.uid)} uses ${e.name}.`;
    case 'hq': return `${who(e.side)} ${s(e.side, 'use', 'uses')} ${e.name}.`;
    case 'death': return `${card(e.slug).name} is destroyed${e.captured ? ' (surrounded)' : ''}.`;
    case 'claim': return `${who(e.side)} ${s(e.side, 'claim', 'claims')} ${e.name}${e.from !== null ? ` from ${e.from === v.you ? 'you' : v.players[e.from].name}` : ''}.`;
    case 'connection': return `${cap(s(e.side, 'your', `${v.players[e.side].name}'s`))} connected nodes: ${e.nodes.length}.`;
    case 'score': return e.hq
      ? `${who(e.side)} ${s(e.side, 'score', 'scores')} ${plural(e.n, 'point')} for HQ damage (${e.total}${G.scoreTarget ? ` of ${G.scoreTarget}` : ''}).`
      : `${who(e.side)} ${s(e.side, 'score', 'scores')} ${plural(e.n, 'point')} from ${plural(e.nodes.length, 'node')} (${e.total}${G.scoreTarget ? ` of ${G.scoreTarget}` : ''}).`;
    case 'objective': return e.announced
      ? `Next objective: ${e.name}, from turn ${own(e.from)} (+${G.objectiveBonus} a turn to its holder).`
      : `${e.name} is now the objective (+${G.objectiveBonus} a turn to its holder).`;
    case 'end': return e.winner === null ? 'The game is a draw.' : `${who(e.winner)} ${s(e.winner, 'win', 'wins')}!`;
    default: return null;
  }
}

// --- Grouping events into steps ------------------------------------------------------

interface Group { kind: StepKind; events: GridEvent[] }

const OPENER: Partial<Record<GridEvent['k'], StepKind>> = {
  turn: 'upkeep', hqfire: 'hqfire', deploy: 'deploy', move: 'move', attack: 'attack', ability: 'ability', hq: 'hq', brace: 'brace', end: 'end',
};

function group(fresh: GridEvent[]): Group[] {
  const out: Group[] = [];
  const cur = () => out[out.length - 1];
  for (const e of fresh) {
    if (e.k === 'start') continue;
    if (e.k === 'brace' && e.auto) {
      if (cur()?.kind === 'claim' || cur()?.kind === 'endturn') cur().events.push(e);
      else out.push({ kind: 'endturn', events: [e] });
      continue;
    }
    const opens = OPENER[e.k];
    if (opens) { out.push({ kind: opens, events: [e] }); continue; }
    if (e.k === 'claim') {
      if (cur()?.kind === 'claim') cur().events.push(e);
      else out.push({ kind: 'claim', events: [e] });
      continue;
    }
    if (e.k === 'end_turn') {
      if (cur()?.kind === 'claim' || (cur()?.kind === 'endturn' && !cur().events.some(x => x.k === 'end_turn'))) cur().events.push(e);
      else out.push({ kind: 'endturn', events: [e] });
      continue;
    }
    if (cur()) cur().events.push(e);
    else out.push({ kind: 'upkeep', events: [e] });
  }
  return out;
}

// --- Narration -----------------------------------------------------------------------

export function buildReplay(id: number, before: GridView, final: GridView, fresh: GridEvent[], card: (slug: string) => CardDef): Replay | null {
  const me = final.you;
  const foe = other(me);
  const G = rulesOf(final);
  const board = clone(before);
  // A view from before the replayed turns may still be in the mulligan.
  if (board.phase === 'mulligan') board.phase = 'main';

  const names = new Map<string, string>();
  const note = (uid: string, slug: string) => { try { names.set(uid, card(slug).name); } catch { /* unknown card */ } };
  for (const v of [before, final]) for (const u of v.units) note(u.uid, u.slug);
  for (const e of [...before.log, ...fresh]) if ('uid' in e && 'slug' in e) note(e.uid, e.slug);
  const nameOf = (uid: string) => names.get(uid) ?? 'A unit';

  const groups = group(fresh);
  if (!groups.length) return null;

  const whose = (side: Side, v: GridView) => (side === me ? 'your' : `${v.players[side].name}'s`);
  const Whose = (side: Side, v: GridView) => cap(whose(side, v));
  const whoIs = (side: Side, v: GridView) => (side === me ? 'you' : v.players[side].name);
  const unitName = (uid: string, v: GridView) => {
    const u = unitById(v, uid);
    return u ? `${whose(u.side, v)} ${nameOf(uid)}` : nameOf(uid);
  };
  const hitName = (t: HitRef, v: GridView) => ('hq' in t ? `${whose(t.hq, v)} HQ` : unitName(t.unit, v));

  // Connected nodes per side as the replay goes, for "cut" and "linked" lines.
  const conn0 = connection(board);
  const linked: [number[], number[]] = [conn0[0].nodes.slice(), conn0[1].nodes.slice()];

  const tally: TurnTally = {
    turn: 0, hqTaken: 0, hqDealt: 0, lost: 0, killed: 0, nodesLost: [], nodesWon: [], mine: 0, theirs: 0,
    scoredMine: 0, scoredTheirs: 0, scoreMine: final.players[me].score ?? 0, scoreTheirs: final.players[foe].score ?? 0, target: G.scoreTarget,
  };
  for (const e of fresh) {
    if (e.k === 'turn' && e.side === foe) tally.turn = e.turn;
    if (e.k === 'damage' && 'hq' in e.target) { if (e.target.hq === me) tally.hqTaken += e.n; else tally.hqDealt += e.n; }
    if (e.k === 'death') { if (e.side === me) tally.lost++; else tally.killed++; }
    if (e.k === 'claim') { if (e.side === me) tally.nodesWon.push(e.name); else if (e.from === me) tally.nodesLost.push(e.name); }
    if (e.k === 'score') { if (e.side === me) tally.scoredMine += e.n; else tally.scoredTheirs += e.n; }
  }
  const connF = connection(final);
  tally.mine = connF[me].nodes.length;
  tally.theirs = connF[foe].nodes.length;

  // Order numbering within a turn: a move and its follow-up are one order.
  let orderNo = 0;
  let orderTotal = 0;

  const steps: ReplayStep[] = [];
  let ok = true;
  let mismatch: string | undefined;
  groups.forEach((g, gi) => {
    const pre = clone(board);
    try {
      for (const e of g.events) applyEvent(board, e, card);
    } catch (err) {
      if (ok) mismatch = (err as Error).message;
      ok = false;
    }
    const post = clone(board);
    const step: ReplayStep = {
      i: steps.length, kind: g.kind, events: g.events, before: pre, after: post, side: null,
      aim: [], cueMarks: [], hitMarks: [], phase: '', headline: '', results: [], recap: '', weight: 1,
    };
    narrate(step, gi);
    steps.push(step);
  });

  if (ok) {
    const d = diverges(board, final);
    if (d) { ok = false; mismatch = d; }
  }
  return { id, steps, ok, mismatch, final, tally };

  function nodeNames(tiles: number[], v: GridView) {
    return tiles.map(t => nodeAt(v, t)?.name ?? 'a node');
  }

  /** Sentences for the events after a step's opener. */
  function consequences(step: ReplayStep, events: GridEvent[], ctx: { attacker?: string; primary?: HitRef } = {}): string[] {
    const v = step.after;
    const b = step.before;
    const out: string[] = [];
    let mode: 'primary' | 'pierce' | 'strike' | 'other' = ctx.primary ? 'primary' : 'other';
    for (const e of events) {
      switch (e.k) {
        case 'pierce': mode = 'pierce'; break;
        case 'retaliate': {
          mode = 'strike';
          const d = unitById(b, e.uid);
          out.push(`${cap(unitName(e.uid, b))} survives a melee hit, so it strikes back for ${d ? d.power : 'its power'}.`);
          break;
        }
        case 'damage': {
          const name = cap(hitName(e.target, b));
          const hp = Math.max(0, e.hp);
          if ('hq' in e.target) {
            const n = linked[e.target.hq].length;
            const armour = e.armour ? ` HQ armour soaks ${e.armour} (${plural(n, 'connected node')}).` : '';
            const lead = mode === 'pierce' ? `Pierce carries through: ${name} takes ${e.n}` : `${name} takes ${e.n}`;
            out.push(`${lead}, ${hp} health left.${armour}`);
          } else {
            const lead = mode === 'pierce' ? `Pierce carries through: ${name} takes ${e.n}` : `${name} takes ${e.n}`;
            out.push(`${lead}${e.braced ? ' (braced: halved)' : ''}, ${hp} health left.`);
          }
          break;
        }
        case 'shield': out.push(`${cap(unitName(e.uid, b))}'s shield absorbs the hit and breaks.`); break;
        case 'heal': out.push(`${cap(hitName(e.target, b))} heals ${e.n} (${e.hp} health).`); break;
        case 'death': out.push(`${cap(whose(e.side, b))} ${card(e.slug).name} is destroyed${e.captured ? ': surrounded, with no free tile beside it' : ''}.`); break;
        case 'reveal': { const st = gridKeywordText('stealth', G).text; out.push(`${cap(unitName(e.uid, b))} is revealed. Stealth: ${st.charAt(0).toLowerCase()}${st.slice(1)}`); break; }
        case 'brace': if (e.auto) out.push(`${cap(unitName(e.uid, b))} holds its ground: braced for free until ${whose(unitById(b, e.uid)?.side ?? me, b)} next turn.`); break;
        case 'setback': case 'laststand': { const d = describe(e, v, nameOf, card); if (d) out.push(d); break; }
        case 'freeze': out.push(`${cap(unitName(e.uid, b))} is frozen: it cannot act or strike back through its next turn.`); break;
        case 'bounce': out.push(`${card(e.slug).name} returns to its owner's hand.`); break;
        case 'summon': out.push(`${card(e.slug).name} is summoned beside it.`); break;
        case 'claim': break;
        case 'score': {
          if (e.hq) { out.push(`${cap(whoIs(e.side, b))} ${e.side === me ? 'score' : 'scores'} ${plural(e.n, 'point')} for the damage on the HQ: ${e.total} of ${G.scoreTarget}.`); break; }
          const parts = e.nodes.map(x => `${nodeAt(b, x.tile)?.name ?? 'a node'} ${x.n}${x.objective ? ' (objective)' : ''}`);
          out.push(`${cap(whose(e.side, b))} nodes score ${plural(e.n, 'point')} (${joinAnd(parts)}): ${e.total} of ${G.scoreTarget}.`);
          break;
        }
        case 'objective':
          out.push(e.announced
            ? `Next objective: ${e.name}. From turn ${own(e.from)} it scores +${G.objectiveBonus} a turn for whoever holds it.`
            : `${e.name} is the objective now, through turn ${own(e.until)}: +${G.objectiveBonus} a turn for whoever holds it.`);
          break;
        case 'connection': {
          const was = linked[e.side];
          const lost = was.filter(t => !e.nodes.includes(t));
          const won = e.nodes.filter(t => !was.includes(t));
          linked[e.side] = e.nodes.slice();
          const armour = G.armourPerNode * e.nodes.length;
          if (lost.length) out.push(`${Whose(e.side, v)} chain to ${joinAnd(nodeNames(lost, v))} is cut: ${plural(e.nodes.length, 'connected node')} left, so ${whose(e.side, v)} HQ armour drops to ${armour}.`);
          if (won.length) out.push(`${joinAnd(nodeNames(won, v))} ${won.length === 1 ? 'is' : 'are'} now connected to ${whose(e.side, v)} HQ: HQ armour ${armour}, +${G.nodeIncome * e.nodes.length} emerald${e.nodes.length * G.nodeIncome === 1 ? '' : 's'} a turn.`);
          break;
        }
        case 'end': out.push(e.winner === null ? 'The game ends in a draw.' : e.winner === me ? 'You win!' : `${v.players[e.winner].name} wins.`); break;
        default: {
          const t = describe(e, v, nameOf, card);
          if (t) out.push(t);
        }
      }
    }
    return out;
  }

  function hpShort(events: GridEvent[]): string {
    const parts: string[] = [];
    for (const e of events) {
      if (e.k === 'damage') parts.push(`−${e.n}${'hq' in e.target ? ' HQ' : ''}`);
      if (e.k === 'shield') parts.push('shield');
      if (e.k === 'death') parts.push(`${card(e.slug).name} destroyed`);
    }
    return parts.length ? `: ${parts.join(', ')}` : '';
  }

  function orderPhase(b: GridView) {
    return `Turn ${own(b.turn)} · order ${orderNo} of ${Math.max(orderNo, orderTotal)}`;
  }

  function narrate(step: ReplayStep, gi: number) {
    const [h, ...rest] = step.events;
    const b = step.before;
    switch (step.kind) {
      case 'upkeep': {
        const t = step.events.find((e): e is Extract<GridEvent, { k: 'turn' }> => e.k === 'turn');
        const inc = step.events.find((e): e is Extract<GridEvent, { k: 'income' }> => e.k === 'income');
        const side = t?.side ?? inc?.side ?? null;
        step.side = side;
        orderNo = 0;
        orderTotal = t?.orders ?? G.orders;
        step.phase = t ? `Turn ${own(t.turn)}` : 'Upkeep';
        step.headline = side === null ? 'Upkeep.' : side === me ? `Your turn ${t ? own(t.turn) : ''} begins.` : `${b.players[side].name}'s turn ${t ? own(t.turn) : ''} begins.`;
        const res: string[] = [];
        if (inc) {
          const parts = [`${inc.base} base`];
          if (inc.nodes) parts.push(`${inc.nodes} from connected nodes`);
          if (inc.city) parts.push(`${inc.city} city`);
          res.push(`${cap(whoIs(inc.side, b))} ${inc.side === me ? 'gain' : 'gains'} ${plural(inc.n, 'emerald')} (${parts.join(', ')})${inc.n < inc.base + inc.nodes + inc.city ? `, capped by the ${G.bankCap}-emerald bank` : ''}.`);
        }
        if (t) res.push(`${plural(t.orders, 'order')} this turn.`);
        res.push(...consequences(step, step.events.filter(e => e.k !== 'turn' && e.k !== 'income')));
        step.results = res;
        const sc = step.events.find((e): e is Extract<GridEvent, { k: 'score' }> => e.k === 'score' && !e.hq);
        const ob = step.events.find((e): e is Extract<GridEvent, { k: 'objective' }> => e.k === 'objective');
        step.recap = `${side === me ? 'Your' : side !== null ? `${b.players[side].name}'s` : ''} turn ${t ? own(t.turn) : ''}${inc ? `: +${inc.n} emeralds` : ''}${sc ? `, +${sc.n} points (${sc.total}/${G.scoreTarget})` : ''}${ob ? `; objective ${ob.name}${ob.announced ? ' next' : ''}` : ''}`;
        if (sc || ob) step.aim = [...(sc ? sc.nodes.map(x => x.tile) : []), ...(ob ? [ob.tile] : [])];
        step.weight = step.events.some(e => e.k === 'death' || e.k === 'damage' || e.k === 'score' || e.k === 'objective') ? 1 : 0;
        return;
      }
      case 'hqfire': {
        if (h.k !== 'hqfire') return;
        step.side = h.side;
        step.hq = h.side;
        step.aim = [h.tile];
        step.phase = `Turn ${own(b.turn)} · HQ fire`;
        step.headline = `${Whose(h.side, b)} HQ fires at ${unitName(h.target, b)}, standing next to it.`;
        step.results = [
          gridHqText(G).find(r => r.name === 'HQ fire')?.text ?? 'An HQ fires at the start of its turn.',
          ...consequences(step, rest),
        ];
        step.recap = `HQ fire → ${nameOf(h.target)}${hpShort(rest)}`;
        step.cueMarks = step.hitMarks = [{ kind: 'fire', from: b.hq[h.side], to: h.tile }];
        return;
      }
      case 'deploy': {
        if (h.k !== 'deploy') return;
        step.side = h.side;
        step.actor = h.uid;
        step.aim = [h.tile];
        step.phase = `Turn ${own(b.turn)} · deploy`;
        const where = h.forward ? 'forward, next to a connected node' : 'on the back row';
        step.headline = `${h.side === me ? 'You deploy' : `${b.players[h.side].name} deploys`} ${card(h.slug).name} ${where} (${plural(cardCost(b, h.slug), 'emerald')}).`;
        const cs = consequences(step, rest);
        step.results = cs.length ? cs : [`Deploys cost emeralds, not orders. It can act next turn${card(h.slug).keywords.includes('rush') ? ', or now: it has Rush' : ''}.`];
        step.recap = `Deploy ${card(h.slug).name}${h.forward ? ' (forward)' : ''}`;
        return;
      }
      case 'move': {
        if (h.k !== 'move') return;
        orderNo++;
        const u = unitById(b, h.uid);
        step.side = h.side;
        step.actor = h.uid;
        step.aim = [h.to];
        step.phase = orderPhase(b);
        step.headline = `${cap(unitName(h.uid, b))} moves ${plural(h.path.length, 'tile')}${u ? ` (${u.element})` : ''}.`;
        const res: string[] = [];
        if (h.stopped) {
          const guard = b.units.find(x => x.side !== h.side && x.keywords.includes('guard') && Math.max(Math.abs((x.tile % b.width) - (h.to % b.width)), Math.abs(Math.floor(x.tile / b.width) - Math.floor(h.to / b.width))) === 1);
          res.push(`Guard: ${guard ? unitName(guard.uid, b) : 'a Guard'} stops it. An enemy that moves next to a Guard must stop there.`);
        } else if (b.terrain[h.to] === 'water' && u && u.element !== 'water') {
          res.push('It stops in the water: entering water ends a move, except for Water units.');
        }
        const onNode = nodeAt(b, h.to);
        if (onNode && onNode.owner !== null && onNode.owner !== h.side) res.push(`It stands on ${onNode.name}, which ${whoIs(onNode.owner, b)} ${onNode.owner === me ? 'hold' : 'holds'}: an enemy on a node breaks the chain there.`);
        else if (onNode && onNode.owner !== h.side) res.push(`If it ends the turn on ${onNode.name} with no enemy next to it, ${whoIs(h.side, b)} ${h.side === me ? 'claim' : 'claims'} it.`);
        res.push(...consequences(step, rest));
        const next = groups[gi + 1];
        const follow = next && ['attack', 'ability', 'brace'].includes(next.kind) && (next.events[0] as { uid?: string }).uid === h.uid;
        if (!res.length) res.push(follow ? 'It may still attack, use its ability or brace this order.' : 'The move is the whole order.');
        step.results = res;
        step.recap = `${nameOf(h.uid)} moves ${h.path.length}${h.stopped ? ' (Guard stop)' : ''}`;
        step.cueMarks = step.hitMarks = [{ kind: 'move', from: h.from, to: h.to, path: h.path }];
        return;
      }
      case 'attack': {
        if (h.k !== 'attack') return;
        const prev = groups[gi - 1]?.events[0];
        const followUp = prev?.k === 'move' && prev.uid === h.uid;
        if (!followUp) orderNo++;
        step.side = h.side;
        step.actor = h.uid;
        step.aim = [h.tile];
        step.phase = orderPhase(b);
        const target = hitName(h.target, b);
        const siege = 'hq' in h.target && !h.ranged && Math.max(Math.abs((h.from % b.width) - (h.tile % b.width)), Math.abs(Math.floor(h.from / b.width) - Math.floor(h.tile / b.width))) > 1;
        step.headline = `${cap(unitName(h.uid, b))} ${followUp ? 'then attacks' : 'attacks'} ${target}${h.ranged ? ' from range' : siege ? ` from ${G.hqReach} tiles away (siege)` : ''}.`;
        const res: string[] = [];
        const u = unitById(b, h.uid);
        if (h.flank) res.push(`Flanking: +${h.flank} damage, ${plural(h.flank / Math.max(1, G.flank), 'ally', 'allies')} next to the target (${u ? u.power + u.boost : '?'} power + ${h.flank}).`);
        if (u?.boost) res.push(`Ore: +${u.boost} power this turn from the node it holds.`);
        if (h.ranged) res.push('Ranged: no strike-back.');
        const vic = 'unit' in h.target ? unitById(b, h.target.unit) : null;
        if (vic && vic.bracedUntil >= b.turn && !rest.some(e => e.k === 'damage' && 'unit' in e.target && e.target.unit === vic.uid)) res.push(`${cap(unitName(vic.uid, b))} is braced: the halved hit rounds down to nothing.`);
        res.push(...consequences(step, rest, { attacker: h.uid, primary: h.target }));
        step.results = res;
        step.recap = `${nameOf(h.uid)} → ${'hq' in h.target ? `${h.target.hq === me ? 'your' : 'their'} HQ` : nameOf(h.target.unit)}${hpShort(rest)}`;
        const marks: Mark[] = [{ kind: 'attack', from: h.from, to: h.tile }];
        const pi = rest.findIndex(e => e.k === 'pierce');
        if (pi >= 0) { const p = rest[pi] as Extract<GridEvent, { k: 'pierce' }>; marks.push({ kind: 'pierce', from: h.tile, to: p.tile }); }
        if (rest.some(e => e.k === 'retaliate')) marks.push({ kind: 'strike', from: h.tile, to: h.from });
        step.cueMarks = [marks[0]];
        step.hitMarks = marks;
        return;
      }
      case 'ability': {
        if (h.k !== 'ability') return;
        const prev = groups[gi - 1]?.events[0];
        if (!(prev?.k === 'move' && prev.uid === h.uid)) orderNo++;
        const u = unitById(b, h.uid);
        step.side = h.side;
        step.actor = h.uid;
        step.phase = orderPhase(b);
        const target = h.target !== undefined ? targetName(h.target, b) : '';
        step.headline = `${cap(unitName(h.uid, b))} uses ${h.name}${target ? ` on ${target}` : ''}${u ? ` (${plural(abilityCost(card(u.slug)), 'emerald')})` : ''}.`;
        const cs = consequences(step, rest, { attacker: h.uid });
        step.results = cs.length ? cs : ['No visible effect.'];
        step.recap = `${nameOf(h.uid)}: ${h.name}${hpShort(rest)}`;
        if (h.target !== undefined && u) { step.aim = [h.target]; step.cueMarks = step.hitMarks = [{ kind: 'effect', from: u.tile, to: h.target }]; }
        return;
      }
      case 'hq': {
        if (h.k !== 'hq') return;
        orderNo++;
        step.side = h.side;
        step.hq = h.side;
        step.phase = orderPhase(b);
        const target = h.target !== undefined ? targetName(h.target, b) : '';
        step.headline = `${Whose(h.side, b)} HQ uses ${h.name}${target ? ` on ${target}` : ''} (${plural(gridHqAbility(b.players[h.side]).cost ?? 0, 'emerald')}, one order).`;
        const cs = consequences(step, rest);
        step.results = cs.length ? cs : ['No visible effect.'];
        step.recap = `HQ: ${h.name}${hpShort(rest)}`;
        if (h.target !== undefined) { step.aim = [h.target]; step.cueMarks = step.hitMarks = [{ kind: 'effect', from: b.hq[h.side], to: h.target }]; }
        return;
      }
      case 'brace': {
        if (h.k !== 'brace') return;
        const prev = groups[gi - 1]?.events[0];
        const followUp = prev?.k === 'move' && prev.uid === h.uid;
        if (!followUp) orderNo++;
        const u = unitById(b, h.uid);
        step.side = u?.side ?? null;
        step.actor = h.uid;
        step.phase = orderPhase(b);
        step.headline = `${cap(unitName(h.uid, b))} ${followUp ? 'then braces' : 'braces'}.`;
        step.results = [`Braced: it takes ${G.braceTaken === 0.5 ? 'half' : `${Math.round(G.braceTaken * 100)}% of the`} damage (rounded down) until ${u && u.side === me ? 'your' : 'its side\'s'} next turn. Both players can see it.`, ...consequences(step, rest)];
        step.recap = `${nameOf(h.uid)} braces`;
        step.weight = 0;
        return;
      }
      case 'claim': {
        const claims = step.events.filter((e): e is Extract<GridEvent, { k: 'claim' }> => e.k === 'claim');
        const side = claims[0]?.side ?? null;
        step.side = side;
        step.aim = claims.map(c => c.tile);
        step.phase = `Turn ${own(b.turn)} · end of turn`;
        step.headline = side === null ? 'End of turn.' : `${cap(whoIs(side, b))} ${side === me ? 'claim' : 'claims'} ${joinAnd(claims.map(c => c.name))}.`;
        step.results = [
          ...claims.map(c => `${cap(whoIs(c.side, b))} ended the turn on ${c.name} with no enemy next to it${c.from !== null ? `, taking it from ${whoIs(c.from, b)}` : ''}.`),
          ...consequences(step, step.events.filter(e => e.k !== 'claim')),
        ];
        step.recap = `Claim ${joinAnd(claims.map(c => c.name))}${claims.some(c => c.from !== null) ? ' (stolen)' : ''}`;
        return;
      }
      case 'endturn': {
        const et = step.events.find((e): e is Extract<GridEvent, { k: 'end_turn' }> => e.k === 'end_turn');
        const bu = h.k === 'brace' ? unitById(b, h.uid) : undefined;
        const side = et?.side ?? bu?.side ?? b.active;
        step.side = side;
        step.phase = `Turn ${own(b.turn)} · end of turn`;
        step.headline = `${cap(whoIs(side, b))} ${side === me ? 'end' : 'ends'} the turn.`;
        const left = b.ordersLeft;
        const cs = consequences(step, step.events.filter(e => e.k !== 'end_turn'));
        step.results = [...(left > 0 && side !== me ? [`${plural(left, 'order')} left unused.`] : []), ...cs];
        if (!step.results.length) step.results = ['No node changed hands.'];
        step.recap = `${side === me ? 'You end' : 'End'} turn`;
        step.weight = step.events.some(e => e.k === 'connection') ? 1 : 0;
        return;
      }
      case 'end': {
        if (h.k !== 'end') return;
        step.phase = 'Game over';
        step.headline = h.winner === null ? 'The game is a draw.' : h.winner === me ? 'You win!' : `${b.players[h.winner].name} wins.`;
        step.results = [h.reason === 'hq' ? 'An HQ has been destroyed.'
          : h.reason === 'score' ? `${h.winner === null ? 'A side' : cap(whoIs(h.winner, b))} reached ${G.scoreTarget} points.`
            : h.reason === 'turn_limit' ? `The turn limit: ${G.scoreTarget > 0 ? 'the higher score' : 'most connected nodes'} wins, then HQ health.`
              : h.reason === 'concede' ? 'A side conceded.' : 'Decided on time.'];
        step.recap = step.headline;
      }
    }
  }

  function targetName(t: number, v: GridView): string {
    const u = v.units.find(x => x.tile === t);
    if (u) return unitName(u.uid, v);
    const h = hqSideAt(v, t);
    return h !== null ? `${whose(h, v)} HQ` : 'a tile';
  }
}

/** Card lookup for a view (member cards included), for the replay and the log. */
export function cardLookup(v: Pick<GridView, 'extraDefs'> | null) {
  return (slug: string) => gridDef(slug, v?.extraDefs);
}
