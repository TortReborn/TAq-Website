'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Bot, CircleHelp, Flag, Lightbulb, ScrollText, Sparkles, X } from 'lucide-react';
import type { useDuelMatch } from '@/hooks/useDuels';
import {
  attackTargets, BOARD_SLOTS, canAct, defOf, moveOf, other, playOf, sameTarget, specTargets, tankBlocked, tankOf,
} from '@/lib/duel/engine';
import { abilityText, ELEMENT_INFO } from '@/lib/duel/text';
import type { CardDef, GameView, LogEvent, PlayerView, Side, TargetRef, Unit } from '@/lib/duel/types';
import CardFace, { CardBack, UnitTile } from './CardFace';
import { QuickRules } from './Guide';
import s from './duel.module.css';

type Selection = { kind: 'hand' | 'unit' | 'move' | 'tank'; uid: string } | null;

const key = (t: TargetRef) => (t.kind === 'hero' ? `hero-${t.side}` : `unit-${t.uid}`);
const COACH_KEY = 'duels.coach';

function Avatar({ uuid }: { uuid: string }) {
  if (!uuid) return <span className={s.botFace}><Bot size="55%" /></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://mc-heads.net/avatar/${uuid}/96`} alt="" draggable={false} />;
}

function Tide({ tide, max }: { tide: number; max: number }) {
  return (
    <span className={s.tide} title={`${tide} of ${max} tide`} aria-label={`${tide} of ${max} tide`}>
      {Array.from({ length: Math.max(max, tide) }, (_, i) => (
        <span key={i} className={`${s.crystal} ${i < tide ? s.crystalFull : ''}`} />
      ))}
      <span className={s.tideNum}>{tide}/{max}</span>
    </span>
  );
}

/** A readable line for each engine event, or null for ones that only matter to animation. */
function describe(e: LogEvent, v: GameView, nameOf: (uid: string) => string, card: (slug: string) => CardDef): string | null {
  const who = (side: Side) => (side === v.you ? 'You' : v.players[side].name);
  const tgt = (t: TargetRef) => (t.kind === 'hero' ? (t.side === v.you ? 'your tank' : `${v.players[t.side].name}'s tank`) : nameOf(t.uid));
  switch (e.k) {
    case 'start': return `${who(e.first)} ${e.first === v.you ? 'go' : 'goes'} first.`;
    case 'turn': return null;
    case 'play': return e.slug.startsWith('token-') ? `${card(e.slug).name} appears.` : `${who(e.side)} played ${card(e.slug).name}.`;
    case 'attack': return `${nameOf(e.uid)} attacks ${tgt(e.target)}.`;
    case 'move': return `${nameOf(e.uid)} uses ${e.name}.`;
    case 'damage': return `${cap(tgt(e.target))} takes ${e.n}.`;
    case 'shield': return `${nameOf(e.uid)}'s shield breaks.`;
    case 'heal': return `${cap(tgt(e.target))} heals ${e.n}.`;
    case 'death': return `${card(e.slug).name} is defeated.`;
    case 'draw': return e.side === v.you ? `You draw ${e.n === 1 ? 'a card' : `${e.n} cards`}.` : null;
    case 'burn': return `${who(e.side)} ${e.side === v.you ? 'have' : 'has'} a full hand; ${card(e.slug).name} is burned.`;
    case 'fatigue': return `${who(e.side)} ${e.side === v.you ? 'are' : 'is'} out of cards and ${e.side === v.you ? 'take' : 'takes'} ${e.n}.`;
    case 'freeze': return `${nameOf(e.uid)} is frozen.`;
    case 'bounce': return `${card(e.slug).name} returns to hand.`;
    case 'pearl': return `${who(e.side)} ${e.side === v.you ? 'use' : 'uses'} the Pearl.`;
    case 'tank': return `${who(e.side)} ${e.side === v.you ? 'use' : 'uses'} ${e.name}.`;
    case 'timeout': return `${who(e.side)} ran out of time.`;
    case 'end': return e.winner === null ? 'The duel is a draw.' : `${who(e.winner)} ${e.winner === v.you ? 'win' : 'wins'}!`;
    default: return null;
  }
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

const REASONS: Record<string, string> = {
  hero: '', concede: ' by concession', timeout: ' on time', turn_limit: ' at the turn limit',
};

// --- Effects timeline ------------------------------------------------------
//
// Each update can carry many events (the practice bot plays its whole turn in
// one response). They are grouped into beats, each opened by an action, and
// played back one beat at a time. The board itself is already final; the
// timeline only decorates it: new units stay hidden until their beat, units
// that left linger as ghosts until theirs. Nothing here disables input.

interface Float { id: number; key: string; text: string; kind: 'dmg' | 'heal' | 'info' }
interface Ghost { side: Side; index: number; unit: Unit; exit: 'death' | 'bounce' | null }
interface Fx {
  anim: Record<string, string[]>;
  floats: Float[];
  pending: string[];
  ghosts: Ghost[];
  banner: { text: string; mine: boolean; id: number } | null;
  drawn: string[];
  hiddenHand: string[];
  busy: boolean;
  /** Log index where the latest batch started, to highlight it. */
  freshFrom: number;
}

const NO_FX: Fx = { anim: {}, floats: [], pending: [], ghosts: [], banner: null, drawn: [], hiddenHand: [], busy: false, freshFrom: Infinity };
const OPENERS = new Set<string>(['play', 'attack', 'move', 'turn', 'pearl', 'tank', 'timeout']);
const BEAT_MS: Record<string, number> = { turn: 750, play: 620, attack: 760, move: 700, tank: 650, pearl: 450, timeout: 600 };

function useBattleFx(v: GameView | null) {
  const [fx, setFx] = useState<Fx>(NO_FX);
  const seen = useRef<number | null>(null);
  const prev = useRef<GameView | null>(null);
  const timers = useRef<number[]>([]);
  const nextId = useRef(1);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Layout effect: units waiting for their beat must be hidden before the first paint.
  useLayoutEffect(() => {
    if (!v) return;
    const end = v.logBase + v.log.length;
    const last = seen.current;
    const before = prev.current;
    seen.current = end;
    prev.current = v;
    if (last === null || !before || end <= last) return;

    const fresh = v.log.slice(Math.max(0, last - v.logBase));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const me = v.you;

    const beats: LogEvent[][] = [];
    for (const e of fresh) {
      if (e.k === 'start' || e.k === 'end') continue;
      if (OPENERS.has(e.k) || !beats.length) beats.push([e]);
      else beats[beats.length - 1].push(e);
    }

    // Starting times, squeezed so a long bot turn never runs past ~5s.
    const lengths = beats.map(b => BEAT_MS[b[0].k] ?? 380);
    const total = lengths.reduce((a, b) => a + b, 0);
    const squeeze = reduce ? 0 : Math.min(1, 5000 / Math.max(1, total));
    const starts: number[] = [];
    lengths.reduce((t, len, i) => { starts[i] = t; return t + len * squeeze; }, 0);

    const onBoard = new Set(v.players.flatMap(p => p.board.map(u => u.uid)));
    const pending = beats.flatMap((b, i) => (i === 0 ? [] : b.flatMap(e => (e.k === 'play' && onBoard.has(e.uid) ? [e.uid] : []))));
    const ghosts: Ghost[] = [];
    for (const e of fresh) {
      if (e.k !== 'death' && e.k !== 'bounce') continue;
      if (onBoard.has(e.uid)) continue;
      for (const side of [0, 1] as Side[]) {
        const index = before.players[side].board.findIndex(u => u.uid === e.uid);
        if (index >= 0 && !ghosts.some(g => g.unit.uid === e.uid)) ghosts.push({ side, index, unit: before.players[side].board[index], exit: null });
      }
    }
    const oldHand = new Set((before.players[me].hand ?? []).map(h => h.uid));
    const newCards = (v.players[me].hand ?? []).map(h => h.uid).filter(uid => !oldHand.has(uid));
    // Cards drawn at the start of your turn arrive with that turn's beat.
    const drawBeat = beats.findIndex(b => b.some(e => e.k === 'draw' && e.side === me));
    const hiddenHand = drawBeat > 0 ? newCards : [];

    timers.current.forEach(clearTimeout);
    timers.current = [];
    const at = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
    const pulse = (k: string, cls: string, ms: number) => {
      if (reduce) return;
      setFx(f => ({ ...f, anim: { ...f.anim, [k]: [...(f.anim[k] ?? []), cls] } }));
      at(ms, () => setFx(f => ({ ...f, anim: { ...f.anim, [k]: (f.anim[k] ?? []).filter(c => c !== cls) } })));
    };
    const float = (k: string, text: string, kind: Float['kind']) => {
      if (reduce) return;
      const id = nextId.current++;
      setFx(f => ({ ...f, floats: [...f.floats, { id, key: k, text, kind }] }));
      at(1150, () => setFx(f => ({ ...f, floats: f.floats.filter(x => x.id !== id) })));
    };

    setFx({ ...NO_FX, pending, ghosts, hiddenHand, busy: true, freshFrom: last, drawn: drawBeat <= 0 && !reduce ? newCards : [] });
    if (drawBeat <= 0 && newCards.length) at(600, () => setFx(f => ({ ...f, drawn: [] })));

    beats.forEach((beat, i) => {
      const t = starts[i];
      const head = beat[0];
      at(t, () => {
        if (head.k === 'turn' && !reduce) {
          const id = nextId.current++;
          setFx(f => ({ ...f, banner: { text: head.side === me ? 'Your turn' : `${v.players[head.side].name}'s turn`, mine: head.side === me, id } }));
          at(1500, () => setFx(f => (f.banner?.id === id ? { ...f, banner: null } : f)));
        }
        if (head.k === 'play') {
          setFx(f => ({ ...f, pending: f.pending.filter(u => u !== head.uid) }));
          pulse(`unit-${head.uid}`, s.fxSummon, 600);
        }
        if (head.k === 'attack') {
          const from = document.querySelector<HTMLElement>(`[data-fx="unit-${head.uid}"]`);
          const to = document.querySelector<HTMLElement>(`[data-fx="${key(head.target)}"]`);
          if (from && to) {
            const a = from.getBoundingClientRect();
            const b = to.getBoundingClientRect();
            from.style.setProperty('--dx', `${b.left + b.width / 2 - (a.left + a.width / 2)}px`);
            from.style.setProperty('--dy', `${b.top + b.height / 2 - (a.top + a.height / 2)}px`);
          }
          pulse(`unit-${head.uid}`, s.fxLunge, 480);
        }
        if (head.k === 'move') {
          pulse(`unit-${head.uid}`, s.fxCast, 620);
          float(`unit-${head.uid}`, head.name, 'info');
        }
        if (head.k === 'tank') {
          pulse(`hero-${head.side}`, s.fxCast, 620);
          float(`hero-${head.side}`, head.name, 'info');
        }
        if (head.k === 'pearl') float(`hero-${head.side}`, '+1 tide', 'info');
        if (head.k === 'timeout') float(`hero-${head.side}`, 'Out of time', 'info');
        if (i === drawBeat && drawBeat > 0) {
          setFx(f => ({ ...f, hiddenHand: [], drawn: reduce ? [] : newCards }));
          at(600, () => setFx(f => ({ ...f, drawn: [] })));
        }
      });
      // Consequences land as the blow connects.
      const hitAt = t + (head.k === 'attack' ? 240 * Math.max(squeeze, 0.6) : 120) * (reduce ? 0 : 1);
      at(hitAt, () => {
        for (const e of beat) {
          if (e.k === 'damage') {
            float(key(e.target), `-${e.n}`, 'dmg');
            pulse(key(e.target), s.fxHit, 450);
          } else if (e.k === 'heal') {
            float(key(e.target), `+${e.n}`, 'heal');
            pulse(key(e.target), s.fxHeal, 700);
          } else if (e.k === 'shield') {
            float(`unit-${e.uid}`, 'Shield broken', 'info');
          } else if (e.k === 'freeze') {
            pulse(`unit-${e.uid}`, s.fxFreeze, 700);
          } else if (e.k === 'fatigue') {
            float(`hero-${e.side}`, 'Fatigue', 'info');
          } else if (e.k === 'burn') {
            float(`hero-${e.side}`, 'Card burned', 'info');
          } else if (e.k === 'death' || e.k === 'bounce') {
            const exit = e.k;
            const uid = e.uid;
            at(reduce ? 0 : 450, () => setFx(f => ({ ...f, ghosts: f.ghosts.map(g => (g.unit.uid === uid ? { ...g, exit } : g)) })));
            at(reduce ? 0 : 1100, () => setFx(f => ({ ...f, ghosts: f.ghosts.filter(g => g.unit.uid !== uid) })));
          }
        }
      });
    });
    const done = (starts[starts.length - 1] ?? 0) + (reduce ? 0 : 1400);
    at(done, () => setFx(f => ({ ...f, busy: false, ghosts: [], pending: [], hiddenHand: [] })));
  }, [v]);

  return fx;
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

function readCoach(): boolean {
  try {
    return window.localStorage.getItem(COACH_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writeCoach(on: boolean) {
  try {
    window.localStorage.setItem(COACH_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the tips just come back next time.
  }
}

/** The duel board. The page owns the match hook, so it can pick a board by ruleset. */
export default function Battle({ ctl }: { ctl: ReturnType<typeof useDuelMatch> }) {
  const { match, error, pending, send, skew, clearError } = ctl;
  const [sel, setSel] = useState<Selection>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [replace, setReplace] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const [resultSeen, setResultSeen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [rules, setRules] = useState(false);
  const [coach, setCoach] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const v = match?.view ?? null;
  const fx = useBattleFx(v);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => setCoach(readCoach()), []);

  // A selection does not survive the board changing under it.
  useEffect(() => setSel(null), [match?.version]);

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

  // Keep the log pinned to the newest line.
  const logLen = v ? v.logBase + v.log.length : 0;
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logLen]);

  const card = useMemo(() => (slug: string) => defOf(slug, v?.extraDefs), [v?.extraDefs]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    if (!v) return m;
    for (const e of v.log) if ('uid' in e && 'slug' in e) m.set(e.uid, card(e.slug).name);
    for (const p of v.players) for (const u of p.board) m.set(u.uid, card(u.slug).name);
    return m;
  }, [v, card]);

  if (!match || !v) {
    return (
      <div className={s.battle}>
        <div className={s.topBar}><div className={s.topTitle}><Link href="/duels"><ArrowLeft size={14} /> Duels</Link></div></div>
        <div className={s.table} style={{ gridColumn: '1 / -1', display: 'grid', placeItems: 'center' }}>
          <p style={{ color: 'var(--d-ink-2)' }}>{error ?? 'Shuffling decks...'}</p>
        </div>
      </div>
    );
  }

  const me = v.you;
  const foe = other(me);
  const mine = v.players[me];
  const theirs = v.players[foe];
  const myTurn = v.phase === 'main' && v.active === me;
  const hand = mine.hand ?? [];
  const practice = match.mode === 'practice';
  const myTank = tankOf(mine);
  const tankWhyNot = myTank ? tankBlocked(v, me, mine) : 'No Tank ability';

  // --- What the current selection can reach ---
  let targets: TargetRef[] = [];
  let hint = '';
  let selDef: CardDef | null = null;
  let canPlaySelected = false;
  if (sel && myTurn) {
    if (sel.kind === 'hand') {
      const c = hand.find(h => h.uid === sel.uid);
      if (c) {
        selDef = card(c.slug);
        const a = playOf(selDef);
        targets = a?.target ? specTargets(v, me, a.target) : [];
        canPlaySelected = selDef.cost <= mine.tide && mine.board.length < BOARD_SLOTS;
        hint = !canPlaySelected
          ? (selDef.cost > mine.tide ? `Not enough tide: ${selDef.name} costs ${selDef.cost}.` : 'Your board is full.')
          : targets.length ? `Choose a target for ${a?.name ?? 'its effect'}.` : 'Click your side of the board to play it.';
      }
    } else if (sel.kind === 'tank') {
      if (myTank?.target) targets = specTargets(v, me, myTank.target);
      hint = `Choose a target for ${myTank?.name ?? 'your tank'}.`;
    } else {
      const u = mine.board.find(x => x.uid === sel.uid);
      if (u) {
        selDef = card(u.slug);
        if (sel.kind === 'unit') {
          targets = attackTargets(v, me, u.uid);
          hint = targets.length ? `Choose what ${selDef.name} attacks.` : 'Nothing it can attack.';
        } else {
          const m = moveOf(selDef)!;
          targets = m.target ? specTargets(v, me, m.target, u.uid) : [];
          hint = m.target ? `Choose a target for ${m.name}.` : '';
        }
      }
    }
  }
  const isTarget = (t: TargetRef) => targets.some(x => sameTarget(x, t));

  function act(target: TargetRef) {
    if (!sel || !isTarget(target)) return;
    if (sel.kind === 'hand') send({ type: 'play', uid: sel.uid, target });
    else if (sel.kind === 'unit') send({ type: 'attack', uid: sel.uid, target });
    else if (sel.kind === 'tank') send({ type: 'tank', target });
    else send({ type: 'move', uid: sel.uid, target });
  }

  function clickHand(uid: string) {
    setFocus(hand.find(h => h.uid === uid)?.slug ?? null);
    if (!myTurn) return;
    setSel(sel?.kind === 'hand' && sel.uid === uid ? null : { kind: 'hand', uid });
  }

  function clickMine(uid: string) {
    const u = mine.board.find(x => x.uid === uid)!;
    setFocus(u.slug);
    const t: TargetRef = { kind: 'unit', uid };
    if (isTarget(t)) return act(t);
    if (!myTurn || !canAct(v!, u)) return setSel(null);
    setSel(sel?.uid === uid && sel.kind === 'unit' ? null : { kind: 'unit', uid });
  }

  function clickTheirs(uid: string) {
    const u = theirs.board.find(x => x.uid === uid)!;
    setFocus(u.slug);
    act({ kind: 'unit', uid });
  }

  function clickTank() {
    if (!myTank || tankWhyNot) return;
    if (sel?.kind === 'tank') return setSel(null);
    if (myTank.target) setSel({ kind: 'tank', uid: '' });
    else send({ type: 'tank' });
  }

  function playToLane() {
    if (sel?.kind === 'hand' && canPlaySelected && !targets.length) send({ type: 'play', uid: sel.uid });
  }

  const selectedUnit = sel && (sel.kind === 'unit' || sel.kind === 'move') ? mine.board.find(u => u.uid === sel.uid) : null;
  const move = selectedUnit ? moveOf(card(selectedUnit.slug)) : undefined;
  const canMove = !!selectedUnit && !!move && myTurn && canAct(v, selectedUnit) && (move.cost ?? 0) <= mine.tide
    && (!move.target || specTargets(v, me, move.target, selectedUnit.uid).length > 0);

  // --- What is left to do this turn (coach tips, End turn glow) ---
  const playable = (slug: string) => myTurn && card(slug).cost <= mine.tide && mine.board.length < BOARD_SLOTS;
  const anyPlayable = hand.some(h => playable(h.slug));
  const readyUnits = myTurn ? mine.board.filter(u => {
    if (!canAct(v, u)) return false;
    if (attackTargets(v, me, u.uid).length) return true;
    const m = moveOf(card(u.slug));
    return !!m && (m.cost ?? 0) <= mine.tide && (!m.target || specTargets(v, me, m.target, u.uid).length > 0);
  }) : [];
  const tankReady = myTurn && !tankWhyNot;
  const doneForTurn = myTurn && !anyPlayable && !readyUnits.length && !tankReady;

  const deadline = match.deadline ? Date.parse(match.deadline) : null;
  const left = deadline ? Math.max(0, Math.round((deadline - (now + skew)) / 1000)) : null;

  // With nothing hovered, the panel shows the last card played, so the
  // opponent's plays can be read without hunting for them.
  const lastPlayed = [...v.log].reverse().find(e => e.k === 'play');
  const focusDef = focus ? card(focus) : selDef ?? (lastPlayed && lastPlayed.k === 'play' ? card(lastPlayed.slug) : null);
  const peekDef = peek ? card(peek) : null;

  // --- Log: oldest first, split into turns ---
  const lines: { text: string; turn?: boolean; side?: Side; fresh: boolean }[] = [];
  v.log.forEach((e, i) => {
    const fresh = v.logBase + i >= fx.freshFrom;
    if (e.k === 'turn') lines.push({ text: `Turn ${e.turn} · ${e.side === me ? 'You' : v.players[e.side].name}`, turn: true, fresh });
    else {
      const t = describe(e, v, uid => names.get(uid) ?? 'A unit', card);
      if (t) lines.push({ text: t, side: 'side' in e ? e.side : undefined, fresh });
    }
  });

  const cls = (k: string) => (fx.anim[k] ?? []).join(' ');

  const tankButton = (side: Side, p: PlayerView) => {
    const a = tankOf(p);
    if (!a || !p.tank) return null;
    const el = ELEMENT_INFO[p.tank];
    const own = side === me;
    const why = own ? tankWhyNot : 'Opponent\'s Tank ability';
    const usable = own && !why;
    return (
      <button
        type="button"
        className={[s.tankBtn, usable ? s.tankReady : '', own && sel?.kind === 'tank' ? s.tankSelected : '', p.tankUsed ? s.tankUsed : ''].join(' ')}
        style={{ '--el': el.color } as CSSProperties}
        onClick={own ? clickTank : undefined}
        disabled={!usable && !(own && sel?.kind === 'tank')}
        title={`${a.name} (${a.cost ?? 0} tide): ${abilityText(a).text} Once a turn.${why && own ? ` ${why}.` : ''}`}
        aria-label={`${own ? 'Your' : `${p.name}'s`} Tank ability: ${a.name}, ${a.cost ?? 0} tide. ${abilityText(a).text}`}
      >
        <span className={s.tankGlyph}>{el.glyph}</span>
        <span className={s.tankCost}>{a.cost ?? 0}</span>
        <span className={s.tankName}>{a.name}</span>
      </button>
    );
  };

  const hero = (side: Side) => {
    const p = v.players[side];
    const t: TargetRef = { kind: 'hero', side };
    const targetable = isTarget(t);
    const active = v.phase === 'main' && v.active === side;
    return (
      <div className={s.heroBlock}>
        <button
          type="button"
          className={[
            s.heroPortrait,
            active ? s.heroActive : '',
            targetable ? (side === me ? s.heroAllyTarget : s.heroTarget) : '',
            cls(key(t)),
          ].join(' ')}
          style={p.tank ? { '--el': ELEMENT_INFO[p.tank].color } as CSSProperties : undefined}
          data-fx={key(t)}
          onClick={() => act(t)}
          disabled={!targetable}
          aria-label={`${p.name}'s tank, ${p.hp} health${targetable ? ', choose as target' : ''}`}
        >
          <Avatar uuid={p.avatar} />
          <span className={`${s.heroHp} ${p.hp <= 5 ? s.heroHpLow : ''}`}>{p.hp}</span>
          <Floats fx={fx} k={key(t)} />
        </button>
        {tankButton(side, p)}
        <div className={s.heroInfo}>
          <div className={s.heroName}>{side === me ? `${p.name} (you)` : p.name}</div>
          <div className={s.tideRow}>
            <Tide tide={p.tide} max={p.maxTide} />
          </div>
        </div>
      </div>
    );
  };

  const counters = (side: Side) => {
    const p = v.players[side];
    const own = side === me;
    return (
      <div className={s.counters}>
        {own && myTurn && mine.pearl ? (
          <button type="button" className={s.pearlBtn} onClick={() => send({ type: 'pearl' })} disabled={pending} title="+1 tide this turn. Once per game.">
            <span className={s.pearl} /> Use Pearl
          </button>
        ) : p.pearl ? (
          <span className={s.counter} title="Unused Pearl: +1 tide, once"><span className={s.pearl} /> <span className={s.counterWord}>Pearl</span></span>
        ) : null}
        {!own && <span className={s.counter} title="Cards in hand"><CardBack small /> {p.handCount}<span className={s.counterWord}>&nbsp;in hand</span></span>}
        <span className={s.counter} title="Cards left in deck"><CardBack small /> {p.deckCount}<span className={s.counterWord}>&nbsp;in deck</span></span>
      </div>
    );
  };

  const lane = (side: Side) => {
    const p = v.players[side];
    const own = side === me;
    const drop = own && sel?.kind === 'hand' && canPlaySelected && !targets.length;
    // The final board, with units that just left shown where they stood.
    const shown: { unit: Unit; ghost?: Ghost }[] = p.board.map(unit => ({ unit }));
    for (const g of fx.ghosts.filter(x => x.side === side).sort((a, b) => a.index - b.index)) {
      shown.splice(Math.min(g.index, shown.length), 0, { unit: g.unit, ghost: g });
    }
    return (
      <div className={`${s.laneWrap} ${own ? '' : s.sideFoe}`}>
        <div
          className={`${s.lane} ${drop ? s.laneDrop : ''}`}
          onClick={drop ? playToLane : undefined}
          aria-label={own ? 'Your board' : 'Opponent board'}
          role={drop ? 'button' : undefined}
        >
          {shown.map(({ unit: u, ghost }) => {
            const t: TargetRef = { kind: 'unit', uid: u.uid };
            const targeted = !ghost && isTarget(t);
            const hidden = fx.pending.includes(u.uid);
            return (
              <UnitTile
                key={u.uid}
                def={card(u.slug)}
                unit={u}
                fxKey={key(t)}
                ghost={!!ghost}
                frozen={v.turn <= u.frozenUntil}
                ready={!ghost && own && myTurn && canAct(v, u) && !sel}
                selected={own && sel?.uid === u.uid}
                target={targeted ? (own ? 'ally' : 'enemy') : undefined}
                className={[
                  cls(key(t)),
                  hidden ? s.fxPending : '',
                  ghost?.exit === 'death' ? s.fxDeath : ghost?.exit === 'bounce' ? s.fxBounce : '',
                ].join(' ')}
                floats={<Floats fx={fx} k={key(t)} />}
                onHover={() => { setFocus(u.slug); setPeek(u.slug); }}
                onLeave={() => setPeek(null)}
                onClick={ghost ? undefined : () => (own ? clickMine(u.uid) : clickTheirs(u.uid))}
              />
            );
          })}
          {drop && <div className={s.dropSlot}>Play here</div>}
          {!shown.length && !drop && <span className={s.laneEmpty}>{own ? 'Your side of the board' : `${theirs.name}'s side`}</span>}
        </div>
      </div>
    );
  };

  const needsMulligan = v.phase === 'mulligan' && !mine.mulliganed;
  const result = v.phase === 'over'
    ? v.winner === null ? 'Draw' : v.winner === me ? 'Victory' : 'Defeat'
    : null;

  // Beginner guidance, practice only, in the order a new player needs it.
  let tip: string | null = null;
  if (practice && coach && v.phase === 'main' && myTurn && !pending) {
    if (sel?.kind === 'hand') tip = targets.length ? 'This card has an effect: click one of the glowing targets to use it.' : canPlaySelected ? 'Now click your side of the board (the green area) to play it.' : null;
    else if (sel?.kind === 'unit') tip = targets.length ? 'Click a red-outlined enemy to attack. Both units hit each other at once. Guard units must be attacked first.' : null;
    else if (sel?.kind === 'tank' || sel?.kind === 'move') tip = 'Click one of the glowing targets.';
    else if (anyPlayable) tip = 'Cards with a green glow are affordable. Click one, then click your side of the board.';
    else if (readyUnits.length) tip = 'Units glowing green are ready. Click one, then click an enemy unit or tank to attack.';
    else if (tankReady) tip = `Spare tide? Your tank's ${myTank?.name} ability (next to your portrait) can be used once a turn.`;
    else tip = 'Nothing left to do. Press End turn: your tide refills and grows next turn.';
  }

  const hintText = pending ? 'Sending...' : hint || (!myTurn && v.phase === 'main' ? `${theirs.name} is playing...` : '');
  const turnWord =v.phase === 'mulligan' ? 'Opening hands' : v.phase === 'over' ? 'Duel over' : myTurn ? 'Your turn' : `${theirs.name}'s turn`;
  const handN = hand.length;

  return (
    <div className={s.battle}>
      <div className={s.topBar}>
        <div className={s.topTitle}>
          <Link href="/duels" aria-label="Back to duels"><ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> <span>Duels</span></Link>
          <h1>{practice ? 'Practice' : 'Duel'} vs {theirs.name}</h1>
        </div>
        <div className={s.topActions}>
          <button type="button" className={`${s.iconBtn} ${s.drawerBtn}`} onClick={() => setDrawer(true)}><ScrollText size={16} /> Details</button>
          <button type="button" className={s.iconBtn} onClick={() => setRules(true)} aria-label="Rules"><CircleHelp size={16} /> <span className={s.counterWord}>Rules</span></button>
          {practice && !coach && (
            <button type="button" className={s.iconBtn} onClick={() => { setCoach(true); writeCoach(true); }} title="Show beginner tips" aria-label="Show beginner tips"><Lightbulb size={16} /></button>
          )}
          {v.phase !== 'over' && (
            <button
              type="button"
              className={`${s.iconBtn} ${s.btnDanger}`}
              onClick={() => { if (confirm('Concede this duel?')) send({ type: 'concede' }); }}
              aria-label="Concede"
            ><Flag size={15} /> <span className={s.counterWord}>Concede</span></button>
          )}
        </div>
      </div>

      <div className={s.table}>
        <div className={s.sideRow}>
          {hero(foe)}
          <div className={s.foeHand} aria-label={`${theirs.name} holds ${theirs.handCount} cards`}>
            {Array.from({ length: theirs.handCount }, (_, i) => {
              const off = i - (theirs.handCount - 1) / 2;
              return <CardBack key={i} style={{ '--rot': `${-off * 4}deg`, '--y': `${-Math.abs(off) * 1.5}px` } as CSSProperties} />;
            })}
          </div>
          {counters(foe)}
        </div>

        {lane(foe)}

        <div className={s.center}>
          <span className={`${s.turnPill} ${myTurn ? s.turnPillMine : ''}`}>
            <span className={s.turnWord}>{turnWord}</span>
            {left !== null && v.phase !== 'over' && (
              <span className={`${s.clock} ${left <= 15 ? s.clockLow : ''}`}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
            )}
          </span>
          <span className={`${s.hint} ${!hintText && tip ? s.hintCoachOnly : ''} readable-font`} role="status">
            {hintText || tip}
          </span>
          <span className={s.actions}>
            {canMove && move && (
              <button
                type="button"
                className={s.moveBtn}
                disabled={pending}
                onClick={() => (move.target ? setSel({ kind: 'move', uid: selectedUnit!.uid }) : send({ type: 'move', uid: selectedUnit!.uid }))}
                title={abilityText(move).text}
              ><Sparkles size={14} /> {move.name} · {move.cost ?? 0}</button>
            )}
            <button
              type="button"
              className={`${s.endTurn} ${doneForTurn && !pending ? s.endTurnReady : ''}`}
              onClick={() => { setSel(null); send({ type: 'end_turn' }); }}
              disabled={!myTurn || pending}
            >{myTurn ? 'End turn' : v.phase === 'over' ? 'Game over' : 'Enemy turn'}</button>
          </span>
        </div>

        {lane(me)}

        <div className={`${s.sideRow} ${s.sideRowMine}`}>
          {hero(me)}
          <div className={s.handZone}>
            <div className={s.hand} aria-label="Your hand" style={{ '--n': handN, '--gaps': Math.max(1, handN - 1) } as CSSProperties}>
              {hand.map((h, i) => {
                const d = card(h.slug);
                const off = i - (handN - 1) / 2;
                const ok = playable(h.slug);
                const hidden = fx.hiddenHand.includes(h.uid);
                return (
                  <div
                    key={h.uid}
                    className={`${s.handSlot} ${fx.drawn.includes(h.uid) ? s.fxDraw : ''} ${hidden ? s.fxPending : ''}`}
                    style={{ '--rot': `${off * 3}deg`, '--y': `${Math.abs(off) ** 1.8 * 2.4}px`, '--z': i + 1 } as CSSProperties}
                  >
                    <CardFace
                      def={d}
                      selected={sel?.kind === 'hand' && sel.uid === h.uid}
                      playable={ok && !sel}
                      dim={myTurn && !ok}
                      onClick={() => clickHand(h.uid)}
                      onHover={() => setFocus(h.slug)}
                    />
                  </div>
                );
              })}
              {!handN && <span className={s.handEmpty}>No cards in hand</span>}
            </div>
          </div>
          {counters(me)}
        </div>

        {tip && (
          <div className={`${s.coach} readable-font`} role="note">
            <Lightbulb size={16} aria-hidden />
            <span style={{ flex: 1 }}>{tip}</span>
            <button type="button" className={s.coachClose} onClick={() => { setCoach(false); writeCoach(false); }} aria-label="Hide tips" title="Hide tips">
              <X size={15} />
            </button>
          </div>
        )}

        {peekDef && <div className={s.peek}><CardFace def={peekDef} large /></div>}

        {fx.banner && (
          <div key={fx.banner.id} className={`${s.turnBanner} ${fx.banner.mine ? '' : s.turnBannerFoe}`} aria-hidden>
            <span>{fx.banner.text}</span>
          </div>
        )}

        {error && (
          <div className={`${s.errorToast} readable-font`} role="alert">
            {error}
            <button type="button" className={s.coachClose} style={{ color: 'var(--d-err-ink)' }} onClick={clearError} aria-label="Dismiss"><X size={16} /></button>
          </div>
        )}
      </div>

      <aside className={`${s.side} ${drawer ? s.sideOpen : ''}`} aria-label="Card detail and battle log">
        <div className={`${s.sidePanel} ${s.detail}`}>
          {drawer && (
            <button type="button" className={s.coachClose} style={{ alignSelf: 'flex-end', color: 'var(--d-ink-2)' }} onClick={() => setDrawer(false)} aria-label="Close"><X size={18} /></button>
          )}
          {focusDef ? <CardFace def={focusDef} large /> : <div className={`${s.detailEmpty} readable-font`}>Hover or tap any card to read it here.</div>}
          {focusDef && moveOf(focusDef) && (
            <p className={`${s.detailNote} readable-font`}>A move is used instead of attacking, and costs tide.</p>
          )}
        </div>
        <div className={`${s.sidePanel} ${s.logPanel}`}>
          <div className={s.logTitle}><span>Battle log</span><span className={s.clock} style={{ fontSize: '0.8rem' }}>Turn {v.turn}</span></div>
          <div ref={logRef} className={`${s.log} readable-font`}>
            {lines.map((l, i) => (
              <div
                key={i}
                className={l.turn ? s.logTurn : `${s.logLine} ${l.side === me ? s.logMine : l.side === foe ? s.logFoe : ''} ${l.fresh ? s.logFresh : ''}`}
              >{l.text}</div>
            ))}
          </div>
        </div>
      </aside>

      {needsMulligan && (
        <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Opening hand">
          <div className={s.dialog}>
            <h2>Your opening hand</h2>
            <p className={`${s.muted} readable-font`}>
              {v.first === me ? 'You go first (and skip your first draw).' : 'You go second: one extra card and the Pearl (+1 tide, once).'}{' '}
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
            <button
              type="button"
              className={s.endTurn}
              disabled={pending}
              onClick={() => send({ type: 'mulligan', replace: [...replace] })}
            >{replace.size ? `Replace ${replace.size} and start` : 'Keep hand'}</button>
          </div>
        </div>
      )}

      {v.phase === 'mulligan' && mine.mulliganed && (
        <div className={s.overlay}>
          <div className={s.dialog}><p>Waiting for {theirs.name} to choose their opening hand...</p></div>
        </div>
      )}

      {result && !resultSeen && !fx.busy && (
        <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Result">
          <div className={s.dialog} style={{ width: 'min(520px, 100%)' }}>
            <div className={`${s.result} ${result !== 'Victory' ? s.resultDefeat : ''}`}>{result}</div>
            <p className={`${s.muted} readable-font`}>
              {result === 'Draw' ? 'Nobody wins this one.' : `${result === 'Victory' ? 'You beat' : 'You lost to'} ${theirs.name}${REASONS[v.endReason ?? 'hero'] ?? ''}.`}
            </p>
            <div className={s.row} style={{ justifyContent: 'center' }}>
              <Link href="/duels" className={`${s.btn} ${s.btnPrimary}`}>Back to duels</Link>
              <button type="button" className={s.btn} onClick={() => setResultSeen(true)}>View board</button>
            </div>
          </div>
        </div>
      )}

      {rules && (
        <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Rules" onClick={() => setRules(false)}>
          <div className={`${s.dialog} ${s.rulesSheet}`} onClick={e => e.stopPropagation()}>
            <div className={s.row} style={{ justifyContent: 'space-between', width: '100%' }}>
              <h2>How duels work</h2>
              <button type="button" className={s.coachClose} style={{ color: 'var(--d-ink-2)' }} onClick={() => setRules(false)} aria-label="Close"><X size={20} /></button>
            </div>
            <QuickRules />
            <Link href="/duels?tab=guide" className={s.btn} target="_blank">Open the full guide</Link>
          </div>
        </div>
      )}
    </div>
  );
}
