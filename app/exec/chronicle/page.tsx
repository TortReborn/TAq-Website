"use client";

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  AlliancePayload,
  ChronicleAlliance,
  ChronicleEvent,
  ChronicleSubmission,
  EventPayload,
  chronicleEventColor,
  eventTypeLabel,
} from '@/lib/chronicle';
import { SubmitForm, FormState } from '@/components/ChroniclePanel';

// Date-only values (stored as UTC midnight) display as bare dates in UTC so
// they never shift a day; values with a time-of-day display in local time.
const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const DATETIME_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtDate = (iso: string | null) => {
  if (!iso) return 'present';
  const d = new Date(iso);
  const dateOnly = iso.endsWith('Z') && d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  return dateOnly ? DATE_FMT.format(d) : DATETIME_FMT.format(d);
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '0.75rem',
  padding: '1rem 1.25rem',
  marginBottom: '1rem',
};

const btnStyle = (variant: 'approve' | 'reject' | 'plain'): React.CSSProperties => ({
  height: '32px',
  padding: '0 0.9rem',
  borderRadius: '0.375rem',
  border: variant === 'plain' ? '1px solid var(--border-color)' : 'none',
  background: variant === 'approve' ? '#2e7d32' : variant === 'reject' ? '#c62828' : 'var(--bg-secondary)',
  color: variant === 'plain' ? 'var(--text-primary)' : '#fff',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
});

function AlliancePayloadView({ p }: { p: AlliancePayload }) {
  return (
    <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
        <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: p.color }} />
        <strong>{p.name}</strong>{p.tag && <span style={{ color: 'var(--text-secondary)' }}>[{p.tag}]</span>}
      </div>
      {p.description && <div style={{ color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>{p.description}</div>}
      <table style={{ fontSize: '0.78rem', borderSpacing: 0 }}>
        <tbody>
          {p.memberships.map((m, i) => (
            <tr key={i}>
              <td style={{ paddingRight: '1rem' }}>{m.guild}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{fmtDate(m.joinedAt)} → {fmtDate(m.leftAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventPayloadView({ p }: { p: EventPayload }) {
  return (
    <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
      <div style={{ marginBottom: '0.35rem' }}>
        <span style={{ color: chronicleEventColor(p.eventType), fontWeight: 700, marginRight: '0.5rem' }}>{eventTypeLabel(p.eventType)}</span>
        <strong>{p.title}</strong>
        <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
          {fmtDate(p.startsAt)}{p.endsAt ? ` → ${fmtDate(p.endsAt)}` : ''}
        </span>
      </div>
      {(p.alliances ?? []).length > 0 && (
        <div style={{ color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Alliances: {p.alliances.join(', ')}</div>
      )}
      {p.guilds.length > 0 && (
        <div style={{ color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Guilds: {p.guilds.join(', ')}</div>
      )}
      {p.description && <div style={{ color: 'var(--text-secondary)' }}>{p.description}</div>}
    </div>
  );
}

export default function ExecChroniclePage() {
  const [pending, setPending] = useState<ChronicleSubmission[]>([]);
  const [recent, setRecent] = useState<ChronicleSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Published entries, editable directly by execs
  const [published, setPublished] = useState<{ alliances: ChronicleAlliance[]; events: ChronicleEvent[] }>({ alliances: [], events: [] });
  const [guilds, setGuilds] = useState<{ name: string; prefix: string }[]>([]);
  const [editForm, setEditForm] = useState<FormState>({ mode: 'closed' });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/chronicle/review');
      if (!res.ok) {
        setError(res.status === 401 ? 'Exec access required' : `Failed to load (${res.status})`);
        return;
      }
      const data = await res.json();
      setPending(data.pending ?? []);
      setRecent(data.recent ?? []);
      setError(null);
    } catch {
      setError('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPublished = useCallback(async () => {
    try {
      const res = await fetch('/api/chronicle', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setPublished({ alliances: data.alliances ?? [], events: data.events ?? [] });
      }
    } catch { /* section stays empty */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPublished(); }, [loadPublished]);
  useEffect(() => {
    fetch('/api/guilds/list')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.guilds) {
          setGuilds(data.guilds.map((name: string, i: number) => ({ name, prefix: data.prefixes[i] || '' })));
        }
      })
      .catch(() => {});
  }, []);

  const deleteEntity = async (kind: 'alliance' | 'event', targetId: number, name: string) => {
    if (!window.confirm(`Delete ${kind} "${name}"? It disappears from the map immediately. This cannot be undone.`)) return;
    try {
      const res = await fetch('/api/chronicle/admin', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, targetId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(body.error ?? `Delete failed (${res.status})`);
        return;
      }
      await Promise.all([loadPublished(), load()]);
    } catch {
      alert('Network error — please try again');
    }
  };

  const decide = async (id: number, approve: boolean) => {
    const note = approve ? '' : (window.prompt('Reason for rejection (optional):') ?? '');
    setBusyId(id);
    try {
      const res = await fetch('/api/chronicle/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approve, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(body.error ?? `Decision failed (${res.status})`);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)' }}>Loading submissions…</div>;
  }
  if (error) {
    return <div style={{ color: '#e57373' }}>{error}</div>;
  }

  const renderPayload = (s: ChronicleSubmission) =>
    s.kind === 'alliance'
      ? <AlliancePayloadView p={s.payload as AlliancePayload} />
      : <EventPayloadView p={s.payload as EventPayload} />;

  return (
    <div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
        Map Chronicle
      </h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Community-submitted alliances and historical events for the map. Approving a submission
        publishes it immediately; edits replace the current entry. The full decision log below is
        the audit trail.
      </p>

      <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
        Published entries
      </h2>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Direct edits publish immediately — no review step. They still appear in the decision log.
      </p>
      {editForm.mode !== 'closed' ? (
        <div style={{ ...cardStyle, maxWidth: '440px' }}>
          <SubmitForm
            form={editForm}
            guilds={guilds}
            allianceNames={published.alliances.map(a => a.name)}
            direct
            onDone={() => { setEditForm({ mode: 'closed' }); loadPublished(); load(); }}
            onCancel={() => setEditForm({ mode: 'closed' })}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ ...cardStyle, flex: '1 1 320px', marginBottom: 0 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.5rem' }}>
              Alliances ({published.alliances.length})
            </div>
            {published.alliances.length === 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>None published yet.</div>
            )}
            {published.alliances.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', fontSize: '0.82rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: a.color, flexShrink: 0 }} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{a.name}</span>
                {a.tag && <span style={{ color: 'var(--text-secondary)' }}>[{a.tag}]</span>}
                <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                  {new Set(a.memberships.map(m => m.guild)).size} guilds
                </span>
                <button type="button" title="Edit directly" style={{ ...btnStyle('plain'), height: '26px', padding: '0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  onClick={() => setEditForm({
                    mode: 'alliance',
                    targetId: a.id,
                    initial: { name: a.name, tag: a.tag, color: a.color, description: a.description, memberships: a.memberships.map(m => ({ ...m })) },
                  })}>
                  <Pencil size={12} /> Edit
                </button>
                <button type="button" title="Delete" style={{ ...btnStyle('plain'), height: '26px', padding: '0 0.4rem', display: 'flex', alignItems: 'center', color: '#e57373' }}
                  onClick={() => deleteEntity('alliance', a.id, a.name)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ ...cardStyle, flex: '1 1 320px', marginBottom: 0 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.5rem' }}>
              Events ({published.events.length})
            </div>
            {published.events.length === 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>None published yet.</div>
            )}
            {published.events.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', fontSize: '0.82rem' }}>
                <span style={{ color: chronicleEventColor(e.eventType), fontWeight: 700, flexShrink: 0 }}>{eventTypeLabel(e.eventType)}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{e.title}</span>
                <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  {fmtDate(e.startsAt)}{e.endsAt ? ` → ${fmtDate(e.endsAt)}` : ''}
                </span>
                <button type="button" title="Edit directly" style={{ ...btnStyle('plain'), height: '26px', padding: '0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  onClick={() => setEditForm({
                    mode: 'event',
                    targetId: e.id,
                    initial: {
                      eventType: e.eventType, title: e.title, description: e.description,
                      startsAt: e.startsAt, endsAt: e.endsAt,
                      guilds: [...e.guilds], alliances: [...(e.alliances ?? [])],
                    },
                  })}>
                  <Pencil size={12} /> Edit
                </button>
                <button type="button" title="Delete" style={{ ...btnStyle('plain'), height: '26px', padding: '0 0.4rem', display: 'flex', alignItems: 'center', color: '#e57373' }}
                  onClick={() => deleteEntity('event', e.id, e.title)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: '2rem 0 0.75rem' }}>
        Pending ({pending.length})
      </h2>
      {pending.length === 0 && (
        <div style={{ ...cardStyle, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Nothing waiting for review.
        </div>
      )}
      {pending.map((s) => (
        <div key={s.id} style={cardStyle} data-testid="chronicle-pending-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.6rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>
                {s.targetId !== null ? `Edit to existing ${s.kind}` : `New ${s.kind}`}
              </strong>
              {' · '}#{s.id} · by {s.submittedName || s.submittedBy} · {fmtDate(s.submittedAt)}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button type="button" disabled={busyId === s.id} style={btnStyle('approve')} onClick={() => decide(s.id, true)}>
                Approve
              </button>
              <button type="button" disabled={busyId === s.id} style={btnStyle('reject')} onClick={() => decide(s.id, false)}>
                Reject
              </button>
            </div>
          </div>
          {renderPayload(s)}
          {s.note && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              Submitter note: {s.note}
            </div>
          )}
        </div>
      ))}

      <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: '2rem 0 0.75rem' }}>
        Recent decisions
      </h2>
      {recent.length === 0 && (
        <div style={{ ...cardStyle, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          No decisions yet.
        </div>
      )}
      {recent.map((s) => (
        <div key={s.id} style={{ ...cardStyle, opacity: 0.85 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            <span style={{
              fontWeight: 700,
              color: s.reviewNote === 'direct exec delete' ? '#e57373' : s.status === 'approved' ? '#66bb6a' : '#e57373',
              textTransform: 'uppercase',
              marginRight: '0.5rem',
            }}>{s.reviewNote === 'direct exec delete' ? 'DELETED' : s.status}</span>
            {s.reviewNote === 'direct exec delete'
              ? `deleted ${s.kind}`
              : s.targetId !== null ? `edit to ${s.kind}` : `new ${s.kind}`} #{s.id}
            {' · '}by {s.submittedName || s.submittedBy}
            {' · '}reviewed by {s.reviewedBy} {s.reviewedAt ? `on ${fmtDate(s.reviewedAt)}` : ''}
            {s.reviewNote && <> · “{s.reviewNote}”</>}
          </div>
          {renderPayload(s)}
        </div>
      ))}
    </div>
  );
}
