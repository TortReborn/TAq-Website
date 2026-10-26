'use client';

// The Warfront board: alternating turns on a grid (lib/duel/grid). Your side
// is always at the bottom. A turn is a series of actions sent one at a time
// (select a unit, move, then attack / ability / brace; deploy from the hand;
// the HQ ability; end turn), each checked by the same client helpers the
// server uses, so the board only ever offers legal moves. The opponent's
// turn plays back step by step on a rebuilt board (gridReplay.ts,
// useGridReplay.ts), with captions that say why each thing happened.

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeft, Bot, Castle, ChevronLeft, ChevronRight, CircleHelp, Crosshair, EyeOff, Flag, Footprints, Gem, Hand, Layers,
  Link2, Mountain, Pause, Play, RotateCcw, ScrollText, Shield, Snowflake, SkipForward, Sparkles, Swords, Target, Trophy, Waves, X,
} from 'lucide-react';
import type { GridController } from '@/hooks/useGrid';
import { ELEMENT_INFO } from '@/lib/duel/text';
import {
  attacksFrom, connection, deployOptions, deployTargets, distance, gridBraceText, gridCardMoveText, gridMoveText, gridTankText, hqOptions,
  isBraced, isFrozen, isYourTurn, moveOptions, neighbours, nodeAt, nodeScore, other, previewAttack, rulesOf, unitAt, unitById, unitOrders, attackTargets,
  type GridConfig,
  type AttackPreview, type GridAction, type GridEvent, type GridNode, type GridUnit, type GridView, type Side,
} from '@/lib/duel/grid/client';
import CardFace, { Art, CardBack, CardRulesProvider, KEYWORD_ICON, cardVars } from './CardFace';
import { QuickGridRules } from './GridGuide';
import { centre, dispXY, gridCardRules, nodeGivesText, orientOf, PERK_ICON, RESOURCE_NAME, speedWord, unitRange, type Orient } from './gridShared';
import { cardLookup, describe, type Mark, type ReplayStep } from './gridReplay';
import { useGridReplay, type ReplaySpeed, type Stage } from './useGridReplay';
import s from './duel.module.css';
import g from './grid.module.css';

type Sel =
  | { k: 'unit'; uid: string }
  | { k: 'enemy'; uid: string }
  | { k: 'ability'; uid: string }
  | { k: 'deploy'; uid: string }
  | { k: 'deployTarget'; uid: string; tile: number }
  | { k: 'hq' }
  | null;

const SPEED_LABEL: Record<ReplaySpeed, string> = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };
const RECAP_KIND: Record<ReplayStep['kind'], string> = {
  upkeep: 'Upkeep', hqfire: 'HQ fire', deploy: 'Deploy', move: 'Move', attack: 'Attack', ability: 'Ability', hq: 'HQ', brace: 'Brace',
  claim: 'Claim', endturn: 'End', end: 'Game',
};
const COLS = 'ABCDEFGHIJ';

// --- Effects: floats, shakes, lunges and ghosts, derived from a list of events -------

interface Float { id: string; tile: number; text: string; kind: 'dmg' | 'heal' | 'info' }
interface Fx { anim: Record<string, string>; floats: Float[]; ghosts: GridUnit[]; lunge: Record<string, [number, number]> }
const NO_FX: Fx = { anim: {}, floats: [], ghosts: [], lunge: {} };

function eventFx(events: GridEvent[], board: GridView, gone: GridUnit[], key: string, o: Orient, still: boolean): Fx {
  const anim: Record<string, string> = {};
  const floats: Float[] = [];
  const lunge: Record<string, [number, number]> = {};
  const tileOfUid = (uid: string) => unitById(board, uid)?.tile ?? gone.find(u => u.uid === uid)?.tile;
  const add = (uid: string, cls: string) => { if (!still) anim[uid] = cls; };
  const float = (tile: number | undefined, text: string, kind: Float['kind']) => { if (tile !== undefined) floats.push({ id: `${key}-${floats.length}`, tile, text, kind }); };
  for (const e of events) {
    switch (e.k) {
      case 'damage':
        float(e.tile, `−${e.n}`, 'dmg');
        if (e.armour) float(e.tile, `Armour ${e.armour}`, 'info');
        if (e.braced) float(e.tile, 'Braced', 'info');
        if ('unit' in e.target) add(e.target.unit, s.fxHit);
        break;
      case 'heal': float(e.tile, `+${e.n}`, 'heal'); if ('unit' in e.target) add(e.target.unit, s.fxHeal); break;
      case 'shield': float(tileOfUid(e.uid), 'Shield', 'info'); break;
      case 'claim': float(e.tile, 'Claimed', 'info'); break;
      case 'score':
        if (e.hq) float(board.hq[e.side === 0 ? 1 : 0], `+${e.n} pts`, 'heal');
        else for (const x of e.nodes) float(x.tile, `+${x.n} pts`, 'heal');
        break;
      case 'objective': float(e.tile, e.announced ? 'Next objective' : 'Objective', 'info'); break;
      case 'retaliate': float(tileOfUid(e.uid), 'Strike back', 'info'); break;
      case 'hqfire': float(board.hq[e.side], 'HQ fire', 'info'); break;
      case 'move': if (e.stopped) float(e.to, 'Guard stop', 'info'); break;
      case 'reveal': float(tileOfUid(e.uid), 'Revealed', 'info'); break;
      case 'freeze': float(tileOfUid(e.uid), 'Frozen', 'info'); add(e.uid, s.fxFreeze); break;
      case 'brace': float(tileOfUid(e.uid), 'Brace', 'info'); add(e.uid, s.fxCast); break;
      case 'deploy': case 'summon': add(e.uid, s.fxSummon); break;
      case 'ability': float(tileOfUid(e.uid), e.name, 'info'); add(e.uid, s.fxCast); break;
      case 'hq': float(board.hq[e.side], e.name, 'info'); break;
      case 'attack': {
        const [fx, fy] = dispXY(o, e.from);
        const [tx, ty] = dispXY(o, e.tile);
        if (!still) { lunge[e.uid] = [tx - fx, ty - fy]; anim[e.uid] = s.fxLunge; }
        if (e.flank) float(e.from, `Flank +${e.flank}`, 'info');
        break;
      }
    }
  }
  const dead = new Set(events.filter(e => e.k === 'death').map(e => (e as { uid: string }).uid));
  return { anim, floats, ghosts: gone.filter(u => dead.has(u.uid)), lunge };
}

// --- Small pieces --------------------------------------------------------------------

function Avatar({ uuid }: { uuid: string }) {
  if (!uuid) return <span className={g.botFace}><Bot size="60%" /></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://mc-heads.net/avatar/${uuid}/64`} alt="" draggable={false} />;
}

function Pips({ n, of, label }: { n: number; of: number; label: string }) {
  return (
    <span className={g.pips} role="img" aria-label={`${n} of ${of} ${label}`}>
      {Array.from({ length: of }, (_, i) => <span key={i} className={i < n ? g.pipOn : ''} />)}
    </span>
  );
}

function Mark({ m, o, cls, id }: { m: Mark; o: Orient; cls: string; id: string }) {
  const pts = [m.from, ...(m.path ?? [m.to])].map(t => centre(o, t));
  // Shorten the ends so the line starts and stops at the token's edge.
  const trim = (a: [number, number], b: [number, number], k: number): [number, number] => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [a[0] + (dx / len) * k, a[1] + (dy / len) * k];
  };
  if (pts.length >= 2) {
    pts[0] = trim(pts[0], pts[1], 0.28);
    pts[pts.length - 1] = trim(pts[pts.length - 1], pts[pts.length - 2], 0.3);
  }
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ');
  return <path d={d} className={cls} markerEnd={`url(#${id})`} />;
}

// --- The board ---------------------------------------------------------------------

export default function GridBattle({ ctl, backHref = '/duels' }: { ctl: GridController; backHref?: string }) {
  const v = ctl.view;
  const card = useMemo(() => cardLookup(v), [v?.extraDefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const cfg = v?.cfg;
  const cardRules = useMemo(() => gridCardRules(rulesOf({ cfg })), [cfg]);
  const rp = useGridReplay(v, card);
  const [sel, setSel] = useState<Sel>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ slug: string; uid?: string } | null>(null);
  const [replace, setReplace] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState(false);
  const [rules, setRules] = useState(false);
  const [resultSeen, setResultSeen] = useState(false);
  const [logTab, setLogTab] = useState<'recap' | 'log'>('log');
  const [recapAll, setRecapAll] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSel(null);
      setRules(false);
      setDrawer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A unit that has moved stays selected: it may still attack, use its ability or brace.
  const pendingUid = v && v.phase === 'main' && v.active === v.you ? v.pending : null;
  useEffect(() => {
    if (pendingUid) setSel({ k: 'unit', uid: pendingUid });
  }, [pendingUid]);

  // Drop a selection the new board no longer supports.
  useEffect(() => {
    if (!v || !sel) return;
    const mine = v.phase === 'main' && v.active === v.you;
    if (!mine && sel.k !== 'enemy') { setSel(null); return; }
    if ((sel.k === 'unit' || sel.k === 'ability' || sel.k === 'enemy') && !unitById(v, sel.uid)) setSel(null);
    if ((sel.k === 'deploy' || sel.k === 'deployTarget') && !(v.players[v.you].hand ?? []).some(h => h.uid === sel.uid)) setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  // A new replay opens the recap tab.
  const replayId = rp.st.replay?.id;
  useEffect(() => { if (replayId !== undefined) setLogTab('recap'); }, [replayId]);

  useEffect(() => {
    if (rp.st.mode === 'off') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); rp.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); rp.back(); }
      else if (e.key === ' ') { e.preventDefault(); if (rp.st.playing) rp.pause(); else rp.play(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rp]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    if (!v) return m;
    const note = (uid: string, slug: string) => { try { m.set(uid, card(slug).name); } catch { /* unknown card */ } };
    for (const e of v.log) if ('uid' in e && 'slug' in e) note(e.uid, e.slug);
    for (const u of v.units) note(u.uid, u.slug);
    for (const h of v.players[v.you].hand ?? []) note(h.uid, h.slug);
    return m;
  }, [v, card]);

  if (!v) {
    return (
      <div className={`${s.battle} ${g.grid}`}>
        <div className={s.topBar}><div className={s.topTitle}><Link href={backHref}><ArrowLeft size={14} /> Duels</Link></div></div>
        <div className={g.loading}><p>{ctl.error ?? 'Surveying the front...'}</p></div>
      </div>
    );
  }

  const G = rulesOf(v);
  const me = v.you;
  const foe = other(me);
  const o = orientOf(v);
  const W = v.width;
  const H = v.height;
  const nameOf = (uid: string) => names.get(uid) ?? 'A unit';

  // --- Which board to draw: the live one, or the replay's rebuilt one ---
  const step = rp.step;
  const stage: Stage = rp.st.stage;
  const watching = rp.st.mode === 'board' && !!step;
  const rebuilt = rp.st.replay?.ok ?? true;
  const bv: GridView = watching && step && rebuilt ? (stage === 'hit' ? step.after : step.before) : v;

  const myTurn = v.phase === 'main' && isYourTurn(v);
  const canPlay = myTurn && !watching && !ctl.pending;
  const hand = v.players[me].hand ?? [];
  const conn = connection(bv);
  const liveConn = connection(v);

  // --- The selection: what it can reach ---
  const uo = canPlay && (sel?.k === 'unit' || sel?.k === 'ability') ? unitOrders(v, sel.uid) : null;
  const moveTiles = new Map((uo && sel?.k === 'unit' ? uo.moves : []).map(m => [m.to, m]));
  const attackTiles = new Map((uo && sel?.k === 'unit' ? uo.attacks : []).map(a => [a.tile, a]));
  const abilityTiles = new Set(uo && sel?.k === 'ability' ? uo.ability?.targets ?? [] : []);
  const deploys = canPlay ? deployOptions(v) : [];
  const dOpt = sel && (sel.k === 'deploy' || sel.k === 'deployTarget') ? deploys.find(d => d.uid === sel.uid) : undefined;
  const deployTiles = new Map((sel?.k === 'deploy' && dOpt ? dOpt.tiles : []).map(t => [t.tile, t.forward]));
  const deployTargetTiles = new Set(sel?.k === 'deployTarget' ? deployTargets(v, sel.uid, sel.tile) : []);
  const hqo = hqOptions(v);
  const hqTargets = new Set(canPlay && sel?.k === 'hq' ? hqo.targets : []);
  const enemySel = sel?.k === 'enemy' ? unitById(v, sel.uid) : undefined;
  const enemyMoves = new Set(enemySel && !watching ? moveOptions(v, enemySel).map(m => m.to) : []);
  const enemyHits = new Set(enemySel && !watching ? attackTargets(v, enemySel, enemySel.tile).map(a => a.tile) : []);
  const selUnit = sel && (sel.k === 'unit' || sel.k === 'ability') ? unitById(v, sel.uid) : undefined;

  // Hovering a move tile shows the path and what it could hit from there.
  const hoverMove = hover !== null ? moveTiles.get(hover) : undefined;
  const thenHits = new Set(hoverMove && selUnit ? attacksFrom({ ...v, units: v.units.map(u => (u.uid === selUnit.uid ? { ...u, tile: hoverMove.to } : u)) }, selUnit.uid, hoverMove.to).map(a => a.tile) : []);
  const preview: AttackPreview | null = hover !== null && selUnit && attackTiles.has(hover) ? previewAttack(v, selUnit.uid, hover) : null;

  // HQ zones, shown while an HQ is hovered.
  const hoverHq = hover !== null ? (v.hq[0] === hover ? 0 : v.hq[1] === hover ? 1 : null) : null;
  const fireZone = new Set(hoverHq !== null
    ? (G.hqFireReach > 1 ? Array.from({ length: W * H }, (_, t) => t).filter(t => t !== v.hq[hoverHq] && distance(v, t, v.hq[hoverHq]) <= G.hqFireReach) : neighbours(v, v.hq[hoverHq])) : []);
  const siegeZone = new Set(hoverHq !== null && G.hqReach > 1
    ? Array.from({ length: W * H }, (_, t) => t).filter(t => t !== v.hq[hoverHq] && distance(v, t, v.hq[hoverHq]) <= G.hqReach && !fireZone.has(t)) : []);

  // --- Actions ---
  const act = (a: GridAction) => { if (canPlay) void ctl.send(a); };

  function clickTile(t: number) {
    if (watching) { rp.skip(); return; }
    const u = unitAt(v!, t);
    if (u) setFocus({ slug: u.slug, uid: u.uid });
    if (!canPlay) {
      if (u && u.side !== me) setSel(sel?.k === 'enemy' && sel.uid === u.uid ? null : { k: 'enemy', uid: u.uid });
      return;
    }
    if (sel?.k === 'deploy' && deployTiles.has(t)) {
      const ts = deployTargets(v!, sel.uid, t);
      if (dOpt?.targeted && ts.length) setSel({ k: 'deployTarget', uid: sel.uid, tile: t });
      else { act({ type: 'deploy', uid: sel.uid, tile: t }); setSel(null); }
      return;
    }
    if (sel?.k === 'deployTarget') {
      if (deployTargetTiles.has(t)) { act({ type: 'deploy', uid: sel.uid, tile: sel.tile, target: t }); setSel(null); }
      else setSel({ k: 'deploy', uid: sel.uid });
      return;
    }
    if (sel?.k === 'hq' && hqTargets.has(t)) { act({ type: 'hq', target: t }); setSel(null); return; }
    if (sel?.k === 'ability' && abilityTiles.has(t)) { act({ type: 'ability', uid: sel.uid, target: t }); setSel(null); return; }
    if (sel?.k === 'unit') {
      if (attackTiles.has(t)) { act({ type: 'attack', uid: sel.uid, target: t }); setSel(null); return; }
      if (moveTiles.has(t)) { act({ type: 'move', uid: sel.uid, to: t }); return; }
    }
    if (u && u.side === me) setSel(sel?.k === 'unit' && sel.uid === u.uid && v!.pending !== u.uid ? null : { k: 'unit', uid: u.uid });
    else if (u) setSel(sel?.k === 'enemy' && sel.uid === u.uid ? null : { k: 'enemy', uid: u.uid });
    else setSel(null);
  }

  function clickHand(uid: string, slug: string) {
    setFocus({ slug });
    if (watching) { rp.skip(); return; }
    if (!canPlay) return;
    const d = deploys.find(x => x.uid === uid);
    if (!d?.affordable || !d.tiles.length) return;
    setSel(sel && (sel.k === 'deploy' || sel.k === 'deployTarget') && sel.uid === uid ? null : { k: 'deploy', uid });
  }

  function clickHqAbility() {
    if (watching) { rp.skip(); return; }
    if (!canPlay || !hqo.usable) return;
    if (hqo.targeted) { if (hqo.targets.length) setSel(sel?.k === 'hq' ? null : { k: 'hq' }); }
    else act({ type: 'hq' });
  }

  function useAbility() {
    if (!uo?.ability || !selUnit) return;
    if (uo.ability.targeted) setSel({ k: 'ability', uid: selUnit.uid });
    else { act({ type: 'ability', uid: selUnit.uid }); setSel(null); }
  }

  // --- Is anything useful left this turn? (End turn glows when not.) ---
  const useful = canPlay && (
    v.units.some(u => {
      if (u.side !== me) return false;
      const x = unitOrders(v, u.uid);
      if (!x) return false;
      if (x.pending) return x.attacks.length > 0 || !!(x.ability && x.ability.affordable && (!x.ability.targeted || x.ability.targets.length));
      return x.canAct && (x.moves.length > 0 || x.attacks.length > 0);
    })
    || deploys.some(d => d.affordable && d.tiles.length > 0)
    || (hqo.usable && (!hqo.targeted || hqo.targets.length > 0))
  );

  // --- Replay pieces ---
  const replay = rp.st.replay;
  const nSteps = replay?.steps.length ?? 0;
  const gone = watching && step ? step.before.units.filter(u => !step.after.units.some(x => x.uid === u.uid)) : rp.flash?.gone ?? [];
  const fx: Fx = watching && step && stage === 'hit'
    ? eventFx(step.events, step.after, gone, `r${step.i}-${rp.st.tick}`, o, rp.reduce)
    : !watching && rp.flash ? eventFx(rp.flash.events, v, gone, `f${rp.flash.key}`, o, rp.reduce) : NO_FX;
  const marks: Mark[] = watching && step ? (stage === 'hit' ? step.hitMarks : step.cueMarks) : [];
  const aim = new Set(watching && step ? step.aim : []);
  const actorUid = watching && step ? step.actor : undefined;
  const actorHq = watching && step ? step.hq : undefined;

  // --- Orders this turn ---
  const turnEvent = [...v.log].reverse().find((e): e is Extract<GridEvent, { k: 'turn' }> => e.k === 'turn' && e.turn === v.turn);
  const ordersTotal = turnEvent?.orders ?? (v.turn === 1 ? G.firstOrders : G.orders);
  const deadlineLeft = ctl.deadline ? Math.max(0, Math.round((ctl.deadline - now) / 1000)) : null;
  const clockText = deadlineLeft !== null ? `${Math.floor(deadlineLeft / 60)}:${String(deadlineLeft % 60).padStart(2, '0')}` : null;

  // --- Hint ---
  let hint = '';
  if (ctl.pending) hint = 'Sending...';
  else if (v.phase === 'main' && !myTurn) hint = `${v.players[foe].name} is taking their turn...`;
  else if (canPlay) {
    if (sel?.k === 'deploy') hint = `Choose a green tile for ${dOpt ? card(dOpt.slug).name : 'it'}. Gold tiles are forward, next to a connected node.`;
    else if (sel?.k === 'deployTarget') hint = 'Choose a target for its on-deploy effect.';
    else if (sel?.k === 'hq') hint = `Choose a target for ${hqo.name}.`;
    else if (sel?.k === 'ability') hint = `Choose a target for ${uo?.ability?.name ?? 'its ability'}.`;
    else if (sel?.k === 'unit' && uo && selUnit) {
      const nm = card(selUnit.slug).name;
      if (uo.pending) hint = uo.attacks.length ? `${nm} moved. Attack a red target, use its ability, brace, or finish.` : `${nm} moved. Nothing in reach: brace, use its ability, or finish.`;
      else if (uo.canAct) hint = `${nm}: click a green tile to move${uo.attacks.length ? ', or a red target to attack from here' : ''}. Hover a tile to preview.`;
      else hint = selUnit.acted ? `${nm} has already acted this turn.` : selUnit.fresh ? `${nm} arrived this turn: it acts next turn.` : isFrozen(v, selUnit) ? `${nm} is frozen.` : v.ordersLeft < 1 ? 'No orders left this turn.' : '';
    } else if (sel?.k === 'enemy' && enemySel) hint = `${card(enemySel.slug).name} can move to the red-dotted tiles.`;
    else hint = useful ? `${v.ordersLeft} of ${ordersTotal} orders left. Select a unit, or a card to deploy.` : 'Nothing useful left: end your turn.';
  } else if (v.phase === 'main' && sel?.k === 'enemy' && enemySel) hint = `${card(enemySel.slug).name} can move to the red-dotted tiles.`;

  // --- Rendering: a tile ---
  const tileAt = (dx: number, dy: number) => (o.flip ? (H - 1 - dy) * W + (W - 1 - dx) : dy * W + dx);
  const label = (t: number) => { const [x, y] = dispXY(o, t); return `${COLS[x]}${H - y}`; };

  const tile = (t: number) => {
    const terrain = bv.terrain[t];
    const node = nodeAt(bv, t);
    const hqSide = bv.hq[0] === t ? 0 : bv.hq[1] === t ? 1 : null;
    const u = unitAt(bv, t);
    const [dx, dy] = dispXY(o, t);
    const checker = (dx + dy) % 2 === 0;
    const isMove = moveTiles.has(t);
    const isAttack = attackTiles.has(t);
    const isDeploy = deployTiles.has(t);
    const forward = deployTiles.get(t);
    const isTarget = abilityTiles.has(t) || deployTargetTiles.has(t) || hqTargets.has(t);
    const connectedOwner = node && node.owner !== null && conn[node.owner].nodes.includes(t);
    // Territory score: what this node scores for its holder at their next upkeep (dim: its value once held and connected).
    const scores = node && node.owner !== null ? conn[node.owner].scoring.find(x => x.tile === t) : undefined;
    const isObjective = !!node && G.objectiveEvery > 0 && bv.objective?.tile === t;
    const isNextObjective = !!node && G.objectiveEvery > 0 && bv.nextObjective?.tile === t;
    const cls = [
      g.tile,
      terrain === 'mountain' ? g.mountain : terrain === 'water' ? g.water : checker ? g.plainA : g.plainB,
      node ? g.nodeTile : '',
      node?.city ? g.cityTile : '',
      node && node.owner === me ? g.ownMine : node && node.owner === foe ? g.ownFoe : '',
      node && node.owner !== null && !connectedOwner ? g.cut : '',
      isObjective ? g.objectiveTile : isNextObjective ? g.objectiveNext : '',
      hqSide !== null ? (hqSide === me ? g.hqMine : g.hqFoe) : '',
      isMove ? g.canMove : '',
      hoverMove?.path.includes(t) ? g.onPath : '',
      isAttack ? g.canAttack : '',
      thenHits.has(t) ? g.thenHit : '',
      isDeploy ? (forward ? g.canDeployForward : g.canDeploy) : '',
      isTarget ? g.canTarget : '',
      enemyMoves.has(t) ? g.threatMove : '',
      enemyHits.has(t) ? g.threatHit : '',
      fireZone.has(t) ? (hoverHq === me ? g.zoneFireMine : g.zoneFire) : '',
      siegeZone.has(t) ? g.zoneSiege : '',
      aim.has(t) ? g.aimed : '',
      actorHq !== undefined && bv.hq[actorHq] === t ? g.actorHq : '',
      hover === t ? g.hovered : '',
    ].join(' ');
    const parts: string[] = [`${label(t)}:`, terrain === 'plain' ? '' : terrain];
    if (node) parts.push(`${node.city ? 'city ' : ''}node ${node.name}${node.resource ? ` (${node.resource})` : ''}, ${node.owner === null ? 'unclaimed' : node.owner === me ? 'yours' : 'theirs'}${node.owner !== null && !connectedOwner ? ', not connected' : ''}${scores ? `, scores ${scores.n}` : ''}${isObjective ? ', the objective' : isNextObjective ? ', the next objective' : ''}`);
    if (hqSide !== null) parts.push(`${hqSide === me ? 'your' : 'enemy'} HQ, ${bv.players[hqSide].hp} health, armour ${conn[hqSide].armour}`);
    if (u) parts.push(`${u.side === me ? 'your' : 'enemy'} ${card(u.slug).name}, ${u.power + u.boost} power, ${u.health} of ${u.maxHealth} health`);
    if (isMove) parts.push('move here');
    if (isAttack) parts.push('attack');
    if (isDeploy) parts.push(forward ? 'deploy here (forward)' : 'deploy here');
    if (isTarget) parts.push('target');
    const Perk = node ? (node.city ? PERK_ICON.city : node.resource ? PERK_ICON[node.resource] : Gem) : null;
    const hqCon = hqSide !== null ? conn[hqSide] : null;
    return (
      <button
        key={t}
        type="button"
        className={cls}
        onClick={() => clickTile(t)}
        onMouseEnter={() => { setHover(t); const x = unitAt(bv, t); if (x) setFocus({ slug: x.slug, uid: x.uid }); }}
        onFocus={() => { setHover(t); const x = unitAt(bv, t); if (x) setFocus({ slug: x.slug, uid: x.uid }); }}
        aria-label={parts.filter(Boolean).join(' ')}
        style={{ gridColumn: dx + 1, gridRow: dy + 1 }}
      >
        {terrain === 'mountain' && <Mountain className={g.terrainIcon} aria-hidden />}
        {terrain === 'water' && <Waves className={g.terrainIcon} aria-hidden />}
        {node && Perk && (
          <span className={g.nodeTag} title={`${node.name}${node.city ? ' (city)' : ''}: ${nodeGivesText(node, G)} while connected`}>
            <Perk size="1em" aria-hidden />
            <span className={g.nodeName}>{node.name}</span>
          </span>
        )}
        {node && G.scoreTarget > 0 && (
          <span
            className={`${g.nodeScore} ${scores ? (node.owner === me ? g.nodeScoreMine : g.nodeScoreFoe) : ''}`}
            title={scores ? `Scores ${scores.n} for ${node.owner === me ? 'you' : bv.players[foe].name} at the start of ${node.owner === me ? 'your' : 'their'} turn${scores.objective ? ' (objective bonus included)' : ''}` : 'Scores nothing now: claim it and keep it connected to your HQ'}
          >
            +{scores ? scores.n : nodeValue(G, node, me, bv)}
          </span>
        )}
        {(isObjective || isNextObjective) && (
          <span
            className={`${g.objMark} ${isNextObjective && !isObjective ? g.objMarkNext : ''}`}
            title={isObjective ? `Objective through turn ${Math.ceil(bv.objective!.until / 2)}: +${G.objectiveBonus} a turn to its holder` : `Next objective, from turn ${Math.ceil(bv.nextObjective!.from / 2)}: +${G.objectiveBonus} a turn to its holder`}
          >
            <Target size="1em" aria-hidden />
          </span>
        )}
        {hqSide !== null && hqCon && (
          <span className={g.hqBody}>
            <Castle className={g.hqIcon} aria-hidden />
            <span className={g.hqHp}><b>{Math.max(0, bv.players[hqSide].hp)}</b></span>
            <span className={g.hqBar} aria-hidden><span style={{ width: `${(100 * Math.max(0, bv.players[hqSide].hp)) / G.hqHp}%` }} /></span>
            {hqCon.armour > 0 && <span className={g.hqArmour} title={`HQ armour ${hqCon.armour}: every hit does ${hqCon.armour} less (never below ${G.armourMin})${hqCon.grown ? `, ${hqCon.grown} of it grown from damage taken` : ''}`}><Shield size="1em" aria-hidden />{hqCon.armour}</span>}
          </span>
        )}
        {isMove && !u && <span className={g.moveDot} aria-hidden />}
        {(isAttack || isTarget) && <Crosshair className={g.targetIcon} aria-hidden />}
        {isDeploy && <span className={g.deployPlus} aria-hidden>+</span>}
        {enemyMoves.has(t) && !u && <span className={g.threatDot} aria-hidden />}
      </button>
    );
  };

  // --- Rendering: a unit token (over the tiles; clicks go to the tile under it) ---
  const token = (u: GridUnit, ghost = false) => {
    const def = card(u.slug);
    const [dx, dy] = dispXY(o, u.tile);
    const own = u.side === me;
    const x = own && canPlay ? unitOrders(v, u.uid) : null;
    const ready = !!x && !watching && (x.canAct || x.pending) && !sel;
    const spent = own && canPlay && !x?.canAct && !x?.pending;
    const braced = isBraced(bv, u);
    const frozen = isFrozen(bv, u);
    const selected = !!sel && 'uid' in sel && sel.uid === u.uid;
    const range = unitRange(u, G);
    const el = ELEMENT_INFO[u.element];
    const power = u.power + u.boost;
    const lunge = fx.lunge[u.uid];
    const style = {
      ...cardVars(def),
      left: `${(100 * dx) / W}%`,
      top: `${(100 * dy) / H}%`,
      width: `${100 / W}%`,
      height: `${100 / H}%`,
      ...(lunge ? { '--dx': `${lunge[0] * 100}%`, '--dy': `${lunge[1] * 100}%` } : {}),
    } as CSSProperties;
    const cls = [
      g.tokenSlot,
      ghost ? `${g.ghost} ${rp.reduce ? g.ghostStill : s.fxDeath}` : fx.anim[u.uid] ?? '',
    ].join(' ');
    const tcls = [
      g.token,
      own ? g.tokMine : g.tokFoe,
      ready ? g.tokReady : '',
      x?.pending ? g.tokPending : '',
      spent ? g.tokSpent : '',
      selected ? g.tokSelected : '',
      braced ? g.tokBraced : '',
      u.stealth ? g.tokStealth : '',
      frozen ? g.tokFrozen : '',
      actorUid === u.uid ? g.tokActor : '',
      attackTiles.has(u.tile) || abilityTiles.has(u.tile) || deployTargetTiles.has(u.tile) || hqTargets.has(u.tile) ? g.tokTarget : '',
    ].join(' ');
    return (
      <div key={ghost ? `ghost-${u.uid}-${rp.st.tick}` : u.uid} className={cls} style={style} aria-hidden>
        <div className={tcls}>
          <Art def={def} className={g.tokArt} />
          <span className={g.tokEl} style={{ color: el.color, borderColor: el.color }} title={el.name}>{el.glyph}</span>
          <span className={`${g.tokRange} ${u.speed > 0 ? g.fast : u.speed < 0 ? g.slow : ''}`} title={`${speedWord(u.speed)}: ${gridMoveText(u.element, u.speed, G)}`}>
            <Footprints size="0.9em" aria-hidden />{range}
          </span>
          {u.keywords.length > 0 && (
            <span className={g.tokKws}>
              {u.keywords.slice(0, 4).map(k => {
                const Icon = KEYWORD_ICON[k];
                return <span key={k} className={`${g.tokKw} ${k === 'guard' ? g.tokKwGuard : ''}`}>{Icon ? <Icon size="1em" aria-hidden /> : k.charAt(0)}</span>;
              })}
            </span>
          )}
          {braced && <span className={g.tokBrace} title="Braced: half damage"><Shield size="1em" aria-hidden /></span>}
          {frozen && <span className={g.tokFrost} title="Frozen"><Snowflake size="1em" aria-hidden /></span>}
          {u.stealth && <span className={g.tokHidden} title="Stealth"><EyeOff size="1em" aria-hidden /></span>}
          {u.shield && <span className={g.tokShield} aria-hidden />}
          <span className={`${s.statGem} ${s.powerGem} ${g.gem} ${power > def.power ? s.gemUp : power < def.power ? s.gemDown : ''}`}>{power}</span>
          <span className={`${s.statGem} ${s.healthGem} ${g.gem} ${u.health < u.maxHealth ? s.gemDown : ''}`}>{Math.max(0, u.health)}</span>
        </div>
      </div>
    );
  };

  // --- Connection network: each side's chain from its HQ ---
  const network = (side: Side) => {
    const set = new Set(conn[side].tiles);
    const segs: ReactNode[] = [];
    for (const t of conn[side].tiles) {
      for (const n of neighbours(bv, t, 4)) {
        if (n <= t || !set.has(n)) continue;
        const [x1, y1] = centre(o, t);
        const [x2, y2] = centre(o, n);
        segs.push(<line key={`${t}-${n}`} x1={x1} y1={y1} x2={x2} y2={y2} />);
      }
    }
    return <g className={side === me ? g.netMine : g.netFoe}>{segs}</g>;
  };

  // --- Player panels ---
  const playerPanel = (side: Side) => {
    const p = bv.players[side];
    const own = side === me;
    const el = ELEMENT_INFO[p.tank];
    const c = conn[side];
    const tank = gridTankText(p, G);
    const active = bv.phase === 'main' && bv.active === side;
    const totalNodes = bv.nodes.length;
    return (
      <section className={`${g.player} ${own ? g.playerMine : g.playerFoe} ${active ? g.playerActive : ''}`} aria-label={own ? 'You' : p.name}>
        <div className={g.pHead}>
          <span className={g.pFace} style={{ '--el': el.color } as CSSProperties}><Avatar uuid={p.avatar} /></span>
          <span className={g.pName}>
            <b>{own ? `${p.name} (you)` : p.name}</b>
            <span className={`${g.pSub} readable-font`}>{el.glyph} {el.name} tank{active ? (own ? ' · your turn' : ' · their turn') : ''}</span>
          </span>
          {active && clockText && !watching && <span className={`${s.clock} ${deadlineLeft !== null && deadlineLeft <= 10 ? s.clockLow : ''} ${g.pClock}`}>{clockText}</span>}
        </div>
        <div className={g.pHq} title={`HQ: ${Math.max(0, p.hp)} of ${G.hqHp} health`}>
          <Castle size={16} aria-hidden />
          <span className={g.pHqBar}><span style={{ width: `${(100 * Math.max(0, p.hp)) / G.hqHp}%` }} /></span>
          <b>{Math.max(0, p.hp)}</b><span className={g.pOf}>/{G.hqHp}</span>
        </div>
        {G.scoreTarget > 0 && (
          <div className={g.pScore} title={`Score: ${c.score} of ${G.scoreTarget}. Reach ${G.scoreTarget} to win. Its nodes would score ${c.rate} at the start of ${own ? 'your' : 'their'} turn.`}>
            <Trophy size={16} aria-hidden />
            <span className={g.pScoreBar}>
              <span style={{ width: `${Math.min(100, (100 * c.score) / G.scoreTarget)}%` }} />
              <span className={g.pScoreNext} style={{ left: `${Math.min(100, (100 * c.score) / G.scoreTarget)}%`, width: `${Math.max(0, Math.min(100 - (100 * c.score) / G.scoreTarget, (100 * c.rate) / G.scoreTarget))}%` }} />
            </span>
            <b>{c.score}</b><span className={g.pOf}>/{G.scoreTarget}</span>
            {c.rate > 0 && <span className={g.pScoreRate} title="Points its nodes would score at the start of its turn">+{c.rate}</span>}
          </div>
        )}
        <div className={`${g.pStats} readable-font`}>
          <span title={`HQ armour: every hit on this HQ does ${c.armour} less (never below ${G.armourMin}).${G.armourPerNode ? ` ${G.armourPerNode} per connected node.` : ''}${G.armourGrowth ? ` +1 for every ${G.armourGrowth} health lost.` : ''}`}><Shield size={14} aria-hidden /> Armour <b>{c.armour}</b></span>
          <span title={`Connected nodes: each ${nodeGivesText({ city: false, resource: null }, G)}`}><Link2 size={14} aria-hidden /> Nodes <b>{c.nodes.length}</b>/{totalNodes}</span>
          <span title={`Emeralds banked (cap ${G.bankCap})`}><Gem size={14} aria-hidden /> <b>{p.emeralds}</b>/{G.bankCap}</span>
          <span title="Cards in hand and deck"><Hand size={14} aria-hidden /> <b>{p.handCount}</b> · <Layers size={13} aria-hidden /> {p.deckCount}</span>
        </div>
        {own ? (
          <button
            type="button"
            className={`${g.tankBtn} ${canPlay && hqo.usable ? g.tankReady : ''} ${sel?.k === 'hq' ? g.tankOn : ''}`}
            style={{ '--el': el.color } as CSSProperties}
            onClick={clickHqAbility}
            disabled={!canPlay || !hqo.usable || (hqo.targeted && !hqo.targets.length)}
            title={`${tank.name} (${tank.cost} emeralds): ${tank.text}`}
          >
            <span className={g.tankGlyph}>{el.glyph}</span>
            <span className={g.tankName}>{tank.name}</span>
            <span className={g.tankCost}><Gem size={12} aria-hidden />{tank.cost}</span>
          </button>
        ) : (
          <p className={`${g.pTank} readable-font`} title={tank.text}>{el.glyph} <b>{tank.name}</b> ({tank.cost}): {tank.text}</p>
        )}
        {active && bv.phase === 'main' && (
          <div className={g.pOrders}>
            <span>Orders</span>
            <Pips n={bv.ordersLeft} of={Math.max(bv.ordersLeft, ordersTotal)} label="orders left" />
            <b>{bv.ordersLeft}</b>
          </div>
        )}
      </section>
    );
  };

  // --- The info panel: the hovered tile, or a legend ---
  const info = (() => {
    const t = hover;
    if (t === null) {
      return (
        <div className={`${g.legend} readable-font`}>
          <b>Reading the board</b>
          <span><i className={`${g.lg} ${g.lgMove}`} /> Move here</span>
          <span><i className={`${g.lg} ${g.lgAttack}`} /> Attack target</span>
          <span><i className={`${g.lg} ${g.lgDeploy}`} /> Deploy tile (gold: forward)</span>
          <span><i className={`${g.lg} ${g.lgNet}`} /> Your connection chain</span>
          {G.scoreTarget > 0 && <span><Trophy size={14} /> +N: what a node scores each turn</span>}
          {G.objectiveEvery > 0 && <span><Target size={14} /> Objective (faint: next)</span>}
          <span><Mountain size={14} /> Mountain: only Air crosses</span>
          <span><Waves size={14} /> Water: entering ends a move</span>
          <span><Footprints size={14} /> Movement range</span>
          <span className={g.muted}>Hover a tile or an HQ for details.</span>
        </div>
      );
    }
    const node = nodeAt(bv, t);
    const hqSide = bv.hq[0] === t ? 0 : bv.hq[1] === t ? 1 : null;
    const terrain = bv.terrain[t];
    return (
      <div className={`${g.tileInfo} readable-font`}>
        <b>{label(t)} · {terrain === 'plain' ? 'Plain' : terrain === 'mountain' ? 'Mountain' : 'Water'}</b>
        {terrain === 'mountain' && <p>Blocks movement for all but Air, and blocks Ranged sight.</p>}
        {terrain === 'water' && <p>Entering water ends a move, except for Water units, which run along it.</p>}
        {node && <NodeInfo g={G} node={node} me={me} connected={node.owner !== null && conn[node.owner].nodes.includes(t)} foeName={bv.players[foe].name} v={bv} />}
        {hqSide !== null && (
          <p>
            <b>{hqSide === me ? 'Your HQ' : `${bv.players[hqSide].name}'s HQ`}</b>: {Math.max(0, bv.players[hqSide].hp)}/{G.hqHp} health, armour {conn[hqSide].armour}.
            {' '}It fires for {conn[hqSide].hqFire} at one adjacent enemy at the start of its turn (orange tiles).
            {G.hqReach > 1 && ` Enemies can attack it from up to ${G.hqReach} tiles away (dashed tiles).`}
          </p>
        )}
        {preview && selUnit && (
          <div className={g.previewBox}>
            <b>Attack preview</b>
            <PreviewLines p={preview} v={v} />
          </div>
        )}
      </div>
    );
  })();

  // --- Action strip: the selected unit's follow-ups, replay controls, end turn ---
  const controls = (
    <span className={g.rControls} role="group" aria-label="Replay controls">
      <button type="button" className={g.rBtn} onClick={rp.back} disabled={rp.st.idx === 0 && (stage === 'cue' || rp.reduce)} aria-label="Previous step" title="Previous step (Left arrow)"><ChevronLeft size={17} /></button>
      {rp.st.playing
        ? <button type="button" className={`${g.rBtn} ${g.rPlay}`} onClick={rp.pause} aria-label="Pause" title="Pause (Space)"><Pause size={17} /></button>
        : <button type="button" className={`${g.rBtn} ${g.rPlay}`} onClick={rp.play} aria-label="Play" title="Play (Space)"><Play size={17} /></button>}
      <button type="button" className={g.rBtn} onClick={rp.next} aria-label="Next step" title="Next step (Right arrow)"><ChevronRight size={17} /></button>
      <span className={g.rSpeed} role="radiogroup" aria-label="Replay speed">
        {(['slow', 'normal', 'fast'] as ReplaySpeed[]).map(sp => (
          <button key={sp} type="button" role="radio" aria-checked={rp.speed === sp} className={`${g.rSpeedBtn} ${rp.speed === sp ? g.rSpeedOn : ''}`} onClick={() => rp.setSpeed(sp)}>{SPEED_LABEL[sp]}</button>
        ))}
      </span>
    </span>
  );

  const unitBar = canPlay && sel?.k === 'unit' && uo && selUnit && (uo.canAct || uo.pending) ? (
    <span className={g.unitBar} role="group" aria-label={`Orders for ${card(selUnit.slug).name}`}>
      <b className={g.unitBarName}>{card(selUnit.slug).name}</b>
      {uo.attacks.length > 0 && <span className={g.unitBarTag}><Swords size={13} aria-hidden /> {uo.attacks.length} in reach</span>}
      {uo.ability && (
        <button type="button" className={`${s.btn} ${g.small}`} onClick={useAbility} disabled={uo.ability.used || !uo.ability.affordable || (uo.ability.targeted && !uo.ability.targets.length)} title={card(selUnit.slug).abilities.find(a => a.when === 'move') ? `${uo.ability.name}: uses this unit's order` : undefined}>
          <Sparkles size={14} /> {uo.ability.name} <span className={g.cost}><Gem size={11} />{uo.ability.cost}</span>
        </button>
      )}
      {uo.canBrace && <button type="button" className={`${s.btn} ${g.small}`} onClick={() => { act({ type: 'brace', uid: selUnit.uid }); setSel(null); }} title={gridBraceText(G)}><Shield size={14} /> Brace</button>}
      {uo.pending && <button type="button" className={`${s.btn} ${g.small}`} onClick={() => setSel(null)}>Done</button>}
      {!uo.pending && <button type="button" className={`${s.btn} ${g.small}`} onClick={() => setSel(null)} aria-label="Cancel"><X size={14} /></button>}
    </span>
  ) : canPlay && sel && sel.k !== 'unit' && sel.k !== 'enemy' ? (
    <span className={g.unitBar}><button type="button" className={`${s.btn} ${g.small}`} onClick={() => setSel(sel.k === 'ability' ? { k: 'unit', uid: sel.uid } : null)}><X size={14} /> Cancel</button></span>
  ) : null;

  const narration = watching && step ? (
    <div className={`${g.narration} ${step.side === me ? g.nMine : step.side === foe ? g.nFoe : ''}`} style={{ '--p': (rp.st.idx + (stage === 'hit' ? 1 : 0.5)) / Math.max(1, nSteps) } as CSSProperties}>
      <span className={g.nPhase}>{step.phase}</span>
      <div className={`${g.nText} readable-font`} aria-live="polite">
        <b>{step.headline}</b>
        {stage === 'hit' && step.results.length > 0 && <span key={`r${step.i}`} className={g.nResults}>{step.results.join(' ')}</span>}
      </div>
      <span className={g.nCount}>{rp.st.idx + 1}/{nSteps}</span>
      <span className={g.nProgress} aria-hidden />
    </div>
  ) : null;

  // --- Log lines ---
  const lines: { text: string; head?: boolean; side?: Side; fresh: boolean }[] = [];
  v.log.forEach((e, i) => {
    const fresh = v.logBase + i >= rp.freshFrom;
    if (e.k === 'turn') { lines.push({ text: `Turn ${e.turn} · ${e.side === me ? 'You' : v.players[e.side].name}`, head: true, fresh }); return; }
    if (e.k === 'end_turn' || e.k === 'start') return;
    if ((e.k === 'draw' || e.k === 'income') && e.side !== me) return;
    const t = describe(e, v, nameOf, card);
    if (t) lines.push({ text: t, side: 'side' in e ? e.side : undefined, fresh });
  });

  const tally = replay?.tally;
  const summary = tally && rp.endedAt !== null && rp.st.mode === 'off' ? (
            <div className={`${g.summary} readable-font`} role="status">
              <b>{v.players[foe].name}&apos;s turn</b>
              {(tally.hqTaken > 0 || tally.hqDealt > 0) && <span>HQ: <em className={g.bad}>{tally.hqTaken} taken</em>{tally.hqDealt > 0 && <> · <em className={g.good}>{tally.hqDealt} dealt</em></>}</span>}
              {(tally.killed > 0 || tally.lost > 0) && <span>Units: {tally.lost} lost · {tally.killed} destroyed</span>}
              {tally.nodesLost.length > 0 && <span className={g.bad}>Lost {tally.nodesLost.join(', ')}</span>}
              {tally.nodesWon.length > 0 && <span className={g.good}>You claimed {tally.nodesWon.join(', ')}</span>}
              <span>Connected nodes: you {tally.mine} · them {tally.theirs}</span>
              {tally.target > 0 && <span>Score: you {tally.scoreMine} · them {tally.scoreTheirs} of {tally.target}{tally.scoredTheirs > 0 && <em className={g.bad}> (+{tally.scoredTheirs} them)</em>}</span>}
            </div>
  ) : null;
  const recapSteps = replay ? replay.steps.filter(x => recapAll || x.weight > 0) : [];
  const needsMulligan = v.phase === 'mulligan' && !v.players[me].mulliganed;
  const result = v.phase === 'over' ? (v.winner === null ? 'Draw' : v.winner === me ? 'Victory' : 'Defeat') : null;
  const focusDef = focus ? card(focus.slug) : null;
  const focusUnit = focus?.uid ? unitById(bv, focus.uid) : undefined;
  const focusMove = focusDef ? (focusUnit ? { speed: speedWord(focusUnit.speed), text: gridMoveText(focusUnit.element, focusUnit.speed, G) } : gridCardMoveText(focusDef, G)) : null;
  const layoutName = v.layout;

  const displayTiles: number[] = [];
  for (let dy = 0; dy < H; dy++) for (let dx = 0; dx < W; dx++) displayTiles.push(tileAt(dx, dy));

  return (
    <CardRulesProvider value={cardRules}>
      <div className={`${s.battle} ${g.grid}`}>
        <div className={`${s.topBar} ${g.top}`}>
          <div className={s.topTitle}>
            <Link href={backHref} aria-label="Back to duels"><ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> <span>Duels</span></Link>
            <h1>Warfront{ctl.mode === 'practice' ? ' · Practice' : ''} vs {v.players[foe].name}</h1>
          </div>
          <div className={s.topActions}>
            <span className={`${g.layoutTag} readable-font`} title="Board and layout">{W}×{H} {layoutName}</span>
            <button type="button" className={`${s.iconBtn} ${s.drawerBtn}`} onClick={() => setDrawer(true)}><ScrollText size={16} /> Details</button>
            <button type="button" className={s.iconBtn} onClick={() => setRules(true)} aria-label="Rules"><CircleHelp size={16} /> <span className={s.counterWord}>Rules</span></button>
            {v.phase !== 'over' && (
              <button type="button" className={`${s.iconBtn} ${s.btnDanger}`} onClick={() => { if (confirm('Concede this game?')) void ctl.send({ type: 'concede' }); }} aria-label="Concede">
                <Flag size={15} /> <span className={s.counterWord}>Concede</span>
              </button>
            )}
          </div>
        </div>

        <div className={g.left}>
          <div className={g.foePanel}>{playerPanel(foe)}</div>
          <div className={g.infoPanel}>{info}</div>
          <div className={g.mePanel}>{playerPanel(me)}</div>
        </div>

        <div className={g.centre}>
          <div className={g.bar}>
            {narration ?? summary ?? (
              <>
                <span className={`${s.turnPill} ${canPlay ? s.turnPillMine : ''}`}>
                  <span>{v.phase === 'mulligan' ? 'Opening hands' : v.phase === 'over' ? 'Game over' : myTurn ? `Your turn · ${Math.ceil(v.turn / 2)}/${G.turnLimit}` : `Their turn · ${Math.ceil(v.turn / 2)}/${G.turnLimit}`}</span>
                  {clockText && v.phase !== 'over' && <span className={`${s.clock} ${deadlineLeft !== null && deadlineLeft <= 10 ? s.clockLow : ''}`}>{clockText}</span>}
                </span>
                {G.scoreTarget > 0 && v.phase !== 'mulligan' && (
                  <span className={`${g.scoreChip} readable-font`} title={`Territory score, you and ${v.players[foe].name}: first to ${G.scoreTarget} wins`}>
                    <Trophy size={14} aria-hidden />
                    <b className={g.scoreChipMine}>{liveConn[me].score}</b>
                    <span className={g.muted}>–</span>
                    <b className={g.scoreChipFoe}>{liveConn[foe].score}</b>
                    <span className={g.muted}>/ {G.scoreTarget}</span>
                    {G.objectiveEvery > 0 && (v.objective || v.nextObjective) && (
                      <span className={g.scoreChipObj} title={v.objective ? `Objective: ${v.objective.name}, +${G.objectiveBonus} a turn to its holder` : `Next objective: ${v.nextObjective!.name}, from turn ${Math.ceil(v.nextObjective!.from / 2)}`}>
                        <Target size={13} aria-hidden /> {v.objective ? v.objective.name : `${v.nextObjective!.name} next`}
                      </span>
                    )}
                  </span>
                )}
                <span className={`${s.hint} ${g.hint} readable-font`} role="status">{hint}</span>
              </>
            )}
          </div>

          <div className={g.boardWrap}>
            <div
              className={`${g.board} ${watching ? g.boardReplay : ''} ${W <= 5 ? g.board5 : ''}`}
              style={{ '--w': W, '--h': H } as CSSProperties}
              onMouseLeave={() => setHover(null)}
              onContextMenu={e => { if (sel) { e.preventDefault(); setSel(null); } }}
            >
              {displayTiles.map(tile)}
              {/* The connection chains run under the units; paths and arrows over them. */}
              <svg className={g.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
                {network(foe)}
                {network(me)}
              </svg>
              <div className={g.tokens}>
                {bv.units.map(u => token(u))}
                {fx.ghosts.map(u => token(u, true))}
              </div>
              <svg className={`${g.svg} ${g.svgTop}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
                <defs>
                  {['move', 'attack', 'pierce', 'strike', 'fire', 'effect', 'path'].map(k => (
                    <marker key={k} id={`gh-${k}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
                      <path d="M0,0 L10,5 L0,10 z" className={g[`head_${k}`]} />
                    </marker>
                  ))}
                </defs>
                {hoverMove && selUnit && <Mark m={{ kind: 'move', from: selUnit.tile, to: hoverMove.to, path: hoverMove.path }} o={o} cls={g.linePath} id="gh-path" />}
                {preview && selUnit && hover !== null && <Mark m={{ kind: 'attack', from: selUnit.tile, to: hover }} o={o} cls={g.line_attack} id="gh-attack" />}
                {marks.map((m, i) => (
                  <Mark key={`${step?.i}-${stage}-${i}`} m={m} o={o} cls={`${g[`line_${m.kind}`]} ${stage === 'cue' ? g.lineCue : ''}`} id={`gh-${m.kind}`} />
                ))}
              </svg>
              <div className={g.floats} aria-hidden>
                {fx.floats.map((f, i) => {
                  const [x, y] = dispXY(o, f.tile);
                  const stack = fx.floats.slice(0, i).filter(z => z.tile === f.tile).length;
                  return (
                    <span
                      key={f.id}
                      className={`${s.float} ${f.kind === 'dmg' ? s.floatDmg : f.kind === 'heal' ? s.floatHeal : s.floatInfo} ${g.float}`}
                      style={{ left: `${(100 * (x + 0.5)) / W}%`, top: `${(100 * (y + 0.42)) / H}%`, marginTop: `${stack * 1.6}em`, animationDelay: `${stack * 0.12}s` }}
                    >{f.text}</span>
                  );
                })}
              </div>
              {preview && hover !== null && selUnit && (() => {
                const [x, y] = dispXY(o, hover);
                const below = y < 2;
                return (
                  <div className={`${g.preview} ${below ? g.previewBelow : ''} readable-font`} style={{ left: `${(100 * (x + 0.5)) / W}%`, top: `${(100 * (below ? y + 1 : y)) / H}%` }} role="tooltip">
                    <PreviewLines p={preview} v={v} compact />
                  </div>
                );
              })()}
            </div>
          </div>

          <div className={g.strip}>
            {watching ? (
              <>
                {controls}
                <span className={g.stripRight}>
                  <button type="button" className={`${s.iconBtn} ${g.skip}`} onClick={rp.skip} title="Show the board as it is now"><SkipForward size={15} /> Skip</button>
                </span>
              </>
            ) : (
              <>
                {unitBar ?? (
                  <span className={`${g.stripInfo} readable-font`}>
                    {replay && rp.st.mode === 'off' && (
                      <button type="button" className={`${s.iconBtn} ${g.small}`} onClick={() => rp.watch(0)} title="Watch the last turn again">
                        <RotateCcw size={14} /> Replay turn
                      </button>
                    )}
                    {canPlay && <span className={g.orderCount}>Orders <Pips n={v.ordersLeft} of={Math.max(v.ordersLeft, ordersTotal)} label="orders left" /> <b>{v.ordersLeft}/{ordersTotal}</b></span>}
                    {canPlay && <span className={g.bankChip} title={`Emeralds (cap ${G.bankCap})`}><Gem size={14} /> {v.players[me].emeralds}</span>}
                    {canPlay && v.setback && <span className={g.bankChip} title="Your last turn cost you a node or HQ health: this turn you rally">Rally{G.setbackDiscount ? `: deploys ${G.setbackDiscount} cheaper` : ''}</span>}
                  </span>
                )}
                <span className={g.stripRight}>
                  <button
                    type="button"
                    className={`${s.endTurn} ${canPlay && !useful ? s.endTurnReady : ''}`}
                    disabled={!canPlay}
                    onClick={() => { setSel(null); act({ type: 'end_turn' }); }}
                    title={useful ? `${v.ordersLeft} order${v.ordersLeft === 1 ? '' : 's'} left` : undefined}
                  >
                    {v.phase === 'over' ? 'Game over' : myTurn ? 'End turn' : 'Their turn'}
                  </button>
                </span>
              </>
            )}
          </div>

          <div className={g.handRow}>
            <div className={s.handZone}>
              <div className={`${s.hand} ${g.hand}`} aria-label="Your hand" style={{ '--n': hand.length, '--gaps': Math.max(1, hand.length - 1) } as CSSProperties}>
                {hand.map((h, i) => {
                  const d = card(h.slug);
                  const off = i - (hand.length - 1) / 2;
                  const opt = deploys.find(x => x.uid === h.uid);
                  const ok = canPlay && !!opt?.affordable && opt.tiles.length > 0;
                  const on = !!sel && (sel.k === 'deploy' || sel.k === 'deployTarget') && sel.uid === h.uid;
                  return (
                    <div key={h.uid} className={`${s.handSlot} ${on ? g.handOn : ''}`} style={{ '--rot': `${off * 2.5}deg`, '--y': `${Math.abs(off) ** 1.8 * 2}px`, '--z': i + 1 } as CSSProperties}>
                      <CardFace
                        def={d}
                        selected={on}
                        playable={ok && !sel}
                        dim={canPlay && !ok}
                        onClick={() => clickHand(h.uid, h.slug)}
                        onHover={() => setFocus({ slug: h.slug })}
                        title={canPlay && !ok ? (opt && !opt.affordable ? 'Not enough emeralds' : 'No free deploy tile') : undefined}
                      />
                    </div>
                  );
                })}
                {!hand.length && <span className={s.handEmpty}>No cards in hand</span>}
              </div>
            </div>
          </div>

          {ctl.error && (
            <div className={`${s.errorToast} readable-font`} role="alert">
              {ctl.error}
              <button type="button" className={s.coachClose} style={{ color: 'var(--d-err-ink)' }} onClick={ctl.clearError} aria-label="Dismiss"><X size={16} /></button>
            </div>
          )}
        </div>

        <aside className={`${s.side} ${g.side} ${drawer ? s.sideOpen : ''}`} aria-label="Card detail and game log">
          <div className={`${s.sidePanel} ${s.detail} ${g.detail}`}>
            {drawer && (
              <button type="button" className={s.coachClose} style={{ alignSelf: 'flex-end', color: 'var(--d-ink-2)' }} onClick={() => setDrawer(false)} aria-label="Close"><X size={18} /></button>
            )}
            {focusDef ? <CardFace def={focusDef} large /> : <div className={`${s.detailEmpty} readable-font`}>Hover a unit or a card to read it here.</div>}
            {focusDef && focusMove && (
              <p className={`${s.detailNote} readable-font`}>
                <Footprints size={13} style={{ verticalAlign: '-2px' }} /> {focusMove.speed.charAt(0).toUpperCase() + focusMove.speed.slice(1)}: {focusMove.text}
                {focusUnit && <><br />{focusUnit.side === me ? 'Yours' : 'Enemy'} · {Math.max(0, focusUnit.health)}/{focusUnit.maxHealth} health · {focusUnit.power + focusUnit.boost} power{focusUnit.boost ? ` (+${focusUnit.boost} ore)` : ''}
                  {isBraced(bv, focusUnit) ? ' · braced' : ''}{isFrozen(bv, focusUnit) ? ' · frozen' : ''}{focusUnit.stealth ? ' · hidden' : ''}{focusUnit.shield ? ' · shielded' : ''}</>}
              </p>
            )}
          </div>
          <div className={`${s.sidePanel} ${s.logPanel}`}>
            <div className={s.logTitle}>
              <span className={g.tabs} role="tablist">
                {replay && (
                  <button type="button" role="tab" aria-selected={logTab === 'recap'} className={`${g.tab} ${logTab === 'recap' ? g.tabOn : ''}`} onClick={() => setLogTab('recap')}>Turn recap</button>
                )}
                <button type="button" role="tab" aria-selected={logTab === 'log' || !replay} className={`${g.tab} ${logTab === 'log' || !replay ? g.tabOn : ''}`} onClick={() => setLogTab('log')}>Log</button>
              </span>
              <span className={s.clock} style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>Turn {Math.max(1, Math.ceil(v.turn / 2))} of {G.turnLimit}</span>
            </div>
            {replay && logTab === 'recap' ? (
              <div className={`${g.recap} readable-font`}>
                {tally && (
                  <div className={g.recapTally}>
                    <span>Your HQ: <em className={tally.hqTaken ? g.bad : ''}>−{tally.hqTaken}</em>{tally.hqDealt > 0 && <> · theirs <em className={g.good}>−{tally.hqDealt}</em></>}</span>
                    <span>Units: <em className={tally.lost ? g.bad : ''}>{tally.lost} lost</em> · <em className={tally.killed ? g.good : ''}>{tally.killed} destroyed</em></span>
                    <span>Connected nodes: you {tally.mine} · them {tally.theirs}</span>
                    {tally.target > 0 && <span>Score: you <em className={tally.scoredMine ? g.good : ''}>{tally.scoreMine}</em> · them <em className={tally.scoredTheirs ? g.bad : ''}>{tally.scoreTheirs}</em> of {tally.target}</span>}
                  </div>
                )}
                <ol className={g.recapList}>
                  {recapSteps.map(x => (
                    <li key={x.i}>
                      <button
                        type="button"
                        className={`${g.recapItem} ${x.side === me ? g.recapMine : x.side === foe ? g.recapFoe : ''} ${watching && rp.st.idx === x.i ? g.recapOn : ''}`}
                        onClick={() => { rp.watch(x.i, false); setDrawer(false); }}
                        title="Show this step on the board"
                      >
                        <span className={g.recapKind}>{RECAP_KIND[x.kind]}</span>
                        <span>{x.recap}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <div className={g.recapFoot}>
                  <button type="button" className={g.linkBtn} onClick={() => setRecapAll(a => !a)}>{recapAll ? 'Hide routine steps' : 'Show every step'}</button>
                  <button type="button" className={g.linkBtn} onClick={() => { rp.watch(0); setDrawer(false); }}><RotateCcw size={13} /> Replay turn</button>
                </div>
              </div>
            ) : (
              <LogList lines={lines} me={me} />
            )}
          </div>
        </aside>

        {needsMulligan && (
          <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Opening hand">
            <div className={s.dialog}>
              <h2>Your opening hand</h2>
              <p className={`${s.muted} readable-font`}>
                {v.first === me
                  ? `You play first: ${G.firstOrders} orders on turn 1, and no draw.`
                  : `${v.players[foe].name} plays first. You start with ${G.startEmeralds + G.secondBonus} emerald${G.startEmeralds + G.secondBonus === 1 ? '' : 's'}.`}
                {' '}Board: {W}×{H} {layoutName}. Click any card to swap it for a new one.
              </p>
              <div className={s.dialogCards}>
                {hand.map(h => (
                  <div key={h.uid} className={`${s.replaceWrap} ${replace.has(h.uid) ? s.replace : ''}`}>
                    <CardFace
                      def={card(h.slug)}
                      onClick={() => setReplace(r => {
                        const n = new Set(r);
                        if (n.has(h.uid)) n.delete(h.uid); else n.add(h.uid);
                        return n;
                      })}
                    />
                    {replace.has(h.uid) && <span className={s.replaceTag}>Replace</span>}
                  </div>
                ))}
              </div>
              <button type="button" className={s.endTurn} disabled={ctl.pending} onClick={() => void ctl.send({ type: 'mulligan', replace: [...replace] })}>
                {replace.size ? `Replace ${replace.size} and start` : 'Keep hand'}
              </button>
            </div>
          </div>
        )}

        {v.phase === 'mulligan' && v.players[me].mulliganed && (
          <div className={s.overlay}>
            <div className={s.dialog}><p>Waiting for {v.players[foe].name} to choose their opening hand...</p></div>
          </div>
        )}

        {result && !resultSeen && rp.st.mode === 'off' && (
          <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Result">
            <div className={s.dialog} style={{ width: 'min(540px, 100%)', overflowX: 'hidden' }}>
              <div className={`${s.result} ${result !== 'Victory' ? s.resultDefeat : ''}`}>{result}</div>
              <p className={`${s.muted} readable-font`}>
                {v.endReason === 'hq' ? (v.winner === me ? `You destroyed ${v.players[foe].name}'s HQ.` : v.winner === foe ? 'Your HQ was destroyed.' : 'Both HQs fell together.')
                  : v.endReason === 'score' ? (v.winner === me ? `You reached ${G.scoreTarget} points.` : `${v.players[foe].name} reached ${G.scoreTarget} points.`)
                  : v.endReason === 'turn_limit' ? `The turn limit (${G.turnLimit} turns each): decided on ${G.scoreTarget > 0 ? 'score' : 'connected nodes'}, then HQ health.`
                    : v.endReason === 'concede' ? (v.winner === me ? `${v.players[foe].name} conceded.` : 'You conceded.')
                      : v.endReason === 'timeout' ? 'Decided on time.' : ''}
                {' '}{G.scoreTarget > 0 && <>Score: you {liveConn[me].score}, {v.players[foe].name} {liveConn[foe].score}. </>}Connected nodes: you {liveConn[me].nodes.length}, {v.players[foe].name} {liveConn[foe].nodes.length}. HQ health: you {Math.max(0, v.players[me].hp)}, {v.players[foe].name} {Math.max(0, v.players[foe].hp)}.
              </p>
              <div className={s.row} style={{ justifyContent: 'center' }}>
                <Link href={backHref} className={`${s.btn} ${s.btnPrimary}`}>Back to duels</Link>
                {replay && <button type="button" className={s.btn} onClick={() => { setResultSeen(true); rp.watch(0); }}><RotateCcw size={15} /> Replay last turn</button>}
                <button type="button" className={s.btn} onClick={() => setResultSeen(true)}>View board</button>
              </div>
            </div>
          </div>
        )}

        {rules && (
          <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Rules" onClick={() => setRules(false)}>
            <div className={`${s.dialog} ${s.rulesSheet}`} onClick={e => e.stopPropagation()}>
              <div className={s.row} style={{ justifyContent: 'space-between', width: '100%' }}>
                <h2>How Warfront works</h2>
                <button type="button" className={s.coachClose} style={{ color: 'var(--d-ink-2)' }} onClick={() => setRules(false)} aria-label="Close"><X size={20} /></button>
              </div>
              <QuickGridRules />
              <Link href="/duels?tab=guide&guide=grid" className={s.btn} target="_blank">Open the full guide</Link>
            </div>
          </div>
        )}
      </div>
    </CardRulesProvider>
  );
}

function NodeInfo({ g, node, me, connected, foeName, v }: { g: GridConfig; node: GridNode; me: Side; connected: boolean; foeName: string; v: GridView }) {
  const objective = g.objectiveEvery > 0 && v.objective?.tile === node.tile;
  const next = g.objectiveEvery > 0 && v.nextObjective?.tile === node.tile;
  const mine = nodeValue(g, node, me, v);
  const theirs = nodeValue(g, node, other(me), v);
  return (
    <p>
      <b>{node.name}</b>{node.city ? ' (city)' : ''}{node.resource ? ` · ${RESOURCE_NAME[node.resource]}` : ''}.{' '}
      {node.owner === null ? `Unclaimed: end your turn on it${g.claimAdjacent ? '' : ' with no enemy next to it'} to claim it.`
        : `${node.owner === me ? 'Yours' : `${foeName}'s`}, ${connected ? 'connected' : 'not connected (the chain to the HQ is cut)'}.`}
      {' '}While connected: {nodeGivesText(node, g)}.
      {g.scoreTarget > 0 && <> It scores {mine} a turn for you{theirs !== mine ? ` and ${theirs} for ${foeName}` : ''}{objective || next ? ', plus the objective bonus while it is the objective' : ''}.</>}
      {objective && <> <b>Objective</b> through turn {Math.ceil(v.objective!.until / 2)}: +{g.objectiveBonus} a turn to its holder.</>}
      {next && !objective && <> <b>Next objective</b> from turn {Math.ceil(v.nextObjective!.from / 2)}: +{g.objectiveBonus} a turn to its holder.</>}
    </p>
  );
}

/** A node's base score for a side (city, its half), without the objective bonus. */
function nodeValue(g: GridConfig, node: GridNode, side: Side, v: GridView): number {
  return nodeScore({ ...v, cfg: g, objective: null }, node, side).n;
}

function PreviewLines({ p, v, compact }: { p: AttackPreview; v: GridView; compact?: boolean }) {
  const hitName = p.pierce ? (() => {
    const u = unitAt(v, p.pierce.tile);
    return u ? 'the unit behind' : 'the HQ behind';
  })() : '';
  return (
    <span className={`${g.pvLines} ${compact ? g.pvCompact : ''}`}>
      <span className={g.pvDmg}><Swords size="1em" aria-hidden /> {p.damage} damage{p.kills ? <em className={g.pvKill}> · destroys it</em> : ''}</span>
      {p.flank > 0 && <span>+{p.flank} flanking</span>}
      {p.armour > 0 && <span>Armour soaks {p.armour}</span>}
      {p.strikeBack > 0 ? <span className={g.bad}>Strike-back: you take {p.strikeBack}</span> : !p.kills && <span className={g.muted}>No strike-back</span>}
      {p.pierce && <span>Pierce: {p.pierce.damage} to {hitName}</span>}
    </span>
  );
}

function LogList({ lines, me: _me }: { lines: { text: string; head?: boolean; side?: Side; fresh: boolean }[]; me: Side }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => { if (el) el.scrollTop = el.scrollHeight; }, [el, lines.length]);
  return (
    <div ref={setEl} className={`${s.log} readable-font`}>
      {lines.slice(-250).map((l, i) => (
        <div key={i} className={l.head ? s.logTurn : `${s.logLine} ${l.side === _me ? s.logMine : l.side !== undefined ? s.logFoe : ''} ${l.fresh ? s.logFresh : ''}`}>{l.text}</div>
      ))}
    </div>
  );
}
