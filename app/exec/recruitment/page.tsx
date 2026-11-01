"use client";

/**
 * Recruitment (TAQ-140): exec members clock in and out of pfinder recruiting
 * and log the guild's shouts. The calendar shows how much pfindering each
 * day had and how many of the day's 3 shouts went out. Every day and time on
 * the page is UTC, the days the shout limit resets on.
 */

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/hooks/fetcher';
import {
  MAX_SESSION_HOURS, SHADE_LEGEND, SHOUTS_PER_DAY, formatDuration, monthWeeks, nextUtcMidnight, shadeStep,
  shiftMonth, splitByUtcDay, summarize, utcDay, utcTime,
  type PfinderSession, type Shout,
} from '@/lib/recruitment';

interface Data {
  month: string; sessions: PfinderSession[]; shouts: Shout[]; open: PfinderSession[]; today: Shout[];
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
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.78rem', textDecoration: 'underline' };
const h2: React.CSSProperties = { fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.75rem' };
const muted: React.CSSProperties = { fontSize: '0.78rem', color: 'var(--text-muted)' };
const SHADES = ['var(--chart-empty)', 'var(--chart-seq-1)', 'var(--chart-seq-2)', 'var(--chart-seq-3)', 'var(--chart-seq-4)', 'var(--chart-seq-5)'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? 'Something went wrong');
  return j;
}

// <input type="datetime-local"> has no zone; this page reads and writes it as UTC.
const toInput = (ms: number) => new Date(ms).toISOString().slice(0, 16);
const fromInput = (v: string) => `${v}:00Z`;

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

type Run = (fn: () => Promise<string>) => Promise<void>;

export default function RecruitmentPage() {
  const [month, setMonth] = useState(() => utcDay(Date.now()).slice(0, 7));
  const { data, error, mutate } = useSWR<Data>(`/api/exec/recruitment?month=${month}`, fetcher, { refreshInterval: 30000, keepPreviousData: true });
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Recruitment</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.35rem 0 0' }}>
          Clock in when you start recruiting in party finder and out when you stop, and log every shout the moment it goes out.
          All times are UTC; the guild&rsquo;s {SHOUTS_PER_DAY} shouts reset at 00:00 UTC.
        </p>
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
          <Calendar data={data} month={month} setMonth={setMonth} now={now} busy={busy} run={run} />
        </>
      )}
    </div>
  );
}

function Pfinder({ data, now, busy, run }: { data: Data; now: number; busy: boolean; run: Run }) {
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
            You&rsquo;re clocked in since <b>{utcTime(mine.started_at)}</b> UTC{utcDay(mine.started_at) !== utcDay(now) && ` on ${utcDay(mine.started_at)}`} · {formatDuration(openTime(mine))}
          </div>
          {openTime(mine) > 12 * 3_600_000 && (
            <div style={{ fontSize: '0.78rem', color: '#eab308', marginBottom: '0.6rem' }}>
              That&rsquo;s a long session. If you forgot to clock out, set when you actually stopped.
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={btn('#ef4444')} disabled={busy}
              onClick={() => run(async () => { await send('/api/exec/recruitment/pfinder', 'POST', { action: 'out' }); return 'Clocked out.'; })}>Clock out</button>
            <button style={linkBtn} onClick={() => { setOther(!other); setEnd(toInput(Date.now())); }}>Stopped earlier?</button>
          </div>
          {other && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.6rem' }}>
              <label style={muted}>Stopped at (UTC) <input type="datetime-local" style={input} value={end} onChange={e => setEnd(e.target.value)} /></label>
              <button style={btn('#ef4444')} disabled={busy || !end}
                onClick={() => run(async () => {
                  await send('/api/exec/recruitment/pfinder', 'POST', { action: 'out', at: fromInput(end) });
                  reset();
                  return `Clocked out at ${end.slice(11)} UTC.`;
                })}>Clock out at this time</button>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={btn('#22c55e')} disabled={busy}
              onClick={() => run(async () => { await send('/api/exec/recruitment/pfinder', 'POST', { action: 'in' }); return 'Clocked in. Clock out here when you stop.'; })}>Clock in</button>
            <button style={linkBtn} onClick={() => { setOther(!other); setStart(toInput(Date.now() - 3_600_000)); setEnd(toInput(Date.now())); }}>
              Forgot to clock in? Log a past session
            </button>
          </div>
          {other && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.6rem' }}>
              <label style={muted}>From (UTC) <input type="datetime-local" style={input} value={start} onChange={e => setStart(e.target.value)} /></label>
              <label style={muted}>To (UTC) <input type="datetime-local" style={input} value={end} onChange={e => setEnd(e.target.value)} /></label>
              <button style={btn('#3b82f6')} disabled={busy || !start || !end}
                onClick={() => run(async () => {
                  await send('/api/exec/recruitment/pfinder', 'POST', { action: 'log', started_at: fromInput(start), ended_at: fromInput(end) });
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
              {s.ign} <span style={muted}>since {utcTime(s.started_at)} · {formatDuration(openTime(s))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Shouts({ data, now, busy, run }: { data: Data; now: number; busy: boolean; run: Run }) {
  const [note, setNote] = useState('');
  const [earlier, setEarlier] = useState(false);
  const [at, setAt] = useState('');
  // Today's shouts follow the clock: at 00:00 UTC the count resets before the next refresh
  const today = data.today.filter(s => utcDay(s.shouted_at) === utcDay(now));
  const left = SHOUTS_PER_DAY - today.length;

  return (
    <section style={card}>
      <h2 style={h2}>Shouts today</h2>
      <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.6rem' }}>
        <b>{today.length}</b> of {SHOUTS_PER_DAY} used · resets in {formatDuration(nextUtcMidnight(now) - now)}
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
                  <span><b>{utcTime(s.shouted_at)}</b> UTC · {s.ign}{s.note && <span style={muted}> · {s.note}</span>}</span>
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
                await send('/api/exec/recruitment/shouts', 'POST', { note, at: earlier ? fromInput(at) : undefined });
                setNote(''); setEarlier(false);
                return 'Logged the shout.';
              })}>{earlier ? 'Log shout at this time' : 'Log shout now'}</button>
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={linkBtn} onClick={() => { setEarlier(!earlier); setAt(toInput(Date.now())); }}>{earlier ? 'Use the time now' : 'Shouted earlier?'}</button>
            {earlier && <label style={muted}>Shouted at (UTC) <input type="datetime-local" style={input} value={at} onChange={e => setAt(e.target.value)} /></label>}
          </div>
        </>
      ) : (
        <div style={{ fontSize: '0.83rem', color: '#eab308' }}>All {SHOUTS_PER_DAY} of today&rsquo;s shouts are used. The next one is available at 00:00 UTC.</div>
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

function Calendar({ data, month, setMonth, now, busy, run }: {
  data: Data; month: string; setMonth: (m: string) => void; now: number; busy: boolean; run: Run;
}) {
  const today = utcDay(now);
  const [selected, setSelected] = useState<string | null>(today);
  const days = useMemo(() => summarize(data.sessions, data.shouts, now), [data.sessions, data.shouts, now]);
  // keepPreviousData shows the last month while the next loads; don't draw it under the new heading
  const current = data.month === month;

  const totals = useMemo(() => {
    const people: Record<string, number> = {};
    let ms = 0, active = 0, shouts = 0;
    for (const [day, d] of Object.entries(days)) {
      if (!day.startsWith(month)) continue;
      ms += d.ms; shouts += d.shouts; if (d.ms > 0) active++;
      for (const [ign, t] of Object.entries(d.people)) people[ign] = (people[ign] ?? 0) + t;
    }
    return { ms, active, shouts, people: Object.entries(people).sort((a, b) => b[1] - a[1]) };
  }, [days, month]);

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ ...h2, margin: 0 }}>{monthLabel(month)}</h2>
        <div style={{ display: 'flex', gap: '0.25rem', marginLeft: 'auto' }}>
          <button style={{ ...btn('var(--bg-primary)'), color: 'var(--text-primary)', border: '1px solid var(--border-card)' }} aria-label="Previous month"
            onClick={() => { setMonth(shiftMonth(month, -1)); setSelected(null); }}>‹</button>
          <button style={{ ...btn('var(--bg-primary)'), color: 'var(--text-primary)', border: '1px solid var(--border-card)' }}
            onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>This month</button>
          <button style={{ ...btn('var(--bg-primary)'), color: 'var(--text-primary)', border: '1px solid var(--border-card)' }} aria-label="Next month"
            onClick={() => { setMonth(shiftMonth(month, 1)); setSelected(null); }}>›</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.25rem', opacity: current ? 1 : 0.4 }}>
        {WEEKDAYS.map(w => <div key={w} style={{ ...muted, fontSize: '0.7rem', fontWeight: 600, textAlign: 'center', textTransform: 'uppercase' }}>{w}</div>)}
        {monthWeeks(month).flat().map((day, i) => {
          if (!day) return <div key={`pad-${i}`} />;
          const d = current ? days[day] : undefined;
          const ms = d?.ms ?? 0, shouts = d?.shouts ?? 0;
          const future = day > today;
          const isSel = day === selected;
          const desc = `${dayLabel(day)}: ${ms ? `${formatDuration(ms)} pfinder` : 'no pfinder'}, ${shouts} of ${SHOUTS_PER_DAY} shouts`;
          return (
            <button key={day} onClick={() => setSelected(isSel ? null : day)} aria-label={desc} aria-pressed={isSel} title={desc}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem', minWidth: 0, overflow: 'hidden',
                minHeight: '4.2rem', padding: '0.35rem 0.4rem', borderRadius: '0.5rem', cursor: 'pointer', textAlign: 'left',
                background: isSel ? 'var(--chart-tile-active)' : 'var(--bg-primary)',
                border: day === today ? '2px solid var(--color-ocean-400)' : '1px solid var(--border-card)',
                opacity: future ? 0.45 : 1, color: 'var(--text-primary)',
              }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{Number(day.slice(8))}</span>
              {ms > 0 && (
                <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 0.25rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: '0.6rem', height: '0.6rem', borderRadius: '2px', flexShrink: 0, background: SHADES[shadeStep(ms)] }} />
                  {formatDuration(ms)}
                </span>
              )}
              {shouts > 0 && (
                <span style={{ display: 'flex', gap: '2px' }} aria-hidden>
                  {Array.from({ length: SHOUTS_PER_DAY }, (_, k) => (
                    <span key={k} style={{
                      width: '0.4rem', height: '0.4rem', borderRadius: '50%',
                      background: k < shouts ? 'var(--text-secondary)' : 'transparent', border: '1px solid var(--text-muted)',
                    }} />
                  ))}
                </span>
              )}
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
      </div>

      {current && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>This month</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              <b>{formatDuration(totals.ms)}</b> of pfinder over <b>{totals.active}</b> day{totals.active === 1 ? '' : 's'} · <b>{totals.shouts}</b> shout{totals.shouts === 1 ? '' : 's'}
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
          {selected?.startsWith(month) && <DayDetail day={selected} data={data} now={now} busy={busy} run={run} />}
        </div>
      )}
    </section>
  );
}

function DayDetail({ day, data, now, busy, run }: { day: string; data: Data; now: number; busy: boolean; run: Run }) {
  // Each session's part on this day; one that crosses midnight shows on both days
  const sessions = data.sessions.flatMap(s => {
    const end = s.ended_at ? Date.parse(s.ended_at) : now;
    const part = splitByUtcDay(Date.parse(s.started_at), end).find(p => p.day === day);
    return part ? [{ s, ms: part.ms }] : [];
  });
  const shouts = data.shouts.filter(s => utcDay(s.shouted_at) === day);
  const mayDelete = (discordId: string) => discordId === data.me.discord_id || data.me.can_manage;
  const span = (iso: string) => `${utcDay(iso) === day ? '' : `${utcDay(iso).slice(5)} `}${utcTime(iso)}`;
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.83rem', color: 'var(--text-primary)', padding: '0.15rem 0' };

  return (
    <div>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>{dayLabel(day)} (UTC)</div>
      {sessions.length === 0 && shouts.length === 0 && <div style={muted}>Nothing logged.</div>}
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
          <span>Shout at {utcTime(s.shouted_at)}</span>
          <span style={muted}>{s.ign}{s.note ? ` · ${s.note}` : ''}</span>
          <DeleteButton show={mayDelete(s.discord_id)} busy={busy} label="Remove this shout"
            onClick={() => run(async () => { await send(`/api/exec/recruitment/shouts/${s.id}`, 'DELETE'); return 'Removed the shout.'; })} />
        </div>
      ))}
    </div>
  );
}
