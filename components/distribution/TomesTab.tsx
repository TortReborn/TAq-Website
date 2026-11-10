"use client";

/**
 * The Tomes tab of /exec/distribution (TAQ-116): members request tomes with
 * the bot's "Request tomes" button; any exec member gives them out here.
 * "Give out tomes" works like aspects: say how many you have, check who they
 * go to, confirm. Screenshots of the in-game grant go with the next give. The
 * bot logs every grant in the tome log channel, with its screenshots.
 */

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/hooks/fetcher';
import { compressImageInBrowser } from '@/lib/compress-image-client';
import {
  BUCKETS, MAX_SCREENSHOTS, PRIORITIES, kindLabel, servingOrder, warTomesEarned, warsNeeded,
  type Allocation, type OpenRequest, type TomeBucket, type TomeKind,
} from '@/lib/tomes';
import { ago, btn, card, h2, input, td, th } from './ui';

type Row = OpenRequest & { shells_spent: number; source: string; note: string | null };
interface Event { id: number; ign: string | null; action: string; kind: string | null; count: number; actor_name: string | null; note: string | null; screenshots: string[]; created_at: string }
interface Member {
  uuid: string; ign: string; in_guild: boolean; wars: number | null;
  received: { war: number; raid: number; any: number }; debt: number;
  requests: (Row & { status: string })[]; events: Event[];
}

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? 'Something went wrong');
  return j;
}

/** One file per request: the platform caps a request body at 4.5 MB. */
async function uploadScreenshot(file: File): Promise<string> {
  const { file: toSend } = await compressImageInBrowser(file);
  const form = new FormData();
  form.append('file', toSend);
  const r = await fetch('/api/exec/tomes/screenshots', { method: 'POST', body: form });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Couldn't upload ${file.name}`);
  return j.key;
}

function Priority({ p }: { p: string }) {
  const meta = PRIORITIES.find(x => x.key === p);
  return <span style={{ color: meta?.color ?? 'inherit', fontWeight: 600 }}>{meta?.label ?? p}</span>;
}

export default function TomesTab() {
  const { data, error, mutate } = useSWR<{ requests: Row[]; recent: Event[] }>('/api/exec/tomes', fetcher, { refreshInterval: 30000 });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [shots, setShots] = useState<File[]>([]);

  // Screenshots are in the bucket before the give is recorded, so the bot
  // never sees a grant whose screenshots are still on their way.
  const give: Give = async (url, body) => {
    const screenshots = await Promise.all(shots.map(uploadScreenshot));
    const out = await post(url, { ...body, screenshots });
    setShots([]);
    return out;
  };

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setMessage(null);
    try { setMessage({ ok: true, text: await fn() }); await mutate(); }
    catch (e: any) { setMessage({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };

  if (error) return <div style={{ color: '#ef4444', padding: '2rem' }}>Failed to load the tome queue: {error.message}</div>;
  const requests = data?.requests ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
        Members request tomes with the bot&rsquo;s <b>Request tomes</b> button. Give them out in-game, then record it here with your screenshots; the bot logs each grant in the tome log channel and pings the member.
      </p>
      {message && (
        <div style={{ ...card, padding: '0.6rem 0.8rem', color: message.ok ? '#22c55e' : '#ef4444', borderColor: message.ok ? '#22c55e55' : '#ef444455' }}>{message.text}</div>
      )}
      <Distribute busy={busy} run={run} give={give} shots={shots} setShots={setShots} />
      <Queue requests={requests} loading={!data} busy={busy} run={run} give={give} />
      <MemberLookup busy={busy} run={run} />
      <Recent events={data?.recent ?? []} />
    </div>
  );
}

type Run = (fn: () => Promise<string>) => Promise<void>;
type Give = (url: string, body: object) => Promise<any>;

function Screenshots({ shots, setShots, busy }: { shots: File[]; setShots: (f: File[]) => void; busy: boolean }) {
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = shots.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [shots]);
  const add = (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length) setShots([...shots, ...images].slice(0, MAX_SCREENSHOTS));
  };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => add(Array.from(e.clipboardData?.files ?? []));
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ ...btn('#6b7280'), display: 'inline-block', opacity: busy ? 0.6 : 1 }}>
          Add screenshots
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden disabled={busy} aria-label="Add screenshots"
            onChange={e => { add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </label>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Or paste them. Optional, up to {MAX_SCREENSHOTS}; they go with your next give, from here or a row below.
        </span>
      </div>
      {shots.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {previews.map((src, i) => (
            <div key={src} style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Screenshot ${i + 1}`} style={{ height: '5rem', borderRadius: '0.35rem', display: 'block' }} />
              <button aria-label={`Remove screenshot ${i + 1}`} disabled={busy} onClick={() => setShots(shots.filter((_, j) => j !== i))}
                style={{ ...btn('#ef4444'), position: 'absolute', top: 2, right: 2, padding: '0 0.35rem', lineHeight: 1.4 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Distribute({ busy, run, give, shots, setShots }: { busy: boolean; run: Run; give: Give; shots: File[]; setShots: (f: File[]) => void }) {
  const [tomes, setTomes] = useState('');
  const [plan, setPlan] = useState<Allocation[] | null>(null);
  const total = plan?.reduce((n, p) => n + p.count, 0) ?? 0;

  return (
    <section style={card}>
      <h2 style={h2}>Give out tomes</h2>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input style={{ ...input, width: '9rem' }} inputMode="numeric" placeholder="Tomes you have" value={tomes}
          onChange={e => { setTomes(e.target.value.replace(/\D/g, '')); setPlan(null); }} />
        <button style={btn('#3b82f6')} disabled={busy || !tomes}
          onClick={() => run(async () => {
            const { plan } = await post('/api/exec/tomes/distribute', { tomes: Number(tomes) });
            setPlan(plan);
            return plan.length ? `Preview: ${plan.reduce((n: number, p: Allocation) => n + p.count, 0)} tome(s) to ${plan.length} request(s).` : 'Nothing is waiting.';
          })}>Preview</button>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          The queue first (by priority, then oldest), then give when available, then give when full. Members not in the guild are skipped.
        </span>
      </div>
      <Screenshots shots={shots} setShots={setShots} busy={busy} />
      {plan && plan.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Member</th><th style={th}>Kind</th><th style={th}>Tomes</th><th style={th}>Request</th></tr></thead>
            <tbody>{plan.map(p => (
              <tr key={p.request_id}><td style={td}>{p.ign}</td><td style={td}>{kindLabel(p.kind)}</td><td style={td}>{p.count}</td><td style={{ ...td, color: 'var(--text-muted)' }}>#{p.request_id}</td></tr>
            ))}</tbody>
          </table>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
            <button style={btn('#22c55e')} disabled={busy}
              onClick={() => run(async () => {
                const { given } = await give('/api/exec/tomes/distribute', { plan: plan.map(p => ({ request_id: p.request_id, count: p.count })) });
                setPlan(null); setTomes('');
                return `Recorded ${given} tome(s) as given.`;
              })}>I gave these {total} tomes</button>
            <button style={btn('#6b7280')} onClick={() => setPlan(null)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Queue({ requests, loading, busy, run, give }: { requests: Row[]; loading: boolean; busy: boolean; run: Run; give: Give }) {
  const [showDormant, setShowDormant] = useState(false);
  if (loading) return <section style={{ ...card, height: '12rem', opacity: 0.6 }} />;
  return (
    <section style={card}>
      <h2 style={h2}>Open requests</h2>
      {BUCKETS.map(b => {
        const rows = requests.filter(r => r.bucket === b.key).sort(servingOrder);
        if (b.key === 'dormant' && !showDormant) {
          return rows.length ? (
            <button key={b.key} onClick={() => setShowDormant(true)} style={{ ...btn('transparent'), color: 'var(--text-secondary)', padding: '0.4rem 0' }}>
              ▸ {b.label}: {rows.length} request(s), {rows.reduce((n, r) => n + r.count - r.given, 0)} tomes
            </button>
          ) : null;
        }
        return (
          <div key={b.key} style={{ marginBottom: '0.9rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', margin: '0.3rem 0' }}>
              {b.label} · {rows.reduce((n, r) => n + r.count - r.given, 0)} tomes
            </div>
            {rows.length === 0 ? <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nothing here.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: '52rem', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  {/* the same widths in every bucket, so the columns line up down the page */}
                  <colgroup>
                    <col style={{ width: '24%' }} /><col style={{ width: '7%' }} /><col style={{ width: '15%' }} />
                    <col style={{ width: '10%' }} /><col style={{ width: '7%' }} /><col style={{ width: '6%' }} /><col style={{ width: '31%' }} />
                  </colgroup>
                  <thead><tr>
                    <th style={th}>Member</th><th style={th}>Kind</th><th style={th}>Tomes</th><th style={th}>Priority</th>
                    <th style={th}>Shells</th><th style={th}>Age</th><th style={th}></th>
                  </tr></thead>
                  <tbody>{rows.map(r => <QueueRow key={r.id} r={r} busy={busy} run={run} give={give} />)}</tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function QueueRow({ r, busy, run, give }: { r: Row; busy: boolean; run: Run; give: Give }) {
  const left = r.count - r.given;
  const [n, setN] = useState(String(left));
  return (
    <tr>
      <td style={td}>
        {r.ign}{!r.in_guild && r.bucket !== 'dormant' && <span style={{ color: '#eab308', fontSize: '0.72rem' }}> (left the guild)</span>}
        {r.note && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.note}</div>}
      </td>
      <td style={td}>{kindLabel(r.kind)}</td>
      <td style={td}>{left}{r.given ? <span style={{ color: 'var(--text-muted)' }}> ({r.given} of {r.count} given)</span> : null}</td>
      <td style={td}><Priority p={r.priority} /></td>
      <td style={td}>{r.shells_spent || '—'}</td>
      <td style={{ ...td, color: 'var(--text-muted)' }}>{ago(r.created_at)}</td>
      <td style={{ ...td, whiteSpace: 'nowrap' }}>
        <input style={{ ...input, width: '3.5rem', padding: '0.3rem 0.4rem' }} value={n} onChange={e => setN(e.target.value.replace(/\D/g, ''))} aria-label="Tomes to give" />
        <button style={{ ...btn('#22c55e'), marginLeft: '0.3rem' }} disabled={busy || !Number(n) || !r.in_guild} title={r.in_guild ? undefined : 'Left the guild; their tomes wait until they return'}
          onClick={() => run(async () => { await give(`/api/exec/tomes/${r.id}`, { action: 'give', count: Number(n) }); return `Gave ${n} to ${r.ign}.`; })}>Give</button>
        <select style={{ ...input, marginLeft: '0.3rem', padding: '0.3rem', width: '6.5rem' }} value="" disabled={busy || !r.in_guild}
          onChange={e => {
            const bucket = e.target.value as TomeBucket;
            if (bucket) run(async () => { await post(`/api/exec/tomes/${r.id}`, { action: 'move', bucket }); return `Moved ${r.ign}'s request.`; });
          }}>
          <option value="">Move…</option>
          {BUCKETS.filter(b => b.key !== r.bucket).map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <button style={{ ...btn('#ef4444'), marginLeft: '0.3rem' }} disabled={busy}
          onClick={() => {
            const reason = window.prompt(`Cancel ${left} ${kindLabel(r.kind).toLowerCase()} tome(s) for ${r.ign}?${r.kind === 'raid' ? ' Their shells for these go back.' : ''}\nReason:`);
            if (reason === null) return;
            run(async () => {
              const { refunded } = await post(`/api/exec/tomes/${r.id}`, { action: 'cancel', reason });
              return `Cancelled ${r.ign}'s request${refunded ? `, refunding ${refunded} shells` : ''}.`;
            });
          }}>Cancel</button>
      </td>
    </tr>
  );
}

function MemberLookup({ busy, run }: { busy: boolean; run: Run }) {
  const [ign, setIgn] = useState('');
  const [query, setQuery] = useState('');
  const { data: m, error, mutate } = useSWR<Member>(query ? `/api/exec/tomes/member?ign=${encodeURIComponent(query)}` : null, fetcher);
  const [form, setForm] = useState({ action: 'debt', kind: 'war', count: '', note: '' });

  const earned = m?.wars != null ? warTomesEarned(m.wars) : null;
  return (
    <section style={card}>
      <h2 style={h2}>Look up a member</h2>
      <form onSubmit={e => { e.preventDefault(); setQuery(ign.trim()); }} style={{ display: 'flex', gap: '0.5rem' }}>
        <input style={{ ...input, width: '14rem' }} placeholder="IGN" value={ign} onChange={e => setIgn(e.target.value)} />
        <button style={btn('#3b82f6')} type="submit">Look up</button>
      </form>
      {error && query && <div style={{ color: '#ef4444', fontSize: '0.83rem', marginTop: '0.5rem' }}>{error.message}</div>}
      {m && (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
            <b>{m.ign}</b>{!m.in_guild && <span style={{ color: '#eab308' }}> · not in the guild</span>}
            <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              War tomes: {m.received.war} received{m.debt ? ` (${m.debt} of them debt)` : ''}
              {earned != null && <> · {earned} earned from {m.wars!.toLocaleString()} lifetime wars (last count the bot saw) · next at {warsNeeded(Math.max(earned, m.received.war) + 1).toLocaleString()}</>}
              <br />Shell tomes: {m.received.raid} received{m.received.any ? ` · ${m.received.any} with no kind recorded` : ''}
            </div>
          </div>
          <form style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}
            onSubmit={e => {
              e.preventDefault();
              run(async () => {
                await post('/api/exec/tomes/member', { ign: m.ign, action: form.action, kind: form.kind, count: Number(form.count), note: form.note });
                setForm({ ...form, count: '', note: '' }); await mutate();
                return form.action === 'debt' ? `Recorded ${form.count} war tome(s) of debt for ${m.ign}.` : `Adjusted ${m.ign}'s ${kindLabel(form.kind as TomeKind).toLowerCase()} tomes by ${form.count}.`;
              });
            }}>
            <select style={input} value={form.action} onChange={e => setForm({ ...form, action: e.target.value })}>
              <option value="debt">Record debt (given before earned)</option>
              <option value="adjust">Adjust tomes received</option>
            </select>
            {form.action === 'adjust' && (
              <select style={input} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                <option value="war">War</option><option value="raid">Shell</option>
              </select>
            )}
            <input style={{ ...input, width: '6rem' }} placeholder={form.action === 'adjust' ? '+/- tomes' : 'Tomes'} value={form.count}
              onChange={e => setForm({ ...form, count: e.target.value.replace(/[^\d-]/g, '') })} />
            <input style={{ ...input, flex: 1, minWidth: '12rem' }} placeholder="Why (required)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            <button style={btn('#a855f7')} type="submit" disabled={busy || !form.count || !form.note.trim()}>Record</button>
          </form>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>History ({m.events.length})</summary>
            <EventTable events={m.events} showMember={false} />
          </details>
        </div>
      )}
    </section>
  );
}

function EventTable({ events, showMember }: { events: Event[]; showMember: boolean }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.4rem' }}>
      <tbody>{events.map(e => (
        <tr key={e.id}>
          <td style={{ ...td, color: 'var(--text-muted)', width: '3rem' }}>{ago(e.created_at)}</td>
          {showMember && <td style={td}>{e.ign ?? '?'}</td>}
          <td style={td}>{e.action}{e.count ? ` ${e.count}` : ''} {e.kind ?? ''}</td>
          <td style={{ ...td, color: 'var(--text-secondary)' }}>{e.actor_name ?? ''}</td>
          <td style={{ ...td, color: 'var(--text-muted)' }}>
            {e.note ?? ''}
            {e.screenshots?.map((key, i) => (
              <a key={key} href={`/api/exec/tomes/screenshots?key=${encodeURIComponent(key)}`} target="_blank" rel="noreferrer" style={{ marginRight: '0.4rem' }}>
                Screenshot{e.screenshots.length > 1 ? ` ${i + 1}` : ''}
              </a>
            ))}
          </td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function Recent({ events }: { events: Event[] }) {
  return (
    <section style={card}>
      <h2 style={h2}>Recent activity</h2>
      {events.length ? <EventTable events={events} showMember /> : <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nothing yet.</div>}
    </section>
  );
}
