"use client";

/**
 * Recruitment (TAQ-140): exec members clock in and out of pfinder recruiting
 * and log the guild's shouts, and the guild applications that come in show
 * alongside as the result. The calendar opens on the week, which draws each
 * session at the times it covered and each shout and application at the
 * minute it happened; the month view zooms out to each day's totals.
 *
 * Days, times and totals are in the viewer's own time zone, or UTC if they
 * pick it (remembered in this browser). The shout limit is the guild's, so it
 * always counts UTC days.
 */

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { fetcher } from '@/hooks/fetcher';
import {
  MAX_SESSION_HOURS, MESSAGE_LIMITS, SHADE_LEGEND, SHOUTS_PER_DAY, calendarDays, cleanMessage, formatDuration, messageLength,
  nextUtcMidnight, shadeStep, utcDay,
  type Application, type CalendarDays, type DaySummary, type MessageKind, type PfinderSession, type RecruitmentMessage, type Shout,
} from '@/lib/recruitment';

interface Data {
  /** the range served, as ISO times */
  from: string; to: string;
  sessions: PfinderSession[]; shouts: Shout[]; applications: Application[];
  open: PfinderSession[]; today: Shout[]; recent: Shout[]; messages: RecruitmentMessage[];
  me: { discord_id: string; can_manage: boolean };
}

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.75rem', padding: '1rem' };
const input: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)', borderRadius: '0.375rem',
  padding: '0.45rem 0.65rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
};
const btn = (bg: string): React.CSSProperties => ({
  padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer',
  fontSize: '0.8rem', fontWeight: 600, background: bg, color: '#fff',
});
const navBtn: React.CSSProperties = { ...btn('var(--bg-primary)'), color: 'var(--text-primary)', border: '1px solid var(--border-card)' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.78rem', textDecoration: 'underline' };
const h2: React.CSSProperties = { fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.6rem' };
const muted: React.CSSProperties = { fontSize: '0.78rem', color: 'var(--text-muted)' };
const subhead: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', margin: '0.75rem 0 0.3rem' };
const SHADES = ['var(--chart-empty)', 'var(--chart-seq-1)', 'var(--chart-seq-2)', 'var(--chart-seq-3)', 'var(--chart-seq-4)', 'var(--chart-seq-5)'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SESSION_FILL = 'color-mix(in srgb, var(--chart-seq-3) 28%, var(--bg-card-solid))';
const APP_COLOR = 'var(--color-ocean-400)';
const TZ_STORAGE_KEY = 'exec_recruitment_tz';

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? 'Something went wrong');
  return j;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The viewer's zone, as short as the browser can say it ('PDT', 'GMT+2') */
const localZoneName = () =>
  new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? 'local time';

/** The day helpers for the zone shown, and the formatting that goes with them. */
function makeClock(utc: boolean) {
  const cal = calendarDays(utc);
  const dateFmt = (day: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(cal.dayStart(day)).toLocaleDateString('en-US', { ...opts, timeZone: utc ? 'UTC' : undefined });
  return {
    ...cal,
    zone: utc ? 'UTC' : localZoneName(),
    // <input type="datetime-local"> has no zone of its own; it shows and means the zone the page is in
    toInput: (ms: number) => `${cal.day(ms)}T${cal.time(ms)}`,
    fromInput: (v: string) => (utc ? new Date(`${v}Z`) : new Date(v)).toISOString(),
    iso: (day: string) => new Date(cal.dayStart(day)).toISOString(),
    dateFmt,
    monthLabel: (month: string) => dateFmt(`${month}-01`, { month: 'long', year: 'numeric' }),
    dayLabel: (day: string) => dateFmt(day, { weekday: 'long', month: 'long', day: 'numeric' }),
    weekLabel: (start: string) => {
      const end = cal.addDays(start, 6);
      const sameMonth = start.slice(0, 7) === end.slice(0, 7);
      return `${dateFmt(start, { month: 'short', day: 'numeric' })} – ${dateFmt(end, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}, ${end.slice(0, 4)}`;
    },
  };
}
type Clock = CalendarDays & ReturnType<typeof makeClock>;

const ClockContext = createContext<Clock>(makeClock(false));
const useClock = () => useContext(ClockContext);

type Run = (fn: () => Promise<string>) => Promise<void>;
type View = 'week' | 'month';

/** The days the calendar shows: the week, or the month's whole grid including its neighbours' days. */
function visibleRange(clock: Clock, view: View, anchor: string): { from: string; to: string } {
  if (view === 'week') {
    const from = clock.weekStart(anchor);
    return { from, to: clock.addDays(from, 7) };
  }
  const weeks = clock.monthWeeks(anchor.slice(0, 7));
  return { from: weeks[0][0], to: clock.addDays(weeks.at(-1)![6], 1) };
}

export default function RecruitmentPage() {
  const [utc, setUtc] = useState(false);
  const [view, setView] = useState<View>('week');
  // The day the calendar is on; its week or month is what's shown
  const [anchor, setAnchor] = useState(() => calendarDays(false).day(Date.now()));
  // Resolved after mount: the server can't read this browser's choice, and
  // guessing during render would desync hydration. Opening in UTC starts on
  // the UTC today, which can be a day ahead of or behind the local one.
  useEffect(() => {
    let saved = false;
    try { saved = localStorage.getItem(TZ_STORAGE_KEY) === 'utc'; } catch { /* storage blocked: local time */ }
    if (saved) {
      setUtc(true);
      setAnchor(calendarDays(true).day(Date.now()));
    }
  }, []);
  const chooseUtc = (next: boolean) => {
    setUtc(next);
    try { localStorage.setItem(TZ_STORAGE_KEY, next ? 'utc' : 'local'); } catch { /* private mode: still works for this visit */ }
  };
  const clock = useMemo(() => makeClock(utc), [utc]);
  const { from, to } = visibleRange(clock, view, anchor);
  const { data, error, mutate } = useSWR<Data>(
    `/api/exec/recruitment?from=${clock.iso(from)}&to=${clock.iso(to)}`, fetcher, { refreshInterval: 30000, keepPreviousData: true });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Open sessions count up to now; tick so the durations and the calendar move.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const run: Run = async fn => {
    setBusy(true); setMessage(null);
    try { setMessage({ ok: true, text: await fn() }); await mutate(); setNow(Date.now()); }
    catch (e: any) { setMessage({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };
  // The result floats over the page rather than pushing it down; a success
  // clears itself, an error stays until it's read and closed
  useEffect(() => {
    if (!message?.ok) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  if (error) return <div style={{ color: '#ef4444', padding: '2rem' }}>Failed to load recruitment: {error.message}</div>;

  return (
    <ClockContext.Provider value={clock}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem 1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 24rem', display: 'flex', alignItems: 'baseline', gap: '0.25rem 1rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Recruitment</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
              Clock in while you pfinder, log each shout as it goes out; applications show when they were submitted.
            </p>
          </div>
          <div role="radiogroup" aria-label="Show times in" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={muted}>Times:</span>
            <div style={{ display: 'flex', border: '1px solid var(--border-card)', borderRadius: '0.375rem', overflow: 'hidden' }}>
              {[false, true].map(u => (
                <button key={String(u)} role="radio" aria-checked={utc === u} onClick={() => chooseUtc(u)}
                  style={{ ...btn(utc === u ? 'var(--chart-tile-active)' : 'var(--bg-primary)'), borderRadius: 0, color: 'var(--text-primary)', fontWeight: utc === u ? 700 : 500 }}>
                  {u ? 'UTC' : `Local (${localZoneName()})`}
                </button>
              ))}
            </div>
          </div>
        </div>
        {message && (
          <div role="status" style={{
            ...card, background: 'var(--bg-card-solid)', position: 'fixed', right: '1rem', bottom: '1rem', zIndex: 50, maxWidth: 'min(28rem, calc(100vw - 2rem))',
            padding: '0.6rem 0.8rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            color: message.ok ? '#22c55e' : '#ef4444', borderColor: message.ok ? '#22c55e88' : '#ef444488', fontSize: '0.85rem',
          }}>
            <span>{message.text}</span>
            <button aria-label="Dismiss" onClick={() => setMessage(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1 }}>×</button>
          </div>
        )}
        {!data ? <section style={{ ...card, height: '14rem', opacity: 0.6 }} /> : (
          <div className="recruitment-layout">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: 0 }}>
              <Pfinder data={data} now={now} busy={busy} run={run} />
              <Shouts data={data} now={now} busy={busy} run={run} />
              <ShoutHistory data={data} busy={busy} run={run} />
            </div>
            <Calendar data={data} view={view} setView={setView} anchor={anchor} setAnchor={setAnchor}
              range={{ from, to }} now={now} busy={busy} run={run} />
          </div>
        )}
      </div>
    </ClockContext.Provider>
  );
}

function Pfinder({ data, now, busy, run }: { data: Data; now: number; busy: boolean; run: Run }) {
  const clock = useClock();
  const mine = data.open.find(s => s.discord_id === data.me.discord_id);
  const [other, setOther] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const openTime = (s: PfinderSession) => now - Date.parse(s.started_at);

  const reset = () => { setOther(false); setStart(''); setEnd(''); };

  return (
    <section style={card}>
      <h2 style={h2}>Pfinder</h2>
      {mine ? (
        <>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.6rem' }}>
            You&rsquo;re clocked in since <b>{clock.time(mine.started_at)}</b>{clock.day(mine.started_at) !== clock.day(now) && ` on ${clock.day(mine.started_at)}`} · {formatDuration(openTime(mine))}
          </div>
          {openTime(mine) > 12 * 3_600_000 && (
            <div style={{ fontSize: '0.78rem', color: '#eab308', marginBottom: '0.6rem' }}>
              That&rsquo;s a long session. If you forgot to clock out, set when you actually stopped.
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={btn('#ef4444')} disabled={busy}
              onClick={() => run(async () => { await send('/api/exec/recruitment/pfinder', 'POST', { action: 'out' }); return 'Clocked out.'; })}>Clock out</button>
            <button style={linkBtn} onClick={() => { setOther(!other); setEnd(clock.toInput(Date.now())); }}>Stopped earlier?</button>
          </div>
          {other && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.6rem' }}>
              <label style={muted}>Stopped at ({clock.zone}) <input type="datetime-local" style={input} value={end} onChange={e => setEnd(e.target.value)} /></label>
              <button style={btn('#ef4444')} disabled={busy || !end}
                onClick={() => run(async () => {
                  await send('/api/exec/recruitment/pfinder', 'POST', { action: 'out', at: clock.fromInput(end) });
                  reset();
                  return `Clocked out at ${end.slice(11)} ${clock.zone}.`;
                })}>Clock out at this time</button>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={btn('#22c55e')} disabled={busy}
              onClick={() => run(async () => { await send('/api/exec/recruitment/pfinder', 'POST', { action: 'in' }); return 'Clocked in. Clock out here when you stop.'; })}>Clock in</button>
            <button style={linkBtn} onClick={() => { setOther(!other); setStart(clock.toInput(Date.now() - 3_600_000)); setEnd(clock.toInput(Date.now())); }}>
              Forgot to clock in? Log a past session
            </button>
          </div>
          {other && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.6rem' }}>
              <label style={muted}>From ({clock.zone}) <input type="datetime-local" style={input} value={start} onChange={e => setStart(e.target.value)} /></label>
              <label style={muted}>To <input type="datetime-local" style={input} value={end} onChange={e => setEnd(e.target.value)} /></label>
              <button style={btn('#3b82f6')} disabled={busy || !start || !end}
                onClick={() => run(async () => {
                  await send('/api/exec/recruitment/pfinder', 'POST', { action: 'log', started_at: clock.fromInput(start), ended_at: clock.fromInput(end) });
                  reset();
                  return 'Logged the session.';
                })}>Log session</button>
              <span style={muted}>Up to {MAX_SESSION_HOURS} hours.</span>
            </div>
          )}
        </>
      )}

      <SavedMessage kind="pfinder" data={data} busy={busy} run={run} />

      <div style={subhead}>On now</div>
      {data.open.length === 0 ? <div style={muted}>Nobody is clocked in.</div> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {data.open.map(s => (
            <li key={s.id} style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              <span style={{ display: 'inline-block', width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: '#22c55e', marginRight: '0.4rem' }} />
              {s.ign} <span style={muted}>since {clock.time(s.started_at)} · {formatDuration(openTime(s))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Shouts({ data, now, busy, run }: { data: Data; now: number; busy: boolean; run: Run }) {
  const clock = useClock();
  const [earlier, setEarlier] = useState(false);
  const [at, setAt] = useState('');
  // The limit counts UTC days whatever the page shows, and follows the clock:
  // at 00:00 UTC the count resets before the next refresh
  const today = data.today.filter(s => utcDay(s.shouted_at) === utcDay(now));
  const left = SHOUTS_PER_DAY - today.length;
  const reset = clock.utc ? '00:00 UTC' : `${clock.time(nextUtcMidnight(now))} (00:00 UTC)`;

  return (
    <section style={card}>
      <h2 style={h2}>Shouts today</h2>
      <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.6rem' }}>
        <b>{today.length}</b> of {SHOUTS_PER_DAY} used · resets in {formatDuration(nextUtcMidnight(now) - now)}, at {reset}
      </div>
      {/* one slot per shout, side by side; hover a used one for the full name */}
      <ol style={{ listStyle: 'none', margin: '0 0 0.6rem', padding: 0, display: 'grid', gridTemplateColumns: `repeat(${SHOUTS_PER_DAY}, minmax(0, 1fr))`, gap: '0.3rem' }}>
        {Array.from({ length: SHOUTS_PER_DAY }, (_, i) => {
          const s = today[i];
          const tip = s ? `Shout ${i + 1} at ${clock.time(s.shouted_at)} by ${s.ign}` : `Shout ${i + 1}: not used`;
          return (
            <li key={i} title={tip} aria-label={tip} style={{
              display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.45rem', borderRadius: '0.375rem', minWidth: 0,
              border: `1px ${s ? 'solid' : 'dashed'} var(--border-card)`, fontSize: '0.78rem', color: s ? 'var(--text-primary)' : 'var(--text-muted)',
            }}>
              <span style={{ fontWeight: 700 }}>{i + 1}</span>
              {s ? (
                <>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b>{clock.time(s.shouted_at)}</b> {s.ign}</span>
                  <DeleteButton show={s.discord_id === data.me.discord_id || data.me.can_manage} busy={busy} label="Remove this shout"
                    onClick={() => run(async () => { await send(`/api/exec/recruitment/shouts/${s.id}`, 'DELETE'); return 'Removed the shout.'; })} />
                </>
              ) : 'open'}
            </li>
          );
        })}
      </ol>
      {left > 0 ? (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={btn('#3b82f6')} disabled={busy || (earlier && !at)}
              onClick={() => run(async () => {
                await send('/api/exec/recruitment/shouts', 'POST', { at: earlier ? clock.fromInput(at) : undefined });
                setEarlier(false);
                return 'Logged the shout.';
              })}>{earlier ? 'Log shout at this time' : 'Log shout now'}</button>
            <button style={linkBtn} onClick={() => { setEarlier(!earlier); setAt(clock.toInput(Date.now())); }}>{earlier ? 'Use current time' : 'Shouted earlier?'}</button>
          </div>
          {earlier && (
            <label style={{ ...muted, display: 'block', marginTop: '0.5rem' }}>
              Shouted at ({clock.zone}) <input type="datetime-local" style={input} value={at} onChange={e => setAt(e.target.value)} />
            </label>
          )}
        </>
      ) : (
        <div style={{ fontSize: '0.83rem', color: '#eab308' }}>All {SHOUTS_PER_DAY} of today&rsquo;s shouts are used. The next one is available at {reset}.</div>
      )}

      <SavedMessage kind="shout" data={data} busy={busy} run={run} />
    </section>
  );
}

/**
 * The latest shouts, newest first, under days in the zone shown. On wide
 * screens it fills the side column down to the calendar's bottom and scrolls.
 */
function ShoutHistory({ data, busy, run }: { data: Data; busy: boolean; run: Run }) {
  const clock = useClock();
  const byDay: [string, Shout[]][] = [];
  for (const s of data.recent) {
    const day = clock.day(s.shouted_at);
    if (byDay.at(-1)?.[0] === day) byDay.at(-1)![1].push(s);
    else byDay.push([day, [s]]);
  }

  return (
    <section style={{ ...card, flex: '1 1 0', minHeight: '12rem', display: 'flex', flexDirection: 'column' }}>
      <h2 style={h2}>Shout history</h2>
      {byDay.length === 0 ? <div style={muted}>No shouts logged yet.</div> : (
        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', marginRight: '-0.5rem', paddingRight: '0.5rem' }}>
          {byDay.map(([day, shouts]) => (
            <div key={day} style={{ marginBottom: '0.6rem' }}>
              <div style={{ ...muted, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                {clock.dateFmt(day, { weekday: 'short', month: 'short', day: 'numeric' })} · {shouts.length}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                {shouts.map(s => (
                  <li key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-primary)', minWidth: 0 }}>
                    <b style={{ fontVariantNumeric: 'tabular-nums' }}>{clock.time(s.shouted_at)}</b>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.ign}
                    </span>
                    <DeleteButton show={s.discord_id === data.me.discord_id || data.me.can_manage} busy={busy} label="Remove this shout"
                      onClick={() => run(async () => { await send(`/api/exec/recruitment/shouts/${s.id}`, 'DELETE'); return 'Removed the shout.'; })} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const MESSAGE_TITLE: Record<MessageKind, string> ={ pfinder: 'Pfinder message', shout: 'Shout message' };

/** The guild's saved message of one kind: shown ready to copy, and editable by anyone on the page. */
function SavedMessage({ kind, data, busy, run }: { kind: MessageKind; data: Data; busy: boolean; run: Run }) {
  const clock = useClock();
  const saved = data.messages.find(m => m.kind === kind);
  const limit = MESSAGE_LIMITS[kind];
  // null while not editing; the draft keeps what was being typed through the 30s refreshes
  const [draft, setDraft] = useState<string | null>(null);
  // the version the edit started from, so someone else's save meanwhile isn't overwritten
  const [seen, setSeen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const length = draft === null ? 0 : messageLength(cleanMessage(draft));

  const edit = () => { setDraft(saved?.body ?? ''); setSeen(saved?.updated_at ?? null); };
  const save = () => run(async () => {
    await send('/api/exec/recruitment/messages', 'PUT', { kind, body: draft, seen });
    setDraft(null);
    return `Saved the ${kind} message.`;
  });
  const copy = async () => {
    if (!saved?.body) return;
    try {
      await navigator.clipboard.writeText(saved.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the text is still there to select */ }
  };

  return (
    <div>
      <div style={{ ...subhead, display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        {MESSAGE_TITLE[kind]}
        {draft === null && <button style={{ ...linkBtn, marginLeft: 'auto', fontWeight: 400 }} onClick={edit}>{saved?.body ? 'Edit' : 'Write one'}</button>}
      </div>
      {draft !== null ? (
        <>
          <textarea style={{ ...input, width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: '4.5rem', fontFamily: 'inherit' }}
            autoFocus value={draft} aria-label={MESSAGE_TITLE[kind]}
            // in-game chat is one line: Enter saves, and pasted line breaks become spaces
            onChange={e => setDraft(e.target.value.replace(/[\r\n]+/g, ' '))}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); if (!busy && length <= limit) save(); }
              if (e.key === 'Escape') setDraft(null);
            }} />
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.35rem' }}>
            <span style={{ ...muted, color: length > limit ? '#ef4444' : 'var(--text-muted)' }}>{length}/{limit}</span>
            <button style={{ ...navBtn, marginLeft: 'auto' }} onClick={() => setDraft(null)}>Cancel</button>
            <button style={btn('#3b82f6')} disabled={busy || length > limit} onClick={save}>Save</button>
          </div>
        </>
      ) : saved?.body ? (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <div style={{
              flex: 1, minWidth: 0, padding: '0.5rem 0.65rem', borderRadius: '0.375rem', background: 'var(--bg-primary)',
              border: '1px solid var(--border-card)', fontSize: '0.83rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
            }}>{saved.body}</div>
            <button style={{ ...btn(copied ? '#22c55e' : '#3b82f6'), minWidth: '4.5rem' }} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div style={{ ...muted, marginTop: '0.3rem' }}>
            {messageLength(saved.body)}/{limit} · edited by {saved.ign}, {clock.day(saved.updated_at)} {clock.time(saved.updated_at)}
          </div>
        </>
      ) : <div style={muted}>No {kind} message saved yet.</div>}
    </div>
  );
}

function DeleteButton({ show, busy, label, onClick }: { show: boolean; busy: boolean; label: string; onClick: () => void }) {
  if (!show) return null;
  return (
    <button aria-label={label} title={label} disabled={busy} onClick={() => { if (confirm(`${label}?`)) onClick(); }}
      style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1 }}>×</button>
  );
}

function Calendar({ data, view, setView, anchor, setAnchor, range, now, busy, run }: {
  data: Data; view: View; setView: (v: View) => void; anchor: string; setAnchor: (d: string) => void;
  range: { from: string; to: string }; now: number; busy: boolean; run: Run;
}) {
  const clock = useClock();
  const today = clock.day(now);
  const [selected, setSelected] = useState<string | null>(today);
  const days = useMemo(
    () => clock.summarize(data.sessions, data.shouts, data.applications, now),
    [clock, data.sessions, data.shouts, data.applications, now]);
  // keepPreviousData shows the last range while the next loads; don't draw it under the new heading
  const current = data.from === clock.iso(range.from) && data.to === clock.iso(range.to);
  const month = anchor.slice(0, 7);
  // The totals cover what the heading names: the week, or the month without its neighbours' days
  const counts = (day: string) => (view === 'week' ? day >= range.from && day < range.to : day.startsWith(month));

  const totals = (() => {
    const people: Record<string, number> = {};
    let ms = 0, active = 0, shouts = 0;
    for (const [day, d] of Object.entries(days)) {
      if (!counts(day)) continue;
      ms += d.ms; shouts += d.shouts; if (d.ms > 0) active++;
      for (const [ign, t] of Object.entries(d.people)) people[ign] = (people[ign] ?? 0) + t;
    }
    const apps = data.applications.filter(a => counts(clock.day(a.submitted_at)));
    return {
      ms, active, shouts, apps: apps.length, accepted: apps.filter(a => a.status === 'accepted').length,
      people: Object.entries(people).sort((a, b) => b[1] - a[1]),
    };
  })();

  const shift = (by: number) => setAnchor(view === 'week' ? clock.addDays(anchor, 7 * by) : `${clock.shiftMonth(month, by)}-01`);

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ ...h2, margin: 0 }}>{view === 'week' ? clock.weekLabel(range.from) : clock.monthLabel(month)}</h2>
        <div role="tablist" aria-label="Calendar view" style={{ display: 'flex', border: '1px solid var(--border-card)', borderRadius: '0.375rem', overflow: 'hidden' }}>
          {(['week', 'month'] as const).map(v => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              style={{ ...btn(view === v ? 'var(--chart-tile-active)' : 'var(--bg-primary)'), borderRadius: 0, color: 'var(--text-primary)', fontWeight: view === v ? 700 : 500 }}>
              {v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.25rem', marginLeft: 'auto' }}>
          <button style={navBtn} aria-label={`Previous ${view}`} onClick={() => shift(-1)}>‹</button>
          <button style={navBtn} onClick={() => { setAnchor(today); setSelected(today); }}>Today</button>
          <button style={navBtn} aria-label={`Next ${view}`} onClick={() => shift(1)}>›</button>
        </div>
      </div>

      <div style={{ opacity: current ? 1 : 0.4 }}>
        {view === 'week'
          ? <WeekGrid data={current ? data : null} from={range.from} days={days} today={today} now={now} selected={selected} onSelect={setSelected} />
          : <MonthGrid month={month} days={current ? days : {}} today={today} onPick={day => { setAnchor(day); setSelected(day); setView('week'); }} />}
      </div>

      {current && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>{view === 'week' ? 'This week' : 'This month'}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              <b>{formatDuration(totals.ms)}</b> of pfinder over <b>{totals.active}</b> day{totals.active === 1 ? '' : 's'} · <b>{plural(totals.shouts, 'shout')}</b> · <b>{plural(totals.apps, 'application')}</b>
              {totals.apps > 0 && <> ({totals.accepted} accepted)</>}
            </div>
            {totals.people.length > 0 && (
              <table style={{ borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                <tbody>{totals.people.map(([ign, ms]) => (
                  <tr key={ign}>
                    <td style={{ padding: '0.15rem 1rem 0.15rem 0', color: 'var(--text-primary)' }}>{ign}</td>
                    <td style={{ padding: '0.15rem 0', color: 'var(--text-secondary)', textAlign: 'right' }}>{formatDuration(ms)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          {view === 'week' && selected && selected >= range.from && selected < range.to && (
            <DayDetail day={selected} data={data} now={now} busy={busy} run={run} />
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Pixels per hour in the week view. The day is stretched or squeezed between
 * these so 00:00 to 24:00 ends at the bottom of the window, not below it.
 */
const HOUR_PX = { min: 14, max: 48 };
/** What sits under the time grid inside the window: the legend, the week's totals line and the card's padding. */
const BELOW_GRID_PX = 112;
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];

/** The hour height that fits the grid at `ref` into the window, kept up to date on resize. */
function useFitHourPx(ref: React.RefObject<HTMLElement | null>, deps: unknown[]): number {
  const [hourPx, setHourPx] = useState(HOUR_PX.max);
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      // from where the grid starts on the page, so scrolling doesn't change it
      const top = el.getBoundingClientRect().top + window.scrollY;
      const px = Math.floor((window.innerHeight - top - BELOW_GRID_PX) / 24);
      setHourPx(Math.min(HOUR_PX.max, Math.max(HOUR_PX.min, px)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return hourPx;
}

function WeekGrid({ data, from, days, today, now, selected, onSelect }: {
  data: Data | null; from: string; days: Record<string, DaySummary>; today: string; now: number;
  selected: string | null; onSelect: (day: string) => void;
}) {
  const clock = useClock();
  const gridRef = useRef<HTMLDivElement>(null);
  // re-fit when what's above the grid can change height: the cards beside it don't, the day headers do
  const hourPx = useFitHourPx(gridRef, [data]);
  const week = Array.from({ length: 7 }, (_, i) => clock.addDays(from, i));
  const cols = '2.4rem repeat(7, minmax(0, 1fr))';
  // The card under the pointer for whatever it's over: who, when, how long
  const [tip, setTip] = useState<(TipContent & { x: number; y: number }) | null>(null);
  const hover = (content: TipContent) => ({
    onMouseEnter: (e: React.MouseEvent) => setTip({ ...content, x: e.clientX, y: e.clientY }),
    onMouseMove: (e: React.MouseEvent) => setTip({ ...content, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTip(null),
  });
  const at = (t: string) => `${clock.dateFmt(clock.day(t), { weekday: 'short', month: 'short', day: 'numeric' })} ${clock.time(t)}`;
  const span = (from: string, to: string | null) => {
    const sameDay = to !== null && clock.day(from) === clock.day(to);
    return to === null ? `${at(from)} – now` : sameDay ? `${at(from)} – ${clock.time(to)}` : `${at(from)} – ${at(to)}`;
  };

  return (
    <div>
      {tip && <Tooltip tip={tip} />}
      {/* Day headers: date, pfinder total, shouts and applications; pick a day for its details below */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '0.25rem', marginBottom: '0.25rem' }}>
        <div />
        {week.map((day, i) => {
          const d = data ? days[day] : undefined;
          const isSel = day === selected;
          return (
            <button key={day} onClick={() => onSelect(day)} aria-pressed={isSel}
              aria-label={`${clock.dayLabel(day)}: ${describeDay(d)}`}
              style={{
                minWidth: 0, overflow: 'hidden', padding: '0.3rem 0.35rem', borderRadius: '0.5rem', cursor: 'pointer', textAlign: 'left',
                background: isSel ? 'var(--chart-tile-active)' : 'var(--bg-primary)', color: 'var(--text-primary)',
                border: day === today ? '2px solid var(--color-ocean-400)' : '1px solid var(--border-card)',
              }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{WEEKDAYS[i]}</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{Number(day.slice(8))}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', minHeight: '0.9rem' }}>{d?.ms ? formatDuration(d.ms) : ''}</div>
              <ShoutPips n={d?.shouts ?? 0} />
              {!!d?.apps && <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{plural(d.apps, 'app')}</div>}
            </button>
          );
        })}
      </div>

      {/* Time grid: 00:00 at the top, 24:00 at the bottom */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '0.25rem' }}>
        <div ref={gridRef} style={{ position: 'relative', height: 24 * hourPx }}>
          {HOUR_LABELS.map(h => (
            <span key={h} style={{ position: 'absolute', top: h * hourPx - 6, right: '0.2rem', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {week.map(day => {
          const { blocks, lanes } = data ? clock.dayBlocks(data.sessions, day, now) : { blocks: [], lanes: 1 };
          const shouts = data ? data.shouts.filter(s => clock.day(s.shouted_at) === day) : [];
          const apps = data ? data.applications.filter(a => clock.day(a.submitted_at) === day) : [];
          return (
            <div key={day} onClick={() => onSelect(day)} style={{
              position: 'relative', height: 24 * hourPx, minWidth: 0, overflow: 'hidden', cursor: 'pointer',
              borderRadius: '0.375rem', border: '1px solid var(--border-card)',
              background: `repeating-linear-gradient(to bottom, transparent 0, transparent ${hourPx - 1}px, var(--border-card) ${hourPx - 1}px, var(--border-card) ${hourPx}px), var(--bg-primary)`,
            }}>
              {blocks.map(b => {
                const s = b.session;
                const total = (s.ended_at ? Date.parse(s.ended_at) : now) - Date.parse(s.started_at);
                const content: TipContent = {
                  kind: 'Pfinder session', accent: 'var(--chart-seq-3)', who: s.ign,
                  rows: [span(s.started_at, s.ended_at), s.ended_at ? formatDuration(total) : `${formatDuration(total)} so far, still clocked in`],
                };
                const height = Math.max(3, (b.endMin - b.startMin) / 60 * hourPx);
                return (
                  <div key={s.id} aria-label={`${content.kind}: ${s.ign}, ${content.rows.join(', ')}`} {...hover(content)} style={{
                    position: 'absolute', top: b.startMin / 60 * hourPx, height,
                    left: `calc(${(b.lane / lanes) * 100}% + 1px)`, width: `calc(${100 / lanes}% - 2px)`,
                    background: SESSION_FILL, borderLeft: '3px solid var(--chart-seq-3)', borderRadius: '3px',
                    borderBottom: s.ended_at ? undefined : '2px dashed var(--chart-seq-3)',
                    padding: height > 14 ? '1px 3px' : 0, overflow: 'hidden', fontSize: '0.64rem', lineHeight: 1.25, color: 'var(--text-primary)',
                  }}>
                    {height > 14 && <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.ign}</div>}
                    {height > 28 && <div style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{clock.time(s.started_at)}–{s.ended_at ? clock.time(s.ended_at) : 'now'}</div>}
                  </div>
                );
              })}
              {/* shouts label on the right, applications on the left, so the two don't stack */}
              {shouts.map(s => (
                <Marker key={`s${s.id}`} min={clock.wallMinutes(s.shouted_at)} hourPx={hourPx} side="right" line="var(--text-secondary)"
                  tip={{ kind: 'Shout', accent: 'var(--text-secondary)', who: s.ign, rows: [at(s.shouted_at), `Shout ${s.slot} of ${SHOUTS_PER_DAY} on ${utcDay(s.shouted_at)} (UTC)`] }}
                  hover={hover} label={`Shout ${clock.time(s.shouted_at)}`} />
              ))}
              {apps.map(a => (
                <Marker key={`a${a.id}`} min={clock.wallMinutes(a.submitted_at)} hourPx={hourPx} side="left" line={APP_COLOR}
                  tip={{ kind: 'Guild application', accent: APP_COLOR, who: a.ign ?? 'Unknown IGN', rows: [`Submitted ${at(a.submitted_at)}`, STATUS_LABEL[a.status] ?? a.status] }}
                  hover={hover} label={`+ ${a.ign ?? 'app'}`} />
              ))}
              {day === today && (
                <div aria-hidden style={{ position: 'absolute', top: clock.wallMinutes(now) / 60 * hourPx - 1, left: 0, right: 0, borderTop: '2px solid #ef4444', zIndex: 2, pointerEvents: 'none' }} />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.6rem', ...muted, fontSize: '0.72rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ width: '0.8rem', height: '0.6rem', borderLeft: '3px solid var(--chart-seq-3)', background: SESSION_FILL }} />pfinder session
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ width: '0.8rem', borderTop: '2px solid var(--text-secondary)' }} />shout
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ width: '0.8rem', borderTop: `2px solid ${APP_COLOR}` }} />+ guild application
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ width: '0.8rem', borderTop: '2px solid #ef4444' }} />now
        </span>
        <span>Times in {clock.zone}. Hover a session, shout or application for who and when.</span>
      </div>
    </div>
  );
}

/** What the week view's hover card says about one session, shout or application. */
interface TipContent { kind: string; who: string; rows: string[]; accent: string }

/** The hover card, beside the pointer; it flips left or up near the window's edge. */
function Tooltip({ tip }: { tip: TipContent & { x: number; y: number } }) {
  const flipX = tip.x > window.innerWidth - 280;
  const flipY = tip.y > window.innerHeight - 120;
  return (
    <div role="tooltip" style={{
      position: 'fixed', left: tip.x + (flipX ? -14 : 14), top: tip.y + (flipY ? -14 : 14), zIndex: 60, pointerEvents: 'none',
      transform: `translate(${flipX ? '-100%' : '0'}, ${flipY ? '-100%' : '0'})`, maxWidth: '18rem',
      background: 'var(--bg-card-solid)', border: '1px solid var(--border-card)', borderLeft: `3px solid ${tip.accent}`,
      borderRadius: '0.5rem', padding: '0.45rem 0.6rem', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', fontSize: '0.78rem', color: 'var(--text-primary)',
    }}>
      <div style={{ ...muted, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{tip.kind}</div>
      <div style={{ fontWeight: 700, fontSize: '0.9rem', margin: '0.1rem 0 0.15rem' }}>{tip.who}</div>
      {tip.rows.map((r, i) => <div key={i} style={{ color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{r}</div>)}
    </div>
  );
}

/** A moment in a week-view day: a line across the column with a small label at one side. */
function Marker({ min, hourPx, side, line, tip, hover, label }: {
  min: number; hourPx: number; side: 'left' | 'right'; line: string; tip: TipContent;
  hover: (c: TipContent) => Record<string, (e: React.MouseEvent) => void>; label: string;
}) {
  return (
    // a 10px band around the 2px line, so it's easy to hover
    <div aria-label={`${tip.kind}: ${tip.who}, ${tip.rows.join(', ')}`} {...hover(tip)}
      style={{ position: 'absolute', top: min / 60 * hourPx - 5, height: 10, left: 0, right: 0, zIndex: 1, display: 'flex', alignItems: 'center' }}>
      <div style={{ borderTop: `2px solid ${line}`, width: '100%' }} />
      <span style={{
        position: 'absolute', [side]: 2, top: -4, maxWidth: 'calc(100% - 4px)', overflow: 'hidden', textOverflow: 'ellipsis',
        fontSize: '0.58rem', fontWeight: 700, padding: '0 3px', borderRadius: '3px',
        background: 'var(--bg-card-solid)', color: 'var(--text-primary)', border: `1px solid ${line}`, whiteSpace: 'nowrap',
      }}>{label}</span>
    </div>
  );
}

function describeDay(d: DaySummary | undefined): string {
  return `${d?.ms ? `${formatDuration(d.ms)} pfinder` : 'no pfinder'}, ${d?.shouts ?? 0} of ${SHOUTS_PER_DAY} shouts, ${plural(d?.apps ?? 0, 'application')}`;
}

function ShoutPips({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span style={{ display: 'flex', gap: '2px' }} aria-hidden>
      {Array.from({ length: SHOUTS_PER_DAY }, (_, k) => (
        <span key={k} style={{
          width: '0.4rem', height: '0.4rem', borderRadius: '50%',
          background: k < n ? 'var(--text-secondary)' : 'transparent', border: '1px solid var(--text-muted)',
        }} />
      ))}
    </span>
  );
}

function MonthGrid({ month, days, today, onPick }: {
  month: string; days: Record<string, DaySummary>; today: string; onPick: (day: string) => void;
}) {
  const clock = useClock();
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.25rem' }}>
        {WEEKDAYS.map(w => <div key={w} style={{ ...muted, fontSize: '0.7rem', fontWeight: 600, textAlign: 'center', textTransform: 'uppercase' }}>{w}</div>)}
        {clock.monthWeeks(month).flat().map(day => {
          const d = days[day];
          const ms = d?.ms ?? 0;
          // the neighbouring months' days fill the first and last rows, dimmed
          const outside = !day.startsWith(month);
          const desc = `${clock.dayLabel(day)}: ${describeDay(d)}. Open its week`;
          return (
            <button key={day} onClick={() => onPick(day)} aria-label={desc} title={desc}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem', minWidth: 0, overflow: 'hidden',
                minHeight: '4.2rem', padding: '0.35rem 0.4rem', borderRadius: '0.5rem', cursor: 'pointer', textAlign: 'left',
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                border: day === today ? '2px solid var(--color-ocean-400)' : '1px solid var(--border-card)',
                opacity: outside ? 0.4 : day > today ? 0.6 : 1,
              }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                {Number(day.slice(8))}{outside && Number(day.slice(8)) === 1 ? ` ${clock.dateFmt(day, { month: 'short' })}` : ''}
              </span>
              {ms > 0 && (
                <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 0.25rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: '0.6rem', height: '0.6rem', borderRadius: '2px', flexShrink: 0, background: SHADES[shadeStep(ms)] }} />
                  {formatDuration(ms)}
                </span>
              )}
              <ShoutPips n={d?.shouts ?? 0} />
              {!!d?.apps && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>+{plural(d.apps, 'app')}</span>}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.6rem', ...muted, fontSize: '0.72rem' }}>
        <span>Pfinder time:</span>
        {SHADE_LEGEND.map((label, i) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '0.6rem', height: '0.6rem', borderRadius: '2px', background: SHADES[i + 1] }} />{label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ width: '0.4rem', height: '0.4rem', borderRadius: '50%', background: 'var(--text-secondary)' }} />one shout
        </span>
        <span>+N apps: guild applications.</span>
        <span>Days in {clock.zone}. Pick a day to open its week.</span>
      </div>
    </>
  );
}

const STATUS_LABEL: Record<string, string> = { pending: 'Pending', accepted: 'Accepted', denied: 'Denied', expired: 'Expired' };

function DayDetail({ day, data, now, busy, run }: { day: string; data: Data; now: number; busy: boolean; run: Run }) {
  const clock = useClock();
  // Each session's part on this day; one that crosses midnight shows on both days
  const sessions = data.sessions.flatMap(s => {
    const end = s.ended_at ? Date.parse(s.ended_at) : now;
    const part = clock.splitByDay(Date.parse(s.started_at), end).find(p => p.day === day);
    return part ? [{ s, ms: part.ms }] : [];
  });
  const shouts = data.shouts.filter(s => clock.day(s.shouted_at) === day);
  const apps = data.applications.filter(a => clock.day(a.submitted_at) === day);
  const mayDelete = (discordId: string) => discordId === data.me.discord_id || data.me.can_manage;
  const span = (iso: string) => `${clock.day(iso) === day ? '' : `${clock.day(iso).slice(5)} `}${clock.time(iso)}`;
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.83rem', color: 'var(--text-primary)', padding: '0.15rem 0' };

  return (
    <div>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>{clock.dayLabel(day)}</div>
      {sessions.length === 0 && shouts.length === 0 && apps.length === 0 && <div style={muted}>Nothing logged.</div>}
      {sessions.map(({ s, ms }) => (
        <div key={`p${s.id}`} style={row}>
          <span>{s.ign}</span>
          <span style={muted}>{span(s.started_at)}–{s.ended_at ? span(s.ended_at) : 'now'} · {formatDuration(ms)}</span>
          <DeleteButton show={mayDelete(s.discord_id)} busy={busy} label="Remove this session"
            onClick={() => run(async () => { await send(`/api/exec/recruitment/pfinder/${s.id}`, 'DELETE'); return 'Removed the session.'; })} />
        </div>
      ))}
      {shouts.map(s => (
        <div key={`s${s.id}`} style={row}>
          <span>Shout at {clock.time(s.shouted_at)}</span>
          <span style={muted}>{s.ign}</span>
          <DeleteButton show={mayDelete(s.discord_id)} busy={busy} label="Remove this shout"
            onClick={() => run(async () => { await send(`/api/exec/recruitment/shouts/${s.id}`, 'DELETE'); return 'Removed the shout.'; })} />
        </div>
      ))}
      {apps.map(a => (
        <div key={`a${a.id}`} style={row}>
          <span>Application at {clock.time(a.submitted_at)}</span>
          <Link href={`/exec/applications?id=${a.id}`} style={{ color: 'var(--text-primary)' }}>{a.ign ?? 'unknown IGN'}</Link>
          <span style={muted}>{STATUS_LABEL[a.status] ?? a.status}</span>
        </div>
      ))}
    </div>
  );
}
