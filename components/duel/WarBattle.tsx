'use client';

import Link from 'next/link';
import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode,
} from 'react';
import {
  ArrowLeft, ArrowLeftRight, Bot, Castle, ChevronLeft, ChevronRight, CircleHelp, Eye, Flag, Gem, Lock, Pause, Play,
  RotateCcw, ScrollText, Shield, ShieldCheck, SkipForward, Sparkles, Swords, X,
} from 'lucide-react';
import type { WarController } from '@/hooks/useWar';
import { abilityText, ELEMENT_INFO } from '@/lib/duel/text';
import type { Ability, CardDef, Unit } from '@/lib/duel/types';
import {
  canOrder, defOf, emeraldCost, frontHolder, hqAbility, LANES, moveCost, moveOf, orderOptions, other, planCost, playOf,
  reachOf, specSlots, towerAlive, validatePlan, WAR, warBraceText, warStanceText, warHealth, warKeywordText, warShiftText, warSpeed, warSwitchText,
  type Lane, type Order, type Plan, type Resource, type Side, type SlotRef, type Territory, type WarEvent,
  type WarPlayerView, type WarUnit, type WarView,
} from '@/lib/duel/war/client';
import CardFace, { CardBack, CardRulesProvider, SPEED_NAME, UnitTile, type CardRules } from './CardFace';
import { QuickWarRules } from './WarGuide';
import { LANE_NAME, ORDINAL, PERK_ICON, perkText, WAR_CARD_RULES } from './warShared';
import { describe, type Line, type ReplayStep, type Spot } from './warReplay';
import { useWarReplay, type ReplaySpeed, type Stage } from './useWarReplay';
import s from './duel.module.css';
import w from './war.module.css';

/** A war unit as the shared unit tile reads it. */
function tileUnit(u: WarUnit): Unit {
  return {
    uid: u.uid, slug: u.slug, power: u.power + u.boost, health: u.health, maxHealth: u.maxHealth,
    keywords: u.keywords, ready: true, shield: u.shield, stealth: u.stealth, frozenUntil: -1,
  };
}

function newUnitTile(def: CardDef, uid: string): Unit {
  const health = warHealth(def);
  return {
    uid, slug: def.slug, power: Math.round(def.power * WAR.powerMult), health, maxHealth: health, keywords: def.keywords,
    ready: true, shield: def.keywords.includes('shield'), stealth: def.keywords.includes('stealth'), frozenUntil: -1,
  };
}

const EMPTY_PLAN: Plan = { orders: [null, null, null], deploys: [], hq: null };
const slotKey = (r: SlotRef) => `${r.side}-${r.lane}`;
const sameSlot = (a: SlotRef | undefined, b: SlotRef) => !!a && a.side === b.side && a.lane === b.lane;

type Pick =
  | { k: 'menu'; lane: Lane }
  | { k: 'attack'; lane: Lane }
  | { k: 'move'; lane: Lane }
  | { k: 'moveAttack'; lane: Lane; target?: SlotRef }
  /** A shift that may also attack (WAR.shiftAttack): pick the attack from the new lane. */
  | { k: 'shiftAttack'; lane: Lane; dir: -1 | 1 }
  | { k: 'switch'; lane: Lane }
  | { k: 'deploy'; uid: string }
  | { k: 'deployTarget'; uid: string; to: Lane | 'garrison' }
  | { k: 'hq' }
  | null;

// --- Reveal effects ---------------------------------------------------------------
//
// The reveal itself (which board, which step) lives in useWarReplay and
// warReplay.ts. What a step looks like on the board is derived here from the
// step and its stage alone: no timers, so pausing, stepping back or jumping
// always shows the same thing. Keys include the step, so an animation plays
// again whenever its step is shown again.

interface Float { id: string; key: string; text: string; kind: 'dmg' | 'heal' | 'info' }
interface Ghost { side: Side; lane: Lane; unit: WarUnit }
interface Fx { anim: Record<string, string[]>; floats: Float[]; ghosts: Ghost[] }

const NO_FX: Fx = { anim: {}, floats: [], ghosts: [] };
const SPEED_LABEL: Record<ReplaySpeed, string> = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };
const ACTOR_DONE: Record<ReplayStep['kind'], string> = {
  stance: 'Braced', switch: 'Switched in', shift: 'Shifted', deploy: 'Deployed', action: 'Acted', counter: 'Struck back', upkeep: '', end: '',
};
const RECAP_KIND: Record<ReplayStep['kind'], string> = {
  stance: 'Brace', switch: 'Switch', shift: 'Shift', deploy: 'Deploy', action: 'Action', counter: 'Strike back', upkeep: 'Upkeep', end: 'End',
};
const PERK_FLOAT: Record<Resource | 'city', () => string> = {
  city: () => `+${WAR.perk.city} emerald`, ore: () => `+${WAR.perk.ore} power`, crops: () => `Heal ${WAR.perk.crops}`,
  fish: () => `Draw ${WAR.perk.fish}`, wood: () => `Repair ${WAR.perk.wood}`,
};

function stepFx(step: ReplayStep | null, stage: Stage, tick: number, me: Side, still: boolean): Fx {
  if (!step || stage !== 'hit') return NO_FX;
  const anim: Record<string, string[]> = {};
  const floats: Float[] = [];
  const ghosts: Ghost[] = [];
  const add = (k: string, cls: string) => { if (!still) (anim[k] ??= []).push(cls); };
  const float = (k: string, text: string, kind: Float['kind']) => floats.push({ id: `${tick}-${floats.length}`, key: k, text, kind });
  const slotK = (r: SlotRef) => `slot-${r.side}-${r.lane}`;
  const towerK = (r: SlotRef) => `tower-${r.side}-${r.lane}`;
  for (const e of step.events) {
    switch (e.k) {
      case 'brace': add(`unit-${e.uid}`, s.fxCast); float(`unit-${e.uid}`, 'Brace', 'info'); break;
      case 'switch':
        add(`unit-${e.in}`, e.side === me ? w.fxSwitchUp : w.fxSwitchDown);
        float(slotK({ side: e.side, lane: e.lane }), 'Switch', 'info');
        break;
      case 'shift': {
        const mover = step.after.players[e.side].active[e.to];
        const bumped = step.after.players[e.side].active[e.from];
        if (mover) add(`unit-${mover.uid}`, e.to > e.from ? w.fxSlideFromLeft : w.fxSlideFromRight);
        if (bumped) add(`unit-${bumped.uid}`, e.to > e.from ? w.fxSlideFromRight : w.fxSlideFromLeft);
        break;
      }
      case 'deploy': add(`unit-${e.uid}`, s.fxSummon); break;
      case 'attack':
        if (e === step.events[0]) add(`unit-${e.uid}`, s.fxLunge);
        if (e.redirected && e.aimed) float(slotK(e.aimed), 'Guarded', 'info');
        if (e.hit === 'fizzle') float(slotK(e.target), 'Miss', 'info');
        else if (e.swapped && e.hit === 'unit') float(slotK(e.target), 'Caught!', 'info');
        break;
      case 'counter': add(`unit-${e.uid}`, s.fxLunge); float(`unit-${e.uid}`, 'Strike back', 'info'); break;
      case 'move': add(`unit-${e.uid}`, s.fxCast); float(`unit-${e.uid}`, e.name, 'info'); break;
      case 'hq': add(`hq-${e.side}`, s.fxCast); float(`hq-${e.side}`, e.name, 'info'); break;
      case 'damage': {
        const k = e.tower ? towerK(e.target) : slotK(e.target);
        float(k, `-${e.n}${e.braced ? ' braced' : ''}`, 'dmg');
        add(k, s.fxHit);
        break;
      }
      case 'heal': {
        const k = e.tower ? towerK(e.target) : slotK(e.target);
        float(k, `+${e.n}`, 'heal');
        add(k, s.fxHeal);
        break;
      }
      case 'shield': float(`unit-${e.uid}`, 'Shield broken', 'info'); break;
      case 'freeze': add(`unit-${e.uid}`, s.fxFreeze); break;
      case 'perk': add(`lane-${e.lane}`, w.fxPerk); float(`lane-${e.lane}`, PERK_FLOAT[e.perk](), 'heal'); break;
      case 'income': if (e.side === me) float(`bank-${e.side}`, `+${e.n}`, 'heal'); break;
      case 'bounty': float(`bank-${e.side}`, `+${e.n}`, 'heal'); break;
      case 'tower': add(towerK({ side: e.side, lane: e.lane }), w.fxTowerFall); float(towerK({ side: e.side, lane: e.lane }), 'Tower down!', 'info'); break;
      case 'rebuild': add(towerK({ side: e.side, lane: e.lane }), s.fxHeal); float(towerK({ side: e.side, lane: e.lane }), 'Rebuilt', 'heal'); break;
      case 'death': {
        const u = step.before.players[e.side].active[e.lane];
        if (u?.uid === e.uid && !step.after.players[e.side].active[e.lane]) {
          const hp = [...step.events].reverse().find((x): x is Extract<WarEvent, { k: 'damage' }> => x.k === 'damage' && x.uid === e.uid)?.hp;
          ghosts.push({ side: e.side, lane: e.lane, unit: { ...u, health: Math.max(0, hp ?? 0) } });
        }
        break;
      }
    }
  }
  return { anim, floats, ghosts };
}

function Floats({ fx, k }: { fx: Fx; k: string }) {
  const list = fx.floats.filter(f => f.key === k);
  if (!list.length) return null;
  return (
    <>
      {list.map(f => (
        <span key={f.id} className={`${s.float} ${f.kind === 'dmg' ? s.floatDmg : f.kind === 'heal' ? s.floatHeal : s.floatInfo}`}>{f.text}</span>
      ))}
    </>
  );
}

// --- Small pieces -----------------------------------------------------------------

function Avatar({ uuid }: { uuid: string }) {
  if (!uuid) return <span className={s.botFace}><Bot size="55%" /></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://mc-heads.net/avatar/${uuid}/96`} alt="" draggable={false} />;
}

function Bank({ n, spend, fxKey, fx }: { n: number; spend?: number; fxKey: string; fx: Fx }) {
  const left = n - (spend ?? 0);
  return (
    <span className={`${w.bank} ${spend && left < 0 ? w.bankOver : ''}`} data-fx={fxKey} title={`${n} of ${WAR.bankCap} emeralds banked`}>
      <Gem size={16} aria-hidden />
      <b>{spend ? left : n}</b>
      <span className={w.bankCap}>{spend ? `of ${n}` : `/${WAR.bankCap}`}</span>
      <Floats fx={fx} k={fxKey} />
    </span>
  );
}

function Tower({ hp, side, lane, mine, fx, cls }: { hp: number; side: Side; lane: Lane; mine: boolean; fx: Fx; cls: string }) {
  const down = hp <= 0;
  const k = `tower-${side}-${lane}`;
  return (
    <div
      className={`${w.tower} ${mine ? w.towerMine : w.towerFoe} ${down ? w.towerDown : ''} ${cls}`}
      data-fx={k}
      aria-label={`${mine ? 'Your' : 'Enemy'} ${LANE_NAME[lane].toLowerCase()} tower: ${down ? 'destroyed' : `${hp} of ${WAR.towerHp} health`}`}
    >
      <Castle size={15} aria-hidden />
      {down ? <span className={w.towerRubble}>Destroyed</span> : (
        <span className={w.towerPips} aria-hidden>
          {Array.from({ length: WAR.towerHp }, (_, i) => <span key={i} className={i < hp ? w.pipOn : ''} />)}
        </span>
      )}
      {!down && <b className={w.towerHp}>{hp}</b>}
      <Floats fx={fx} k={k} />
    </div>
  );
}

function orderBadge(o: Order | null, rank: string | null, idle: boolean): ReactNode {
  if (!o) return idle ? <span className={`${w.orderBadge} ${w.orderIdle}`}>Idle</span> : null;
  const map: Record<Order['k'], [typeof Swords, string, string]> = {
    attack: [Swords, 'Attack', w.orderAttack],
    move: [Sparkles, 'Move', w.orderMove],
    brace: [Shield, 'Brace', w.orderBrace],
    switch: [ArrowLeftRight, 'Switch', w.orderSwap],
    shift: [ArrowLeftRight, 'Shift', w.orderSwap],
  };
  const [Icon, label, cls] = map[o.k];
  const where = o.k === 'attack' ? ` ${LANE_NAME[o.target.lane].charAt(0)}` : o.k === 'shift' ? `${o.dir < 0 ? ' ←' : ' →'}${o.attack ? ` + ${LANE_NAME[o.attack.lane].charAt(0)}` : ''}` : '';
  return (
    <span className={`${w.orderBadge} ${cls}`}>
      <Icon size="1em" aria-hidden /> {label}{where}{rank ? <em> · {rank}</em> : null}
    </span>
  );
}

// --- The board ----------------------------------------------------------------------

export default function WarBattle({ ctl, backHref = '/duels' }: { ctl: WarController; backHref?: string }) {
  const v = ctl.view;
  const card = useMemo(() => (slug: string) => defOf(slug, v?.extraDefs), [v?.extraDefs]);
  const rp = useWarReplay(v, card);
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);
  const [pick, setPick] = useState<Pick>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [replace, setReplace] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState(false);
  const [rules, setRules] = useState(false);
  const [confirmIdle, setConfirmIdle] = useState(false);
  const [resultSeen, setResultSeen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [logTab, setLogTab] = useState<'recap' | 'log'>('log');
  const [recapAll, setRecapAll] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const tableRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<{ d: string; cls: string; key: string }[]>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // A fresh plan each round; a locked plan shows as it was sent.
  const roundKey = v ? `${v.phase}-${v.round}` : '';
  useEffect(() => {
    setPlan(v?.players[v.you].plan ?? EMPTY_PLAN);
    setPick(null);
    setConfirmIdle(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPick(null);
      setRules(false);
      setDrawer(false);
      setConfirmIdle(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const logLen = v ? v.logBase + v.log.length : 0;
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logLen]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    if (!v) return m;
    for (const e of v.log) if ('uid' in e && 'slug' in e) m.set(e.uid, card(e.slug).name);
    for (const p of v.players) for (const u of [...p.active, ...p.garrison]) if (u) m.set(u.uid, card(u.slug).name);
    for (const h of v.players[v.you].hand ?? []) m.set(h.uid, card(h.slug).name);
    return m;
  }, [v, card]);

  // --- The reveal: which board to draw ---
  const step = rp.step;
  const stage = rp.st.stage;
  const watching = rp.st.mode === 'board' && !!step;
  const rebuilt = rp.st.replay?.ok ?? true;
  // The rebuilt board at this step; if the rebuild went wrong, the server's.
  const bv: WarView | null = v && watching && step && rebuilt ? (stage === 'hit' ? step.after : step.before) : v;

  // --- Order arrows: measured from the slots, so they follow any layout ---
  const measure = useCallback(() => {
    const table = tableRef.current;
    if (!table || !v) return setArrows([]);
    const base = table.getBoundingClientRect();
    if (watching && step) {
      // The step's line: who acts on whom.
      const line: Line | undefined = stage === 'hit' ? step.hitLine : step.cueLine;
      const sel = (x: Spot) => (x.k === 'slot' ? `[data-slot="${x.side}-${x.lane}"]` : x.k === 'tower' ? `[data-fx="tower-${x.side}-${x.lane}"]`
        : x.k === 'garrison' ? `[data-garrison="${x.side}-${x.g}"]` : `[data-hq="${x.side === v.you ? 'mine' : 'theirs'}"]`);
      const box = (x: Spot) => {
        const el = table.querySelector<HTMLElement>(sel(x));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top, h: r.height, w: r.width };
      };
      const a = line && box(line.from);
      const b = line && box(line.to);
      if (!line || !a || !b) return setArrows([]);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const inset = (bx: typeof a, k: number) => Math.min(bx.h, bx.w) * k;
      const p0 = { x: a.x + (dx / len) * inset(a, 0.3), y: a.y + (dy / len) * inset(a, 0.3) };
      const p1 = { x: b.x - (dx / len) * inset(b, 0.32), y: b.y - (dy / len) * inset(b, 0.32) };
      const bend = line.kind === 'swap' ? 0.35 : 0.18;
      const mx = (p0.x + p1.x) / 2 + (p1.y - p0.y) * bend * 0.3;
      const my = (p0.y + p1.y) / 2 - Math.abs(p1.x - p0.x) * bend * 0.4;
      const cls = line.kind === 'attack' ? w.arrowAttack : line.kind === 'move' ? w.arrowMove : w.arrowSwap;
      const d = `M${p0.x.toFixed(1)},${p0.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
      return setArrows([{ d, cls: `${cls} ${w.arrowReplay}`, key: `r${step.i}-${stage}` }]);
    }
    // Orders only mean something while a round is being planned.
    if (v.phase !== 'plan') return setArrows([]);
    const centre = (sel: string) => {
      const el = table.querySelector<HTMLElement>(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top, h: r.height, w: r.width };
    };
    const me = v.you;
    const out: { d: string; cls: string; key: string }[] = [];
    const curve = (a: { x: number; y: number }, b: { x: number; y: number }, bend = 0.25) => {
      const mx = (a.x + b.x) / 2 + (b.y - a.y) * bend * 0.3;
      const my = (a.y + b.y) / 2 - Math.abs(b.x - a.x) * bend * 0.4;
      return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    };
    plan.orders.forEach((o, i) => {
      if (!o) return;
      const lane = i as Lane;
      const from = centre(`[data-slot="${me}-${lane}"]`);
      if (!from) return;
      const start = { x: from.x, y: from.y - from.h * 0.42 };
      const aim = (t: SlotRef, cls: string, key: string) => {
        const to = centre(`[data-slot="${t.side}-${t.lane}"]`);
        if (!to) return;
        const end = t.side === me ? { x: to.x, y: to.y - to.h * 0.42 } : { x: to.x, y: to.y + to.h * 0.3 };
        out.push({ d: curve(start, end), cls, key });
      };
      if (o.k === 'attack') aim(o.target, w.arrowAttack, `a${lane}`);
      if (o.k === 'move') {
        if (o.target) aim(o.target, w.arrowMove, `m${lane}`);
        if (o.attack) aim(o.attack, w.arrowAttack, `ma${lane}`);
      }
      if (o.k === 'shift') {
        const to = centre(`[data-slot="${me}-${lane + o.dir}"]`);
        if (to) out.push({ d: curve({ x: from.x + (o.dir * from.w) / 4, y: from.y }, { x: to.x - (o.dir * to.w) / 4, y: to.y }, 0.4), cls: w.arrowSwap, key: `s${lane}` });
        if (o.attack) aim(o.attack, w.arrowAttack, `sa${lane}`);
      }
      if (o.k === 'switch') {
        const g = centre(`[data-garrison="${me}-${o.garrison}"]`);
        if (g) out.push({ d: curve({ x: g.x, y: g.y - g.h / 2 }, { x: from.x, y: from.y + from.h * 0.45 }, 0.1), cls: w.arrowSwap, key: `w${lane}` });
      }
    });
    if (plan.hq?.target) {
      const from = centre('[data-hq="mine"]');
      const to = centre(`[data-slot="${plan.hq.target.side}-${plan.hq.target.lane}"]`);
      if (from && to) out.push({ d: curve(from, to), cls: w.arrowMove, key: 'hq' });
    }
    setArrows(out);
  }, [plan, v, watching, step, stage]);

  useLayoutEffect(() => { measure(); }, [measure, pick, focus]);
  useEffect(() => {
    const table = tableRef.current;
    if (!table || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(table);
    return () => ro.disconnect();
  }, [measure]);

  // --- The reveal on the board: effects, the lunge, keys ---
  const fx = useMemo(
    () => (watching && v ? stepFx(step, stage, rp.st.tick, v.you, rp.reduce) : NO_FX),
    [watching, step, stage, rp.st.tick, rp.reduce, v],
  );
  useLayoutEffect(() => {
    if (!watching || !step || stage !== 'hit' || rp.reduce) return;
    const h = step.events[0];
    const lunge = h.k === 'attack' ? { uid: h.uid, to: h.target } : h.k === 'counter' ? { uid: h.uid, to: h.target } : null;
    if (!lunge) return;
    const a = document.querySelector<HTMLElement>(`[data-fx="unit-${lunge.uid}"]`);
    const b = document.querySelector<HTMLElement>(`[data-fx="${h.k === 'attack' && h.hit === 'tower' ? 'tower' : 'slot'}-${lunge.to.side}-${lunge.to.lane}"]`);
    if (!a || !b) return;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    // The lunge keyframes travel most of this vector (duel.module.css), then return.
    a.style.setProperty('--dx', `${(rb.left + rb.width / 2 - (ra.left + ra.width / 2))}px`);
    a.style.setProperty('--dy', `${(rb.top + rb.height / 2 - (ra.top + ra.height / 2))}px`);
  }, [watching, step, stage, rp.st.tick, rp.reduce]);
  useEffect(() => {
    if (rp.st.mode === 'off') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); rp.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); rp.back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rp.st.mode, rp.next, rp.back]);
  // A new round's reveal opens the recap tab.
  const replayId = rp.st.replay?.id;
  useEffect(() => { if (replayId !== undefined) setLogTab('recap'); }, [replayId]);

  if (!v || !bv) {
    return (
      <div className={s.battle}>
        <div className={s.topBar}><div className={s.topTitle}><Link href={backHref}><ArrowLeft size={14} /> Duels</Link></div></div>
        <div className={s.table} style={{ display: 'grid', placeItems: 'center' }}>
          <p style={{ color: 'var(--d-ink-2)' }}>{ctl.error ?? 'Drawing the battle lines...'}</p>
        </div>
      </div>
    );
  }

  const me = v.you;
  const foe = other(me);
  const mine = v.players[me];
  const theirs = v.players[foe];
  const st = v;
  const hand = mine.hand ?? [];
  const locked = mine.planned;
  // Planning is never blocked by the reveal: "Plan now" puts it in the corner.
  const planning = v.phase === 'plan' && !locked && !ctl.pending && !watching;
  // What the board shows: the live view, or the rebuilt one during the reveal.
  const bMine = bv.players[me];
  const bTheirs = bv.players[foe];
  const bHand = watching ? bMine.hand ?? [] : hand;
  const actorUid = watching && step ? step.actor : undefined;
  const aimNow = watching && step ? (stage === 'hit' ? step.hitAim : step.aim) : [];
  const isAimed = (side: Side, lane: Lane) => aimNow.some(r => r.side === side && r.lane === lane);
  const hq = hqAbility(mine);
  const cost = planCost(st, me, plan);
  const left = mine.emeralds - cost;

  // --- What the current pick can reach ---
  const slotTargets = new Map<string, string>();
  const garrisonTargets = new Set<number>();
  let garrisonDeploy = false;
  let pickHint = '';
  if (pick && planning) {
    const u = 'lane' in pick ? mine.active[pick.lane] : null;
    const reachHint = (t: SlotRef, lane: Lane) => {
      const occ = v.players[t.side].active[t.lane];
      if (occ?.stealth) return 'Hidden: miss';
      if (occ) return 'Attack';
      if (t.lane === lane) return towerAlive(v.players[t.side], t.lane) ? 'Hit tower' : 'Tower down';
      return 'Empty now';
    };
    if (pick.k === 'attack' || pick.k === 'moveAttack') {
      for (const o of orderOptions(st, me, pick.lane)) if (o.k === 'attack') slotTargets.set(slotKey(o.target), reachHint(o.target, pick.lane));
      pickHint = pick.k === 'attack' ? `Choose where ${u ? card(u.slug).name : 'it'} attacks. Attacks hit whoever stands there when it acts.` : 'Also attack? Choose a slot, or skip.';
    } else if (pick.k === 'shiftAttack' && u) {
      const to = (pick.lane + pick.dir) as Lane;
      for (const l of reachOf(to, u.keywords.includes('ranged'))) slotTargets.set(slotKey({ side: other(me), lane: l }), reachHint({ side: other(me), lane: l }, to));
      pickHint = `Also attack from the ${LANE_NAME[to].toLowerCase()}? Choose a slot, or skip.`;
    } else if (pick.k === 'move' && u) {
      const m = moveOf(card(u.slug));
      if (m?.target) for (const t of specSlots(st, me, m.target, u.uid)) slotTargets.set(slotKey(t), m.name ?? 'Move');
      pickHint = `Choose a target for ${m?.name ?? 'its move'}.`;
    } else if (pick.k === 'switch') {
      mine.garrison.forEach((_, g) => { if (!plan.orders.some((o, l) => l !== pick.lane && o?.k === 'switch' && o.garrison === g)) garrisonTargets.add(g); });
      pickHint = 'Choose a garrison unit to swap in.';
    } else if (pick.k === 'deploy') {
      const d = hand.find(h => h.uid === pick.uid);
      for (const lane of LANES) if (!mine.active[lane] && !plan.deploys.some(x => x.to === lane)) slotTargets.set(`${me}-${lane}`, 'Deploy');
      if (mine.garrison.length + plan.deploys.filter(x => x.to === 'garrison').length < WAR.garrison) garrisonDeploy = true;
      pickHint = `Choose where ${d ? card(d.slug).name : 'it'} goes: an empty slot, or the garrison.`;
    } else if (pick.k === 'deployTarget') {
      const d = hand.find(h => h.uid === pick.uid);
      const a = d && playOf(card(d.slug));
      if (a?.target) for (const t of specSlots(st, me, a.target)) slotTargets.set(slotKey(t), a.name ?? 'Target');
      pickHint = `Choose a target for ${a?.name ?? 'its effect'}.`;
    } else if (pick.k === 'hq') {
      if (hq.target) for (const t of specSlots(st, me, hq.target)) slotTargets.set(slotKey(t), hq.name ?? 'HQ');
      pickHint = `Choose a target for ${hq.name}.`;
    }
  }

  // --- Plan edits ---
  const setOrder = (lane: Lane, o: Order | null) => setPlan(p => ({ ...p, orders: p.orders.map((x, i) => (i === lane ? o : x)) }));

  function chooseSlot(t: SlotRef) {
    if (!pick || !slotTargets.has(slotKey(t))) return false;
    if (pick.k === 'attack') { setOrder(pick.lane, { k: 'attack', target: t }); setPick(null); }
    else if (pick.k === 'move') {
      const u = mine.active[pick.lane];
      if (WAR.moveAndAttack && u && u.power > 0) setPick({ k: 'moveAttack', lane: pick.lane, target: t });
      else { setOrder(pick.lane, { k: 'move', target: t }); setPick(null); }
    } else if (pick.k === 'moveAttack') { setOrder(pick.lane, { k: 'move', target: pick.target, attack: t }); setPick(null); }
    else if (pick.k === 'shiftAttack') { setOrder(pick.lane, { k: 'shift', dir: pick.dir, attack: t }); setPick(null); }
    else if (pick.k === 'deploy') placeDeploy(pick.uid, t.lane);
    else if (pick.k === 'deployTarget') {
      const { uid, to } = pick;
      setPlan(p => ({ ...p, deploys: [...p.deploys.filter(d => d.uid !== uid), { uid, to, target: t }] }));
      setPick(null);
    } else if (pick.k === 'hq') { setPlan(p => ({ ...p, hq: { target: t } })); setPick(null); }
    return true;
  }

  function placeDeploy(uid: string, to: Lane | 'garrison') {
    const h = hand.find(x => x.uid === uid);
    if (!h) return;
    const a = playOf(card(h.slug));
    if (a?.target && specSlots(st, me, a.target).length) {
      setPick({ k: 'deployTarget', uid, to });
      setPlan(p => ({ ...p, deploys: [...p.deploys.filter(d => d.uid !== uid), { uid, to }] }));
    } else {
      setPlan(p => ({ ...p, deploys: [...p.deploys.filter(d => d.uid !== uid), { uid, to }] }));
      setPick(null);
    }
  }

  function clickSlot(side: Side, lane: Lane) {
    if (!planning) return;
    if (chooseSlot({ side, lane })) return;
    if (side !== me) return;
    const planned = plan.deploys.find(d => d.to === lane);
    if (planned && !mine.active[lane]) {
      setPlan(p => ({ ...p, deploys: p.deploys.filter(d => d !== planned) }));
      return;
    }
    if (mine.active[lane] && canOrder(st, me, lane)) setPick(pick?.k === 'menu' && pick.lane === lane ? null : { k: 'menu', lane });
  }

  function clickGarrison(g: number) {
    if (!planning || !pick) return;
    if (pick.k === 'switch' && garrisonTargets.has(g)) { setOrder(pick.lane, { k: 'switch', garrison: g }); setPick(null); }
  }

  function clickHand(uid: string) {
    const h = hand.find(x => x.uid === uid);
    if (h) setFocus(h.slug);
    if (!planning) return;
    if (plan.deploys.some(d => d.uid === uid)) {
      setPlan(p => ({ ...p, deploys: p.deploys.filter(d => d.uid !== uid) }));
      return;
    }
    setPick(pick?.k === 'deploy' && pick.uid === uid ? null : { k: 'deploy', uid });
  }

  function clickHq() {
    if (!planning) return;
    if (plan.hq) { setPlan(p => ({ ...p, hq: null })); setPick(null); return; }
    if (hq.target) setPick(pick?.k === 'hq' ? null : { k: 'hq' });
    else setPlan(p => ({ ...p, hq: {} }));
  }

  const idleLanes = LANES.filter(l => canOrder(st, me, l) && !plan.orders[l]);
  function lockIn(force = false) {
    if (!planning) return;
    if (idleLanes.length && !force) return setConfirmIdle(true);
    setConfirmIdle(false);
    setPick(null);
    const final: Plan = { ...plan, hq: plan.hq ?? null };
    try {
      validatePlan(v!, me, final);
    } catch (e) {
      setLocalError((e as Error).message);
      return;
    }
    ctl.send({ type: 'plan', plan: final });
  }

  // Resolution preview among your own actions: Rush first, then speed.
  const acting = LANES.flatMap(l => {
    const o = plan.orders[l];
    const u = mine.active[l];
    return o && u && (o.k === 'attack' || o.k === 'move') ? [{ l, rush: u.keywords.includes('rush'), speed: u.speed }] : [];
  }).sort((a, b) => Number(b.rush) - Number(a.rush) || b.speed - a.speed);
  const rankOf = (l: Lane) => {
    const i = acting.findIndex(x => x.l === l);
    if (i < 0 || acting.length < 2) return null;
    const tied = acting.filter(x => x.rush === acting[i].rush && x.speed === acting[i].speed).length > 1;
    return tied ? null : ORDINAL[i];
  };

  const cls = (k: string) => (fx.anim[k] ?? []).join(' ');
  const deadlineLeft = ctl.deadline ? Math.max(0, Math.round((ctl.deadline - now) / 1000)) : null;
  const focusDef = focus ? card(focus) : null;
  const focusUnit = focus ? bv.players.flatMap(p => [...p.active, ...p.garrison]).find(u => u?.slug === focus) ?? null : null;

  // --- Rendering helpers ---
  const unitTile = (side: Side, lane: Lane | null, u: WarUnit, opts: { garrison?: number } = {}) => {
    const own = side === me;
    const def = card(u.slug);
    const frozen = u.frozenRound >= bv.round;
    // A brace stance (WAR.braceStance) is public: both players see it while planning.
    const stance = WAR.braceStance !== 'off' && lane !== null && (u.bracedUntil ?? 0) >= bv.round;
    const o = own && lane !== null && !watching ? plan.orders[lane] : null;
    const acting = actorUid === u.uid;
    const orderable = own && lane !== null && canOrder(st, me, lane);
    const isTarget = lane !== null && slotTargets.has(`${side}-${lane}`);
    const gTarget = opts.garrison !== undefined && own && garrisonTargets.has(opts.garrison);
    return (
      <UnitTile
        key={u.uid}
        def={def}
        unit={tileUnit(u)}
        fxKey={`unit-${u.uid}`}
        frozen={frozen}
        ready={planning && orderable && !o && !pick}
        selected={!!pick && 'lane' in pick && pick.lane === lane && own}
        target={isTarget || gTarget ? (own ? 'ally' : 'enemy') : undefined}
        className={[cls(`unit-${u.uid}`), stance ? w.stanced : '', acting ? w.actor : ''].join(' ')}
        floats={<Floats fx={fx} k={`unit-${u.uid}`} />}
        overlay={(
          <>
            {stance && <span className={w.stanceChip} title={warStanceText()} aria-label={warStanceText()}><Shield size="0.95em" aria-hidden /></span>}
            <span className={w.speedChip} title={`${SPEED_NAME[u.speed] ?? u.speed} speed${u.keywords.includes('rush') ? ', Rush acts first' : ''}`}>{u.keywords.includes('rush') ? 'R' : u.speed}</span>
            {acting && <span className={`${w.orderBadge} ${w.actorBadge}`}>{stage === 'cue' ? (step?.kind === 'action' || step?.kind === 'counter' ? 'Acting' : 'Next') : ACTOR_DONE[step?.kind ?? 'action']}</span>}
            {own && lane !== null && v.phase === 'plan' && !watching && orderBadge(o, o ? rankOf(lane) : null, orderable && !o)}
          </>
        )}
        onHover={() => setFocus(u.slug)}
        onClick={() => {
          setFocus(u.slug);
          if (opts.garrison !== undefined) clickGarrison(opts.garrison);
          else if (lane !== null) clickSlot(side, lane);
        }}
      />
    );
  };

  // A shift that may also attack (WAR.shiftAttack) asks for the attack next.
  const shiftTo = (lane: Lane, dir: -1 | 1) => {
    const u = mine.active[lane];
    const canHit = !!u && u.power > 0 && (WAR.shiftAttack === true || (WAR.shiftAttack === 'empty' && !mine.active[lane + dir]));
    setOrder(lane, { k: 'shift', dir });
    setPick(canHit ? { k: 'shiftAttack', lane, dir } : null);
  };

  const orderMenu = (lane: Lane) => {
    const u = mine.active[lane]!;
    const def = card(u.slug);
    const opts = orderOptions(st, me, lane);
    const m = moveOf(def);
    const mCost = m ? moveCost(m.cost ?? 0) : 0;
    const current = plan.orders[lane];
    const spareForMove = left + (current?.k === 'move' ? mCost : 0);
    const item = (label: ReactNode, onClick: () => void, opt: { disabled?: boolean; title?: string; on?: boolean } = {}) => (
      <button type="button" className={`${w.menuItem} ${opt.on ? w.menuOn : ''}`} onClick={onClick} disabled={opt.disabled} title={opt.title}>{label}</button>
    );
    return (
      <div className={`${w.menu} readable-font`} role="menu" aria-label={`Orders for ${def.name}`} onClick={e => e.stopPropagation()}>
        <div className={w.menuHead}>
          <b>{def.name}</b>
          <button type="button" className={s.coachClose} onClick={() => setPick(null)} aria-label="Close"><X size={15} /></button>
        </div>
        {opts.some(o => o.k === 'attack') && item(<><Swords size={14} /> Attack</>, () => setPick({ k: 'attack', lane }), { on: current?.k === 'attack', title: 'Pick a slot in reach' })}
        {m && item(
          <><Sparkles size={14} /> {m.name} <span className={w.menuCost}><Gem size={11} />{mCost}</span></>,
          () => (m.target ? setPick({ k: 'move', lane }) : WAR.moveAndAttack && u.power > 0 ? setPick({ k: 'moveAttack', lane }) : (setOrder(lane, { k: 'move' }), setPick(null))),
          { disabled: mCost > spareForMove, on: current?.k === 'move', title: `${abilityText(m).text}${WAR.moveAndAttack ? ' It can also attack.' : ''}` },
        )}
        {WAR.brace && item(<><Shield size={14} /> Brace</>, () => { setOrder(lane, { k: 'brace' }); setPick(null); }, { on: current?.k === 'brace', title: warBraceText() })}
        {mine.garrison.length > 0 && item(<><ArrowLeftRight size={14} /> Switch</>, () => setPick({ k: 'switch', lane }), { on: current?.k === 'switch', title: warSwitchText() })}
        <div className={w.menuRow}>
          {lane > 0 && item(<>← Shift</>, () => shiftTo(lane, -1), { on: current?.k === 'shift' && current.dir < 0, title: `${LANE_NAME[lane - 1]}: ${warShiftText()}` })}
          {lane < 2 && item(<>Shift →</>, () => shiftTo(lane, 1), { on: current?.k === 'shift' && current.dir > 0, title: `${LANE_NAME[lane + 1]}: ${warShiftText()}` })}
        </div>
        {current && item(<><X size={14} /> Clear order</>, () => { setOrder(lane, null); setPick(null); })}
      </div>
    );
  };

  const slot = (side: Side, lane: Lane) => {
    const p = bv.players[side];
    const own = side === me;
    const u = p.active[lane];
    const deploy = own && !watching ? plan.deploys.find(d => d.to === lane) : undefined;
    const deployCard = deploy && hand.find(h => h.uid === deploy.uid);
    const ghost = fx.ghosts.find(g => g.side === side && g.lane === lane);
    const target = slotTargets.get(`${side}-${lane}`);
    return (
      <div
        className={`${w.slot} ${own ? w.slotMine : w.slotFoe} ${target ? (own ? w.slotAlly : w.slotTarget) : ''} ${isAimed(side, lane) ? w.slotAimed : ''} ${cls(`slot-${side}-${lane}`)}`}
        data-slot={`${side}-${lane}`}
        data-fx={`slot-${side}-${lane}`}
        onClick={() => clickSlot(side, lane)}
        role={target ? 'button' : undefined}
        aria-label={target ? `${target}: ${own ? 'your' : 'enemy'} ${LANE_NAME[lane].toLowerCase()} slot` : undefined}
      >
        {u ? unitTile(side, lane, u) : ghost ? (
          <UnitTile key={`ghost-${ghost.unit.uid}-${rp.st.tick}`} def={card(ghost.unit.slug)} unit={tileUnit(ghost.unit)} frozen={false} ghost className={rp.reduce ? w.ghostStill : `${s.fxDeath} ${w.deathLate}`} />
        ) : deployCard ? (
          <UnitTile
            def={card(deployCard.slug)}
            unit={newUnitTile(card(deployCard.slug), deployCard.uid)}
            frozen={false}
            className={w.plannedUnit}
            overlay={<span className={`${w.orderBadge} ${w.orderDeploy}`}><Sparkles size="1em" /> Deploying</span>}
            onClick={() => clickSlot(side, lane)}
            onHover={() => setFocus(deployCard.slug)}
          />
        ) : (
          <span className={w.emptySlot}>{target ?? (own ? 'Empty' : '')}</span>
        )}
        {target && u && <span className={w.targetTag}>{target}</span>}
        {own && pick?.k === 'menu' && pick.lane === lane && u && orderMenu(lane)}
        <Floats fx={fx} k={`slot-${side}-${lane}`} />
      </div>
    );
  };

  const garrisonRow = (side: Side, small = false) => {
    const p = bv.players[side];
    const own = side === me;
    const plannedG = own && !watching ? plan.deploys.filter(d => d.to === 'garrison') : [];
    const cells: ReactNode[] = [];
    for (let g = 0; g < WAR.garrison; g++) {
      const u = p.garrison[g];
      const pd = !u ? plannedG[g - p.garrison.length] : undefined;
      const pdCard = pd && hand.find(h => h.uid === pd.uid);
      const canDrop = own && garrisonDeploy && !u && !pd;
      cells.push(
        <div
          key={g}
          className={`${w.gSlot} ${small ? w.gSlotSmall : ''} ${own && garrisonTargets.has(g) ? w.slotAlly : ''} ${canDrop ? w.slotAlly : ''}`}
          data-garrison={`${side}-${g}`}
          onClick={() => {
            if (canDrop && pick?.k === 'deploy') placeDeploy(pick.uid, 'garrison');
            else if (pd && planning) setPlan(pl => ({ ...pl, deploys: pl.deploys.filter(d => d !== pd) }));
          }}
          role={canDrop ? 'button' : undefined}
          aria-label={canDrop ? 'Deploy to the garrison' : undefined}
        >
          {u ? unitTile(side, null, u, { garrison: g }) : pdCard ? (
            <UnitTile def={card(pdCard.slug)} unit={newUnitTile(card(pdCard.slug), pdCard.uid)} frozen={false} className={w.plannedUnit} onClick={() => planning && setPlan(pl => ({ ...pl, deploys: pl.deploys.filter(d => d !== pd) }))} />
          ) : <span className={w.emptySlot}>{canDrop ? 'Deploy' : 'Garrison'}</span>}
        </div>,
      );
    }
    return <div className={w.garrison} aria-label={`${own ? 'Your' : `${p.name}'s`} garrison`}>{cells}</div>;
  };

  const hqBlock = (side: Side) => {
    const p = bv.players[side] as WarPlayerView;
    const own = side === me;
    const a = hqAbility(p);
    const el = ELEMENT_INFO[p.tank];
    const hqPlanned = own && !!plan.hq;
    const affordable = own && (hqPlanned || (a.cost ?? 0) <= left);
    const towersLeft = p.towers.filter(t => t > 0).length;
    return (
      <div className={w.hq}>
        <div className={`${s.heroPortrait} ${cls(`hq-${side}`)} ${watching && step?.hq === side ? w.actorHq : ''}`} style={{ '--el': el.color, '--hero-s': 'var(--war-hero, 60px)' } as CSSProperties} data-fx={`hq-${side}`} data-hq={own ? 'mine' : 'theirs'}>
          <Avatar uuid={p.avatar} />
          <span className={w.towerCount} title={`${towersLeft} of 3 towers standing`}><Castle size={12} />{towersLeft}</span>
          <Floats fx={fx} k={`hq-${side}`} />
        </div>
        <button
          type="button"
          className={[s.tankBtn, own && planning && affordable ? s.tankReady : '', hqPlanned || (own && pick?.k === 'hq') ? s.tankSelected : ''].join(' ')}
          style={{ '--el': el.color, '--hero-s': 'var(--war-hero, 60px)' } as CSSProperties}
          onClick={own ? clickHq : undefined}
          disabled={!own || !planning || (!affordable && !hqPlanned)}
          title={`${a.name} (${a.cost ?? 0} emeralds): ${abilityText(a).text} Once a round.${hqPlanned ? ' Planned: click to cancel.' : ''}`}
          aria-label={`${own ? 'Your' : `${p.name}'s`} HQ order: ${a.name}, ${a.cost ?? 0} emeralds${hqPlanned ? ', planned' : ''}`}
        >
          <span className={s.tankGlyph}>{el.glyph}</span>
          <span className={s.tankCost}>{a.cost ?? 0}</span>
          <span className={s.tankName}>{hqPlanned ? `${a.name} ✓` : a.name}</span>
        </button>
        <div className={s.heroInfo}>
          <div className={s.heroName}>{own ? `${p.name} (you)` : p.name}</div>
          <Bank n={p.emeralds} spend={own && planning ? cost : undefined} fxKey={`bank-${side}`} fx={fx} />
        </div>
      </div>
    );
  };

  const statusChip = (p: WarPlayerView, own: boolean) => {
    // The chips describe the live round, not the one being replayed.
    if (v.phase === 'over' || watching) return null;
    const done = v.phase === 'mulligan' ? p.mulliganed : own ? p.planned : ctl.opponentLockedIn || p.planned;
    return (
      <span className={`${w.lockChip} ${done ? w.lockDone : ''}`}>
        {done ? <><ShieldCheck size={14} /> Locked in</> : <><span className={w.dots} aria-hidden /> Planning</>}
      </span>
    );
  };

  // --- Log lines ---
  const lines: { text: string; round?: boolean; side?: Side; fresh: boolean }[] = [];
  v.log.forEach((e, i) => {
    const fresh = v.logBase + i >= rp.freshFrom;
    if (e.k === 'round') lines.push({ text: `Round ${e.round}`, round: true, fresh });
    else {
      const t = describe(e, v, uid => names.get(uid) ?? 'A unit', card);
      if (t) lines.push({ text: t, side: 'side' in e ? e.side : undefined, fresh });
    }
  });

  const needsMulligan = v.phase === 'mulligan' && !mine.mulliganed;
  const result = v.phase === 'over' ? (v.winner === null ? 'Draw' : v.winner === me ? 'Victory' : 'Defeat') : null;
  const plannedCount = plan.orders.filter(Boolean).length;
  const orderable = LANES.filter(l => canOrder(st, me, l)).length;
  const planSummary = `${plannedCount}/${orderable} orders${plan.deploys.length ? ` · ${plan.deploys.length} deploy${plan.deploys.length > 1 ? 's' : ''}` : ''}${plan.hq ? ' · HQ' : ''}`;
  // --- The reveal's narration, controls and recap ---
  const replay = rp.st.replay;
  const reveal = rp.st.mode !== 'off' && !!step && !!replay;
  const corner = rp.st.mode === 'corner';
  const nSteps = replay?.steps.length ?? 0;
  const controls = (compact: boolean) => (
    <span className={`${w.rControls} ${compact ? w.rControlsCompact : ''}`} role="group" aria-label="Replay controls">
      <button type="button" className={w.rBtn} onClick={rp.back} disabled={rp.st.idx === 0 && (stage === 'cue' || rp.reduce)} aria-label="Previous step" title="Previous step (Left arrow)"><ChevronLeft size={17} /></button>
      {rp.st.playing
        ? <button type="button" className={`${w.rBtn} ${w.rPlay}`} onClick={rp.pause} aria-label="Pause" title="Pause"><Pause size={17} /></button>
        : <button type="button" className={`${w.rBtn} ${w.rPlay}`} onClick={rp.play} aria-label="Play" title="Play"><Play size={17} /></button>}
      <button type="button" className={w.rBtn} onClick={rp.next} aria-label="Next step" title="Next step (Right arrow)"><ChevronRight size={17} /></button>
      {!compact && (
        <span className={w.rSpeed} role="radiogroup" aria-label="Replay speed">
          {(['slow', 'normal', 'fast'] as ReplaySpeed[]).map(sp => (
            <button key={sp} type="button" role="radio" aria-checked={rp.speed === sp} className={`${w.rSpeedBtn} ${rp.speed === sp ? w.rSpeedOn : ''}`} onClick={() => rp.setSpeed(sp)}>
              {SPEED_LABEL[sp]}
            </button>
          ))}
        </span>
      )}
    </span>
  );
  const narration = reveal && step ? (
    <div
      className={`${w.narration} ${step.side === me ? w.nMine : step.side === foe ? w.nFoe : ''} ${corner ? w.nCompact : ''}`}
      style={{ '--p': (rp.st.idx + (stage === 'hit' ? 1 : 0.5)) / nSteps } as CSSProperties}
    >
      <span className={w.nPhase}>{step.phase}</span>
      <div className={`${w.nText} readable-font`} aria-live="polite">
        <b>{step.headline}</b>
        {(stage === 'hit' || corner) && step.results.length > 0 && <span key={`r${step.i}`} className={w.nResults}>{step.results.join(' ')}</span>}
      </div>
      <span className={w.nCount} title="Step">{rp.st.idx + 1}/{nSteps}</span>
      {corner && (
        <span className={w.nCornerBtns}>
          {controls(true)}
          <button type="button" className={`${s.iconBtn} ${w.nSmallBtn}`} onClick={rp.resume} title="Watch the reveal on the board"><Eye size={15} /> Watch</button>
          <button type="button" className={`${s.iconBtn} ${w.nSmallBtn}`} onClick={rp.skip} aria-label="Close the reveal" title="Close the reveal"><X size={15} /></button>
        </span>
      )}
      <span className={w.nProgress} aria-hidden />
    </div>
  ) : null;
  const tally = replay?.tally;
  const recapSteps = replay ? replay.steps.filter(x => recapAll || x.weight > 0) : [];

  const hint = ctl.pending ? 'Sending...' : pickHint || (v.phase === 'plan' && locked ? `Orders locked. Waiting for ${theirs.name}...` : v.phase === 'plan' ? 'Click your units to give orders; click a hand card to deploy it.' : '');

  return (
    <CardRulesProvider value={WAR_CARD_RULES}>
      <div className={`${s.battle} ${w.war}`}>
        <div className={s.topBar}>
          <div className={s.topTitle}>
            <Link href={backHref} aria-label="Back to duels"><ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> <span>Duels</span></Link>
            <h1>Three-Front War{ctl.mode === 'practice' ? ' · Practice' : ''} vs {theirs.name}</h1>
          </div>
          <div className={s.topActions}>
            <button type="button" className={`${s.iconBtn} ${s.drawerBtn}`} onClick={() => setDrawer(true)}><ScrollText size={16} /> Details</button>
            <button type="button" className={s.iconBtn} onClick={() => setRules(true)} aria-label="Rules"><CircleHelp size={16} /> <span className={s.counterWord}>Rules</span></button>
            {v.phase !== 'over' && (
              <button type="button" className={`${s.iconBtn} ${s.btnDanger}`} onClick={() => { if (confirm('Concede this war?')) ctl.send({ type: 'concede' }); }} aria-label="Concede">
                <Flag size={15} /> <span className={s.counterWord}>Concede</span>
              </button>
            )}
          </div>
        </div>

        <div className={`${s.table} ${w.table}`} ref={tableRef} onClick={() => { if (pick?.k === 'menu') setPick(null); }}>
          {/* Opponent: HQ, bank, garrison and hidden hand. */}
          <div className={`${w.sideRow} ${w.foeRow}`}>
            {hqBlock(foe)}
            <div className={w.foeMid}>
              {garrisonRow(foe, true)}
            </div>
            <div className={w.counters}>
              {statusChip(theirs, false)}
              <span className={s.counter} title="Cards in hand"><CardBack small /> {bTheirs.handCount}<span className={s.counterWord}>&nbsp;in hand</span></span>
              <span className={s.counter} title="Cards left in deck"><CardBack small /> {bTheirs.deckCount}<span className={s.counterWord}>&nbsp;in deck</span></span>
            </div>
          </div>

          {/* What the reveal is showing, in words. */}
          <div className={`${w.narrationRow} ${reveal ? '' : w.narrationRowEmpty}`}>{narration}</div>

          {/* The three fronts. */}
          <div className={`${w.board} ${watching ? w.boardReplay : ''}`}>
            {LANES.map(lane => {
              const t = v.territories[lane];
              const holder = frontHolder(bv, lane);
              const Perk = t.city ? PERK_ICON.city : t.resource ? PERK_ICON[t.resource] : Gem;
              return (
                <div key={lane} className={`${w.lane} ${lane === 1 ? w.laneCentre : ''}`}>
                  <div className={`${w.laneHead} ${cls(`lane-${lane}`)}`} data-fx={`lane-${lane}`} title={`${t.name}: holding this front gives ${perkText(t)} each round`}>
                    <Perk size={14} aria-hidden />
                    <b>{t.name}</b>
                    {lane === 1 && <span className={w.centreTag}>{t.city ? 'City' : 'Centre'}</span>}
                    <span className={`${w.holder} ${holder === me ? w.holderMine : holder === foe ? w.holderFoe : ''}`}>
                      {holder === me ? 'Yours' : holder === foe ? 'Theirs' : 'Contested'} · {perkText(t)}
                    </span>
                    <Floats fx={fx} k={`lane-${lane}`} />
                  </div>
                  <Tower hp={bTheirs.towers[lane]} side={foe} lane={lane} mine={false} fx={fx} cls={cls(`tower-${foe}-${lane}`)} />
                  {slot(foe, lane)}
                  <div className={w.laneMid} aria-hidden><span>{LANE_NAME[lane]}</span></div>
                  {slot(me, lane)}
                  <Tower hp={bMine.towers[lane]} side={me} lane={lane} mine fx={fx} cls={cls(`tower-${me}-${lane}`)} />
                </div>
              );
            })}
          </div>

          {/* Round, plan cost and the lock. */}
          <div className={w.strip}>
            <span className={`${s.turnPill} ${planning ? s.turnPillMine : ''}`}>
              <span className={s.turnWord}>{watching && replay ? `Round ${replay.round} replay` : v.phase === 'mulligan' ? 'Opening hands' : v.phase === 'over' ? 'War over' : `Round ${v.round}/${WAR.roundLimit}`}</span>
              {deadlineLeft !== null && v.phase !== 'over' && (
                <span className={`${s.clock} ${deadlineLeft <= 10 ? s.clockLow : ''}`}>{Math.floor(deadlineLeft / 60)}:{String(deadlineLeft % 60).padStart(2, '0')}</span>
              )}
            </span>
            {watching ? <span className={w.rCentre}>{controls(false)}</span> : <span className={`${s.hint} readable-font`} role="status">{hint}</span>}
            <span className={w.lockWrap}>
              {!watching && v.phase === 'plan' && !locked && <span className={`${w.planSummary} readable-font`}>{planSummary}{idleLanes.length ? ` · ${idleLanes.length} idle` : ''}</span>}
              {watching && (
                <button type="button" className={`${s.iconBtn} ${w.skip}`} onClick={rp.skip} title="Show the board as it is now" aria-label="Skip to end"><SkipForward size={15} /> <span className={w.rWord}>Skip to end</span></button>
              )}
              {watching && v.phase === 'plan' && !locked && (
                <button type="button" className={`${s.btn} ${s.btnPrimary} ${w.planNow}`} onClick={rp.toCorner} title="Plan the next round now; the reveal keeps narrating above the board">
                  <Swords size={15} /> Plan now
                </button>
              )}
              {!watching && replay && rp.st.mode === 'off' && (
                <button type="button" className={`${s.iconBtn} ${w.skip}`} onClick={() => rp.watch(0)} title={`Watch round ${replay.round} again`} aria-label={`Replay round ${replay.round}`}>
                  <RotateCcw size={15} /> <span className={w.rWord}>Replay round {replay.round}</span>
                </button>
              )}
              {!watching && <button
                type="button"
                className={`${s.endTurn} ${planning && !idleLanes.length && left >= 0 ? s.endTurnReady : ''}`}
                disabled={!planning || left < 0}
                onClick={() => lockIn()}
                title={left < 0 ? 'Your plan costs more emeralds than you have' : undefined}
              >
                {locked && v.phase === 'plan' ? <><Lock size={15} /> Locked</> : v.phase === 'over' ? 'War over' : <><Lock size={15} /> Lock in</>}
              </button>}
            </span>
          </div>

          {/* You: HQ, bank, garrison, hand. */}
          <div className={`${w.sideRow} ${w.myRow}`}>
            <div className={w.myLeft}>
              {hqBlock(me)}
              {statusChip(mine, true)}
            </div>
            <div className={w.myGarrison}>
              <span className={w.label}>Garrison</span>
              {garrisonRow(me)}
            </div>
            <div className={s.handZone}>
              <div className={s.hand} aria-label="Your hand" style={{ '--n': bHand.length, '--gaps': Math.max(1, bHand.length - 1) } as CSSProperties}>
                {bHand.map((h, i) => {
                  const d = card(h.slug);
                  const off = i - (bHand.length - 1) / 2;
                  const planned = !watching && plan.deploys.some(x => x.uid === h.uid);
                  const hasRoom = LANES.some(l => !mine.active[l] && !plan.deploys.some(x => x.to === l)) || mine.garrison.length + plan.deploys.filter(x => x.to === 'garrison').length < WAR.garrison;
                  const ok = planning && !planned && emeraldCost(d.cost) <= left && hasRoom;
                  return (
                    <div key={h.uid} className={s.handSlot} style={{ '--rot': `${off * 3}deg`, '--y': `${Math.abs(off) ** 1.8 * 2.4}px`, '--z': i + 1 } as CSSProperties}>
                      <CardFace
                        def={d}
                        selected={pick?.k === 'deploy' && pick.uid === h.uid}
                        playable={ok && !pick}
                        dim={(planning && !ok && !planned) || planned}
                        onClick={() => clickHand(h.uid)}
                        onHover={() => setFocus(h.slug)}
                        badge={planned ? <span className={w.plannedTag}>Planned</span> : undefined}
                      />
                    </div>
                  );
                })}
                {!bHand.length && <span className={s.handEmpty}>No cards in hand</span>}
              </div>
            </div>
          </div>

          <svg className={w.arrowLayer} aria-hidden>
            <defs>
              {['attack', 'move', 'swap'].map(k => (
                <marker key={k} id={`war-head-${k}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className={w[`head_${k}`]} />
                </marker>
              ))}
            </defs>
            {arrows.map(a => (
              <path
                key={a.key}
                d={a.d}
                className={a.cls}
                markerEnd={`url(#war-head-${a.cls.startsWith(w.arrowAttack) ? 'attack' : a.cls.startsWith(w.arrowMove) ? 'move' : 'swap'})`}
                markerStart={a.cls === w.arrowSwap || (a.cls.startsWith(w.arrowSwap) && step?.kind === 'shift') ? 'url(#war-head-swap)' : undefined}
              />
            ))}
          </svg>

          {tally && rp.endedAt !== null && rp.st.mode === 'off' && (
            <div className={`${w.summary} readable-font`} role="status">
              <b>Round {tally.round}</b>
              <span>Tower damage: <em className={w.good}>{tally.dealt} dealt</em> · <em className={w.bad}>{tally.taken} taken</em></span>
              {(tally.killed > 0 || tally.lost > 0) && <span>Units: {tally.killed} defeated · {tally.lost} lost</span>}
              {tally.towersWon > 0 && <span className={w.good}>You destroyed {tally.towersWon} tower{tally.towersWon > 1 ? 's' : ''}!</span>}
              {tally.towersLost > 0 && <span className={w.bad}>You lost {tally.towersLost} tower{tally.towersLost > 1 ? 's' : ''}.</span>}
              <span className={w.summaryHint}>The round recap stays in the side panel.</span>
            </div>
          )}

          {pick && pick.k === 'shiftAttack' && (
            <div className={w.pickBar}>
              <span className="readable-font">Also attack from the new lane{WAR.shiftAttackTiming === 'last' ? ' (lands after everything else' + (WAR.shiftAttackPower < 1 ? ', at reduced power)' : ')') : WAR.shiftAttackPower < 1 ? ' (at reduced power)' : ''}? Choose a highlighted slot.</span>
              <button type="button" className={s.btn} onClick={() => setPick(null)}>No attack</button>
            </div>
          )}

          {pick && pick.k === 'moveAttack' && (
            <div className={w.pickBar}>
              <span className="readable-font">Also attack with it? Choose a highlighted slot.</span>
              <button type="button" className={s.btn} onClick={() => { setOrder(pick.lane, { k: 'move', target: pick.target }); setPick(null); }}>No attack</button>
            </div>
          )}

          {(ctl.error || localError) && (
            <div className={`${s.errorToast} readable-font`} role="alert">
              {localError ?? ctl.error}
              <button type="button" className={s.coachClose} style={{ color: 'var(--d-err-ink)' }} onClick={() => { setLocalError(null); ctl.clearError(); }} aria-label="Dismiss"><X size={16} /></button>
            </div>
          )}
        </div>

        <aside className={`${s.side} ${drawer ? s.sideOpen : ''}`} aria-label="Card detail and war log">
          <div className={`${s.sidePanel} ${s.detail}`}>
            {drawer && (
              <button type="button" className={s.coachClose} style={{ alignSelf: 'flex-end', color: 'var(--d-ink-2)' }} onClick={() => setDrawer(false)} aria-label="Close"><X size={18} /></button>
            )}
            {focusDef ? <CardFace def={focusDef} large /> : <div className={`${s.detailEmpty} readable-font`}>Hover or tap any card to read it here.</div>}
            {focusDef && (
              <p className={`${s.detailNote} readable-font`}>
                {SPEED_NAME[warSpeed(focusDef)]} speed{focusDef.keywords.includes('rush') ? ', Rush: acts first' : ''}
                {focusUnit ? ` · ${focusUnit.health}/${focusUnit.maxHealth} health now` : ''}
              </p>
            )}
          </div>
          <div className={`${s.sidePanel} ${s.logPanel}`}>
            <div className={s.logTitle}>
              <span className={w.tabs} role="tablist">
                {replay && (
                  <button type="button" role="tab" aria-selected={logTab === 'recap'} className={`${w.tab} ${logTab === 'recap' ? w.tabOn : ''}`} onClick={() => setLogTab('recap')}>Round {replay.round} recap</button>
                )}
                <button type="button" role="tab" aria-selected={logTab === 'log' || !replay} className={`${w.tab} ${logTab === 'log' || !replay ? w.tabOn : ''}`} onClick={() => setLogTab('log')}>War log</button>
              </span>
              <span className={s.clock} style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>Round {v.round}</span>
            </div>
            {replay && logTab === 'recap' ? (
              <div className={`${w.recap} readable-font`}>
                {tally && (
                  <div className={w.recapTally}>
                    <span>Towers: <em className={w.good}>{tally.dealt} dealt</em> · <em className={w.bad}>{tally.taken} taken</em></span>
                    <span>Units: <em className={w.good}>{tally.killed} defeated</em> · <em className={w.bad}>{tally.lost} lost</em></span>
                    {(tally.towersWon > 0 || tally.towersLost > 0) && (
                      <span>
                        {tally.towersWon > 0 && <em className={w.good}>{tally.towersWon} tower{tally.towersWon > 1 ? 's' : ''} destroyed</em>}
                        {tally.towersWon > 0 && tally.towersLost > 0 ? ' · ' : ''}
                        {tally.towersLost > 0 && <em className={w.bad}>{tally.towersLost} tower{tally.towersLost > 1 ? 's' : ''} lost</em>}
                      </span>
                    )}
                  </div>
                )}
                <ol className={w.recapList}>
                  {recapSteps.map(x => (
                    <li key={x.i}>
                      <button
                        type="button"
                        className={`${w.recapItem} ${x.side === me ? w.recapMine : x.side === foe ? w.recapFoe : ''} ${reveal && rp.st.idx === x.i ? w.recapOn : ''}`}
                        onClick={() => { rp.watch(x.i, false); setDrawer(false); }}
                        title="Show this step on the board"
                      >
                        <span className={w.recapKind}>{RECAP_KIND[x.kind]}</span>
                        <span>{x.recap}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <div className={w.recapFoot}>
                  <button type="button" className={w.linkBtn} onClick={() => setRecapAll(a => !a)}>{recapAll ? 'Hide routine steps' : 'Show every step'}</button>
                  <button type="button" className={w.linkBtn} onClick={() => { rp.watch(0); setDrawer(false); }}><RotateCcw size={13} /> Replay round</button>
                </div>
              </div>
            ) : (
              <div ref={logRef} className={`${s.log} readable-font`}>
                {lines.map((l, i) => (
                  <div key={i} className={l.round ? s.logTurn : `${s.logLine} ${l.side === me ? s.logMine : l.side === foe ? s.logFoe : ''} ${l.fresh ? s.logFresh : ''}`}>{l.text}</div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {confirmIdle && (
          <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Idle units" onClick={() => setConfirmIdle(false)}>
            <div className={s.dialog} style={{ width: 'min(460px, 100%)' }} onClick={e => e.stopPropagation()}>
              <h2>{idleLanes.length === 1 ? 'A unit has no orders' : `${idleLanes.length} units have no orders`}</h2>
              <p className={`${s.muted} readable-font`}>
                {idleLanes.map(l => `${card(mine.active[l]!.slug).name} (${LANE_NAME[l].toLowerCase()})`).join(', ')} will stand idle this round: no attack, no brace.
              </p>
              <div className={s.row} style={{ justifyContent: 'center' }}>
                <button type="button" className={s.btn} onClick={() => setConfirmIdle(false)}>Keep planning</button>
                <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => lockIn(true)}>Lock in anyway</button>
              </div>
            </div>
          </div>
        )}

        {needsMulligan && (
          <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Opening hand">
            <div className={s.dialog}>
              <h2>Your opening hand</h2>
              <p className={`${s.muted} readable-font`}>
                The fronts: {v.territories.map(t => t.name).join(', ')}. Both sides plan at once, so there is no first player.
                Click any card to swap it for a new one.
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
              <button type="button" className={s.endTurn} disabled={ctl.pending} onClick={() => ctl.send({ type: 'mulligan', replace: [...replace] })}>
                {replace.size ? `Replace ${replace.size} and start` : 'Keep hand'}
              </button>
            </div>
          </div>
        )}

        {v.phase === 'mulligan' && mine.mulliganed && (
          <div className={s.overlay}>
            <div className={s.dialog}><p>Waiting for {theirs.name} to choose their opening hand...</p></div>
          </div>
        )}

        {result && !resultSeen && rp.st.mode === 'off' && (
          <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Result">
            <div className={s.dialog} style={{ width: 'min(540px, 100%)' }}>
              <div className={`${s.result} ${result !== 'Victory' ? s.resultDefeat : ''}`}>{result}</div>
              <p className={`${s.muted} readable-font`}>
                {v.endReason === 'towers' ? `${v.winner === me ? 'You broke' : `${theirs.name} broke`} ${WAR.towersToWin} towers.`
                  : v.endReason === 'round_limit' ? `Called at round ${WAR.roundLimit}, on towers destroyed and then tower damage dealt.`
                    : v.endReason === 'concede' ? (v.winner === me ? `${theirs.name} conceded.` : 'You conceded.')
                      : v.endReason === 'timeout' ? 'Decided on time.' : ''}
                {' '}Towers standing: you {mine.towers.filter(t => t > 0).length}, {theirs.name} {theirs.towers.filter(t => t > 0).length}.
              </p>
              <div className={s.row} style={{ justifyContent: 'center' }}>
                <Link href={backHref} className={`${s.btn} ${s.btnPrimary}`}>Back to duels</Link>
                <button type="button" className={s.btn} onClick={() => setResultSeen(true)}>View board</button>
              </div>
            </div>
          </div>
        )}

        {rules && (
          <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Rules" onClick={() => setRules(false)}>
            <div className={`${s.dialog} ${s.rulesSheet}`} onClick={e => e.stopPropagation()}>
              <div className={s.row} style={{ justifyContent: 'space-between', width: '100%' }}>
                <h2>How Three-Front War works</h2>
                <button type="button" className={s.coachClose} style={{ color: 'var(--d-ink-2)' }} onClick={() => setRules(false)} aria-label="Close"><X size={20} /></button>
              </div>
              <QuickWarRules />
              <Link href="/duels?tab=guide&guide=war" className={s.btn} target="_blank">Open the full guide</Link>
            </div>
          </div>
        )}
      </div>
    </CardRulesProvider>
  );
}

