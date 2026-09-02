"use client";

import { useCallback, useEffect, useState } from 'react';
import {
  AlliancePayload,
  ChronicleSubmission,
  EventPayload,
  chronicleEventColor,
  eventTypeLabel,
} from '@/lib/chronicle';

// UTC keeps entered dates from displaying one day earlier in negative offsets
const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fmtDate = (iso: string | null) => (iso ? DATE_FMT.format(new Date(iso)) : 'present');

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

  useEffect(() => { load(); }, [load]);

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
              color: s.status === 'approved' ? '#66bb6a' : '#e57373',
              textTransform: 'uppercase',
              marginRight: '0.5rem',
            }}>{s.status}</span>
            {s.targetId !== null ? `edit to ${s.kind}` : `new ${s.kind}`} #{s.id}
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
