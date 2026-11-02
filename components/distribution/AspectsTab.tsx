"use client";

/**
 * The Aspects tab of /exec/distribution: the aspect queue, read-only.
 * Aspects are given out in-game with the TAq management mod; this shows what
 * it works from: owed aspects (paid first), the rotation from whose turn it
 * is, recent distributions and the aspect blacklist. See lib/aspects-db.ts.
 */

import useSWR from 'swr';
import { fetcher } from '@/hooks/fetcher';
import type { AspectOverview } from '@/lib/aspects-db';
import { ago, card, h2, muted, td, th } from './ui';

const name = (ign: string | null, uuid: string) => ign ?? `${uuid.slice(0, 8)}…`;

export default function AspectsTab() {
  const { data, error } = useSWR<AspectOverview>('/api/exec/aspects', fetcher, { refreshInterval: 60000 });
  if (error) return <div style={{ color: '#ef4444', padding: '1rem 0' }}>Failed to load the aspect queue: {error.message}</div>;
  if (!data) return <section style={{ ...card, height: '14rem', opacity: 0.6 }} />;

  const owedHere = data.owed.filter(o => o.in_guild);
  const owedGone = data.owed.filter(o => !o.in_guild);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
        Aspects are given out in-game with the TAq management mod. Each distribution pays owed aspects first, then goes round the rotation from whoever is next. This page only shows the queue.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: '1rem', alignItems: 'start' }}>
        <section style={card}>
          <h2 style={h2}>Owed · {owedHere.reduce((n, o) => n + o.count, 0)} aspects</h2>
          <div style={{ ...muted, marginBottom: '0.5rem' }}>From guild raids, paid before the rotation.</div>
          {owedHere.length === 0 ? <div style={muted}>Nobody in the guild is owed aspects.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Member</th><th style={{ ...th, textAlign: 'right' }}>Aspects</th></tr></thead>
              <tbody>{owedHere.map(o => (
                <tr key={o.uuid}><td style={td}>{name(o.ign, o.uuid)}</td><td style={{ ...td, textAlign: 'right' }}>{o.count}</td></tr>
              ))}</tbody>
            </table>
          )}
          {owedGone.length > 0 && (
            <div style={{ ...muted, marginTop: '0.5rem' }}>
              Held for {owedGone.length} member(s) no longer in the guild ({owedGone.reduce((n, o) => n + o.count, 0)} aspects): {owedGone.map(o => name(o.ign, o.uuid)).join(', ')}.
            </div>
          )}
        </section>

        <section style={card}>
          <h2 style={h2}>Rotation · next {data.rotation.length} of {data.rotation_size}</h2>
          <div style={{ ...muted, marginBottom: '0.5rem' }}>
            Linked members with a week in the guild and 5h of playtime that week, not blacklisted. Rebuilt each time a distribution is previewed
            {data.rotation_updated_at ? `; last ${ago(data.rotation_updated_at)} ago` : ''}.
          </div>
          {data.rotation.length === 0 ? <div style={muted}>The rotation is empty.</div> : (
            <ol style={{ margin: 0, paddingLeft: '1.6rem', columns: data.rotation.length > 10 ? 2 : 1, fontSize: '0.83rem', color: 'var(--text-primary)' }}>
              {data.rotation.map(r => (
                <li key={r.position} style={{ padding: '0.15rem 0', fontWeight: r.position === 1 ? 700 : 400 }}>
                  {name(r.ign, r.uuid)}{r.position === 1 && <span style={{ color: '#22c55e', fontWeight: 600 }}> · next</span>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section style={card}>
        <h2 style={h2}>Recent distributions</h2>
        {data.recent.length === 0 ? <div style={muted}>None yet.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>When</th><th style={th}>By</th><th style={th}>Aspects</th><th style={th}>Emeralds</th><th style={th}>Recipients</th></tr></thead>
            <tbody>{data.recent.map(d => {
              const owed = d.recipients.filter(r => r.source === 'uncollected');
              return (
                <tr key={d.id}>
                  <td style={{ ...td, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{ago(d.created_at)} ago</td>
                  <td style={td}>{d.by ?? '?'}</td>
                  <td style={td}>{d.total_aspects}</td>
                  <td style={td}>{d.total_emeralds ? d.total_emeralds.toLocaleString() : '—'}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    {d.recipients.map(r => `${r.ign}${r.count > 1 ? ` ×${r.count}` : ''}`).join(', ')}
                    {owed.length > 0 && <span style={{ color: 'var(--text-muted)' }}> ({owed.length} paid owed aspects)</span>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </section>

      <section style={card}>
        <h2 style={h2}>Aspect blacklist · {data.blacklist.length}</h2>
        <div style={{ ...muted, marginBottom: '0.5rem' }}>Never put in the rotation. Managed with <code>/aspects blacklist</code> in Discord.</div>
        {data.blacklist.length === 0 ? <div style={muted}>Nobody.</div> : (
          <div style={{ fontSize: '0.83rem', color: 'var(--text-primary)' }}>{data.blacklist.map(b => name(b.ign, b.uuid)).join(', ')}</div>
        )}
      </section>
    </div>
  );
}
