'use client';

// Plays the opponent's turn (gridReplay.ts) one step at a time, like
// useWarReplay does for a war round.
//
// Each step has two stages: 'cue' (the board as it was, the actor and its
// target marked) and 'hit' (the board after it, with the damage shown and
// explained). Playback walks cue -> hit -> next cue on timers; Pause stops
// it, Next and Back step by hand, Skip ends it.
//
// What gets replayed: everything since the last board you acted on. In
// practice that is your end-of-turn claims, the bot's whole turn and your
// own upkeep, all in one response. In a friendly the opponent's orders
// arrive by polling in chunks: each chunk extends the same replay (its
// anchor is the last view from your own turn), so the recap covers the whole
// turn and playback picks up where it left off.
//
// Your own orders are not replayed; their results flash on the live board
// (`flash`).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CardDef, GridEvent, GridUnit, GridView } from '@/lib/duel/grid/client';
import { buildReplay, type Replay, type ReplayStep } from './gridReplay';

export type ReplaySpeed = 'slow' | 'normal' | 'fast';
export type ReplayMode = 'board' | 'off';
export type Stage = 'cue' | 'hit';

const SPEED_KEY = 'grid-replay-speed';
const SPEED_MULT: Record<ReplaySpeed, number> = { slow: 1.6, normal: 1, fast: 0.5 };

/** Normal-speed timings (ms): how long a step is announced, then how long its result holds. */
const TIMING: Record<ReplayStep['kind'], [cue: number, hold: number]> = {
  upkeep: [350, 1500],
  hqfire: [550, 1500],
  deploy: [500, 1250],
  move: [650, 1150],
  attack: [700, 1800],
  ability: [600, 1500],
  hq: [600, 1500],
  brace: [400, 1000],
  claim: [500, 1700],
  endturn: [300, 800],
  end: [400, 2200],
};

function loadSpeed(): ReplaySpeed {
  try {
    const x = window.localStorage.getItem(SPEED_KEY);
    if (x === 'slow' || x === 'normal' || x === 'fast') return x;
  } catch { /* storage blocked */ }
  return 'normal';
}

export interface ReplayState {
  replay: Replay | null;
  idx: number;
  stage: Stage;
  playing: boolean;
  mode: ReplayMode;
  stepping: boolean;
  tick: number;
}

const NONE: ReplayState = { replay: null, idx: 0, stage: 'cue', playing: false, mode: 'off', stepping: false, tick: 0 };

/** Does this batch of events need a replay (anything beyond the results of your own order)? */
function needsReplay(fresh: GridEvent[], anchor: GridView): boolean {
  if (anchor.phase === 'main' && anchor.active !== anchor.you) return fresh.length > 0;
  return fresh.some(e => e.k === 'end_turn' || (e.k === 'turn' && e.side !== anchor.you));
}

export function useGridReplay(v: GridView | null, card: (slug: string) => CardDef) {
  const [st, setSt] = useState<ReplayState>(NONE);
  const stRef = useRef(st);
  stRef.current = st;
  const [speed, setSpeedState] = useState<ReplaySpeed>('normal');
  const [reduce, setReduce] = useState(false);
  /** The log position the newest replay starts from (the log highlights from here). */
  const [freshFrom, setFreshFrom] = useState(Infinity);
  /** Set when a replay ends by itself or is skipped: the turn tally shows for a moment. */
  const [endedAt, setEndedAt] = useState<number | null>(null);
  /** Your own order's events, flashed on the live board. */
  const [flash, setFlash] = useState<{ events: GridEvent[]; gone: GridUnit[]; key: number } | null>(null);
  const seen = useRef<number | null>(null);
  const anchor = useRef<{ view: GridView; pos: number } | null>(null);
  const cardRef = useRef(card);
  cardRef.current = card;

  useEffect(() => {
    setSpeedState(loadSpeed());
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  const setSpeed = useCallback((sp: ReplaySpeed) => {
    setSpeedState(sp);
    try { window.localStorage.setItem(SPEED_KEY, sp); } catch { /* storage blocked */ }
  }, []);

  useLayoutEffect(() => {
    if (!v) return;
    const end = v.logBase + v.log.length;
    const last = seen.current;
    seen.current = end;
    const a = anchor.current;
    const mineNow = v.phase !== 'main' || v.active === v.you;
    if (last === null || !a || end <= last) {
      anchor.current = { view: v, pos: end };
      return;
    }
    const fresh = v.log.slice(Math.max(0, last - v.logBase));
    if (!needsReplay(fresh, a.view)) {
      // Your own order: flash its results, and act from this board next.
      anchor.current = { view: v, pos: end };
      if (fresh.length) {
        const gone = a.view.units.filter(u => !v.units.some(x => x.uid === u.uid));
        setFlash(f => ({ events: fresh, gone, key: (f?.key ?? 0) + 1 }));
      }
      return;
    }
    const all = v.log.slice(Math.max(0, a.pos - v.logBase));
    let replay: Replay | null = null;
    try {
      replay = buildReplay(a.pos, a.view, v, all, cardRef.current);
    } catch (e) {
      console.warn('[grid replay] could not build the replay', e);
    }
    // The next replay starts from here once it is your turn again.
    if (mineNow) anchor.current = { view: v, pos: end };
    setFreshFrom(a.pos);
    if (!replay || !replay.steps.length) return;
    if (!replay.ok) console.warn('[grid replay] rebuilt board diverges from the server view; showing the final board.', replay.mismatch);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setEndedAt(null);
    setSt(s => {
      // The same turn, extended by a new chunk: keep going from where it was.
      if (s.replay && s.replay.id === replay!.id) {
        const done = s.mode === 'off' || (s.idx >= s.replay.steps.length - 1 && s.stage === 'hit');
        const idx = done ? Math.min(s.replay.steps.length, replay!.steps.length - 1) : s.idx;
        return { ...s, replay, idx, stage: done ? (still ? 'hit' : 'cue') : s.stage, mode: 'board', playing: done ? !still : s.playing, tick: s.tick + 1 };
      }
      return { replay, idx: 0, stage: still ? 'hit' : 'cue', playing: !still, mode: 'board', stepping: false, tick: s.tick + 1 };
    });
  }, [v]);

  // Flashes clear themselves.
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const finish = useCallback(() => {
    setSt(s => (s.replay ? { ...s, mode: 'off', playing: false, stepping: false, idx: s.replay.steps.length - 1, stage: 'hit', tick: s.tick + 1 } : s));
    setEndedAt(Date.now());
  }, []);

  // The playback clock.
  useEffect(() => {
    const r = st.replay;
    if (!r || st.mode === 'off') return;
    const step = r.steps[st.idx];
    if (!step) return;
    const mult = SPEED_MULT[speed];
    const [cue, hold] = TIMING[step.kind];
    if (st.stage === 'cue' && (st.playing || st.stepping)) {
      const t = window.setTimeout(() => setSt(s => ({ ...s, stage: 'hit', stepping: false, tick: s.tick + 1 })), (st.stepping ? Math.min(cue, 500) : cue) * mult);
      return () => clearTimeout(t);
    }
    if (st.stage === 'hit' && st.playing) {
      const t = window.setTimeout(() => {
        if (st.idx >= r.steps.length - 1) {
          // Mid-turn in a friendly, more may be coming: hold on the last step.
          if (r.final.phase === 'main' && r.final.active !== r.final.you) setSt(s => ({ ...s, playing: false }));
          else finish();
        } else setSt(s => ({ ...s, idx: s.idx + 1, stage: reduce ? 'hit' : 'cue', tick: s.tick + 1 }));
      }, hold * mult);
      return () => clearTimeout(t);
    }
  }, [st.replay, st.idx, st.stage, st.playing, st.stepping, st.mode, speed, reduce, finish]);

  useEffect(() => {
    if (endedAt === null) return;
    const t = window.setTimeout(() => setEndedAt(null), 5000);
    return () => clearTimeout(t);
  }, [endedAt]);

  const play = useCallback(() => setSt(s => {
    if (!s.replay) return s;
    if (s.mode === 'off' || (s.idx >= s.replay.steps.length - 1 && s.stage === 'hit')) {
      return { ...s, mode: 'board', idx: 0, stage: reduce ? 'hit' : 'cue', playing: true, stepping: false, tick: s.tick + 1 };
    }
    return { ...s, playing: true };
  }), [reduce]);
  const pause = useCallback(() => setSt(s => ({ ...s, playing: false, stepping: false })), []);
  const next = useCallback(() => {
    const cur = stRef.current;
    if (!cur.replay) return;
    if (cur.stage === 'hit' && cur.idx >= cur.replay.steps.length - 1) { finish(); return; }
    setSt(s => {
      if (!s.replay) return s;
      if (s.stage === 'cue') return { ...s, stage: 'hit', stepping: false, tick: s.tick + 1 };
      if (s.idx >= s.replay.steps.length - 1) return s;
      return { ...s, idx: s.idx + 1, stage: reduce ? 'hit' : 'cue', stepping: !reduce, tick: s.tick + 1 };
    });
  }, [reduce, finish]);
  const back = useCallback(() => setSt(s => {
    if (!s.replay) return s;
    if (s.stage === 'hit' && !reduce) return { ...s, stage: 'cue', playing: false, stepping: false, tick: s.tick + 1 };
    if (s.idx === 0) return { ...s, stage: reduce ? 'hit' : 'cue', playing: false, stepping: false };
    return { ...s, idx: s.idx - 1, stage: 'hit', playing: false, stepping: false, tick: s.tick + 1 };
  }), [reduce]);
  /** Watch from a step (0: the whole turn again). */
  const watch = useCallback((from = 0, autoplay = true) => setSt(s => (s.replay ? {
    ...s, mode: 'board', idx: Math.max(0, Math.min(from, s.replay.steps.length - 1)),
    stage: reduce || !autoplay ? 'hit' : 'cue', playing: autoplay && !reduce, stepping: false, tick: s.tick + 1,
  } : s)), [reduce]);

  return {
    st, speed, setSpeed, reduce, freshFrom, endedAt, flash,
    step: st.replay && st.mode !== 'off' ? st.replay.steps[st.idx] ?? null : null,
    play, pause, next, back, skip: finish, watch,
  };
}
