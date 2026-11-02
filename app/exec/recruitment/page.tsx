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

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { fetcher } from '@/hooks/fetcher';
import {
  MAX_SESSION_HOURS, SHADE_LEGEND, SHOUTS_PER_DAY, calendarDays, formatDuration, nextUtcMidnight, shadeStep, utcDay,
  type Application, type CalendarDays, type DaySummary, type PfinderSession, type Shout,
} from '@/lib/recruitment';

interface Data {
  /** the range served, as ISO times */
  from: string; to: string;
  sessions: PfinderSession[]; shouts: Shout[]; applications: Application[];
  open: PfinderSession[]; today: Shout[];
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
const h2: React.CSSProperties = { fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.75rem' };
const muted: React.CSSProperties = { fontSize: '0.78rem', color: 'var(--text-muted)' };
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

  if (error) return <div style={{ color: '#ef4444', padding: '2rem' }}>Failed to load recruitment: {error.message}</div>;

  return (
    <ClockContext.Provider value={clock}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 24rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Recruitment</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.35rem 0 0' }}>
              Clock in when you start recruiting in party finder and out when you stop, and log every shout the moment it goes out.
              Guild applications show on the calendar when they were submitted. Times are in {utc ? 'UTC' : `your time zone (${clock.zone})`};
              the guild&rsquo;s {SHOUTS_PER_DAY} shouts a day reset at 00:00 UTC{utc ? '' : `, which is ${clock.time(nextUtcMidnight(now))} for you`}.
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
          <div role="status" style={{ ...card, padding: '0.6rem 0.8rem', color: message.ok ? '#22c55e' : '#ef4444', borderColor: message.ok ? '#22c55e55' : '#ef444455' }}>{message.text}</div>
        )}
        {!data ? <section style={{ ...card, height: '14rem', opacity: 0.6 }} /> : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 20rem), 1fr))', gap: '1rem' }}>
              <Pfinder data={data} now={now} busy={busy} run={run} />
              <Shouts data={data} now={now} busy={busy} run={run} />
            </div>
            <Calendar data={data} view={view} setView={setView} anchor={anchor} setAnchor={setAnchor}
              range={{ from, to }} now={now} busy={busy} run={run} />
          </>
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

      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', margin: '1rem 0 0.35rem' }}>On now</div>
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
  const [note, setNote] = useState('');
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
      <ol style={{ listStyle: 'none', margin: '0 0 0.75rem', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {Array.from({ length: SHOUTS_PER_DAY }, (_, i) => {
          const s = today[i];
          return (
            <li key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem', borderRadius: '0.375rem',
              border: `1px ${s ? 'solid' : 'dashed'} var(--border-card)`, fontSize: '0.83rem', color: s ? 'var(--text-primary)' : 'var(--text-muted)',
            }}>
              <span style={{ fontWeight: 700, width: '1rem' }}>{i + 1}</span>
              {s ? (
                <>
                  <span><b>{clock.time(s.shouted_at)}</b> · {s.ign}{s.note && <span style={muted}> · {s.note}</span>}</span>
                  <DeleteButton show={s.discord_id === data.me.discord_id || data.me.can_manage} busy={busy} label="Remove this shout"
                    onClick={() => run(async () => { await send(`/api/exec/recruitment/shouts/${s.id}`, 'DELETE'); return 'Removed the shout.'; })} />
                </>
              ) : 'Not used'}
            </li>
          );
        })}
      </ol>
      {left > 0 ? (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input style={{ ...input, flex: '1 1 10rem' }} placeholder="Note (optional), e.g. world or message" maxLength={200} value={note} onChange={e => setNote(e.target.value)} />
            <button style={btn('#3b82f6')} disabled={busy || (earlier && !at)}
              onClick={() => run(async () => {
                await send('/api/exec/recruitment/shouts', 'POST', { note, at: earlier ? clock.fromInput(at) : undefined });
                setNote(''); setEarlier(false);
                return 'Logged the shout.';
              })}>{earlier ? 'Log shout at this time' : 'Log shout now'}</button>
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={linkBtn} onClick={() => { setEarlier(!earlier); setAt(clock.toInput(Date.now())); }}>{earlier ? 'Use the time now' : 'Shouted earlier?'}</button>
            {earlier && <label style={muted}>Shouted at ({clock.zone}) <input type="datetime-local" style={input} value={at} onChange={e => setAt(e.target.value)} /></label>}
          </div>
        </>
      ) : (
        <div style={{ fontSize: '0.83rem', color: '#eab308' }}>All {SHOUTS_PER_DAY} of today&rsquo;s shouts are used. The next one is available at {reset}.</div>
      )}
    </section>
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

/** Pixels per hour in the week view: the whole day fits without scrolling. */
const HOUR_PX = 26;
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];

function WeekGrid({ data, from, days, today, now, selected, onSelect }: {
  data: Data | null; from: string; days: Record<string, DaySummary>; today: string; now: number;
  selected: string | null; onSelect: (day: string) => void;
}) {
  const clock = useClock();
  const week = Array.from({ length: 7 }, (_, i) => clock.addDays(from, i));
  const cols = '2.4rem repeat(7, minmax(0, 1fr))';

  return (
    <div>
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
        <div style={{ position: 'relative', height: 24 * HOUR_PX }}>
          {HOUR_LABELS.map(h => (
            <span key={h} style={{ position: 'absolute', top: h * HOUR_PX - 6, right: '0.2rem', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
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
              position: 'relative', height: 24 * HOUR_PX, minWidth: 0, overflow: 'hidden', cursor: 'pointer',
              borderRadius: '0.375rem', border: '1px solid var(--border-card)',
              background: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--border-card) ${HOUR_PX - 1}px, var(--border-card) ${HOUR_PX}px), var(--bg-primary)`,
            }}>
              {blocks.map(b => {
                const s = b.session;
                const tip = `${s.ign} · ${clock.time(s.started_at)}–${s.ended_at ? clock.time(s.ended_at) : 'now'} · ${formatDuration(b.ms)}`;
                const height = Math.max(3, (b.endMin - b.startMin) / 60 * HOUR_PX);
                return (
                  <div key={s.id} title={tip} aria-label={tip} style={{
                    position: 'absolute', top: b.startMin / 60 * HOUR_PX, height,
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
                <Marker key={`s${s.id}`} min={clock.wallMinutes(s.shouted_at)} side="right" line="var(--text-secondary)"
                  tip={`Shout at ${clock.time(s.shouted_at)} by ${s.ign}${s.note ? ` · ${s.note}` : ''}`} label={`Shout ${clock.time(s.shouted_at)}`} />
              ))}
              {apps.map(a => (
                <Marker key={`a${a.id}`} min={clock.wallMinutes(a.submitted_at)} side="left" line={APP_COLOR}
                  tip={`Application from ${a.ign ?? 'unknown'} at ${clock.time(a.submitted_at)} · ${a.status}`} label={`+ ${a.ign ?? 'app'}`} />
              ))}
              {day === today && (
                <div aria-hidden style={{ position: 'absolute', top: clock.wallMinutes(now) / 60 * HOUR_PX - 1, left: 0, right: 0, borderTop: '2px solid #ef4444', zIndex: 2 }} />
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
        <span>Times in {clock.zone}. Hover anything for its exact time.</span>
      </div>
    </div>
  );
}

/** A moment in a week-view day: a line across the column with a small label at one side. */
function Marker({ min, side, line, tip, label }: { min: number; side: 'left' | 'right'; line: string; tip: string; label: string }) {
  return (
    <div title={tip} aria-label={tip} style={{ position: 'absolute', top: min / 60 * HOUR_PX - 1, left: 0, right: 0, zIndex: 1 }}>
      <div style={{ borderTop: `2px solid ${line}` }} />
      <span style={{
        position: 'absolute', [side]: 2, top: -8, maxWidth: 'calc(100% - 4px)', overflow: 'hidden', textOverflow: 'ellipsis',
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
          <span style={muted}>{s.ign}{s.note ? ` · ${s.note}` : ''}</span>
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
