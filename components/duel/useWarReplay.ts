'use client';

// Plays a round's reveal (warReplay.ts) one step at a time.
//
// Each step has two stages: 'cue' (the board as it was, with the actor and
// its target marked: who is about to act) and 'hit' (the board after it, with
// the damage shown and explained). Playback walks cue -> hit -> next cue on
// timers; Pause stops it, Next and Back step by hand, Skip ends it.
//
// The reveal never blocks planning. mode 'board' shows the rebuilt board;
// 'corner' keeps narrating in a compact bar while the live board is planned
// on; 'off' is the live board with no reveal.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CardDef, WarView } from '@/lib/duel/war/client';
import { buildReplay, type Replay, type ReplayStep } from './warReplay';

export type ReplaySpeed = 'slow' | 'normal' | 'fast';
export type ReplayMode = 'board' | 'corner' | 'off';
export type Stage = 'cue' | 'hit';

const SPEED_KEY = 'war-replay-speed';
const SPEED_MULT: Record<ReplaySpeed, number> = { slow: 1.6, normal: 1, fast: 0.55 };

/** Normal-speed timings (ms): how long a step is announced, then how long its result holds. */
const TIMING: Record<ReplayStep['kind'], [cue: number, hold: number]> = {
  stance: [400, 1700],
  switch: [550, 1350],
  shift: [550, 1350],
  deploy: [550, 1300],
  action: [750, 1550],
  counter: [500, 1350],
  upkeep: [400, 1900],
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
  /** A manual Next: the cue auto-advances to its hit once, even when paused. */
  stepping: boolean;
  /** Bumped on every step change so repeat animations restart. */
  tick: number;
}

const NONE: ReplayState = { replay: null, idx: 0, stage: 'cue', playing: false, mode: 'off', stepping: false, tick: 0 };

export function useWarReplay(v: WarView | null, card: (slug: string) => CardDef) {
  const [st, setSt] = useState<ReplayState>(NONE);
  const stRef = useRef(st);
  stRef.current = st;
  const [speed, setSpeedState] = useState<ReplaySpeed>('normal');
  const [reduce, setReduce] = useState(false);
  /** The log position the newest reveal starts from (the war log highlights from here). */
  const [freshFrom, setFreshFrom] = useState(Infinity);
  /** Set when a reveal ends by itself or is skipped: the round tally shows for a moment. */
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const seen = useRef<number | null>(null);
  const prev = useRef<WarView | null>(null);
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

  const setSpeed = useCallback((s: ReplaySpeed) => {
    setSpeedState(s);
    try { window.localStorage.setItem(SPEED_KEY, s); } catch { /* storage blocked */ }
  }, []);

  // A new view: if it carries a resolved round we have not shown, build its reveal.
  useLayoutEffect(() => {
    if (!v) return;
    const end = v.logBase + v.log.length;
    const last = seen.current;
    const before = prev.current;
    seen.current = end;
    prev.current = v;
    if (last === null || !before || end <= last) return;
    const fresh = v.log.slice(Math.max(0, last - v.logBase));
    let replay: Replay | null = null;
    try {
      replay = buildReplay(last, before, v, fresh, cardRef.current);
    } catch (e) {
      console.warn('[war replay] could not build the reveal', e);
    }
    setFreshFrom(last);
    if (!replay || !replay.steps.length) return;
    if (!replay.ok) console.warn('[war replay] rebuilt board diverges from the server view; showing the final board.', replay.mismatch);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setEndedAt(null);
    setSt(s => ({ replay, idx: 0, stage: still ? 'hit' : 'cue', playing: !still, mode: 'board', stepping: false, tick: s.tick + 1 }));
  }, [v]);

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
      const t = window.setTimeout(() => setSt(s => ({ ...s, stage: 'hit', stepping: false, tick: s.tick + 1 })), (st.stepping ? Math.min(cue, 600) : cue) * mult);
      return () => clearTimeout(t);
    }
    if (st.stage === 'hit' && st.playing) {
      const t = window.setTimeout(() => {
        if (st.idx >= r.steps.length - 1) finish();
        else setSt(s => ({ ...s, idx: s.idx + 1, stage: reduce ? 'hit' : 'cue', tick: s.tick + 1 }));
      }, hold * mult);
      return () => clearTimeout(t);
    }
  }, [st.replay, st.idx, st.stage, st.playing, st.stepping, st.mode, speed, reduce, finish]);

  // The tally shows for a few seconds after a reveal ends.
  useEffect(() => {
    if (endedAt === null) return;
    const t = window.setTimeout(() => setEndedAt(null), 4500);
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
  /** Watch from a step (0: the whole round again). */
  const watch = useCallback((from = 0, autoplay = true) => setSt(s => (s.replay ? {
    ...s, mode: 'board', idx: Math.max(0, Math.min(from, s.replay.steps.length - 1)),
    stage: reduce || !autoplay ? 'hit' : 'cue', playing: autoplay && !reduce, stepping: false, tick: s.tick + 1,
  } : s)), [reduce]);
  /** Back to the board replay at the current step. */
  const resume = useCallback(() => setSt(s => ({ ...s, mode: 'board' })), []);
  const toCorner = useCallback(() => setSt(s => ({ ...s, mode: 'corner' })), []);

  return {
    st, speed, setSpeed, reduce, freshFrom, endedAt,
    step: st.replay && st.mode !== 'off' ? st.replay.steps[st.idx] ?? null : null,
    play, pause, next, back, skip: finish, watch, resume, toCorner,
  };
}
