import { useEffect, useState } from 'react';
import { useExecGraid, useExecGraidLeaderboard } from '@/hooks/useExecGraid';
import { getRankColor } from '@/lib/rank-constants';
import { formatLePayout, formatPayout, formatPoints } from '@/lib/currency';
import { RAID_NAMES, RAID_SHORT_NAMES } from '@/lib/raid-constants';

const DEFAULT_RAID_POINTS = {
  "Nest of the Grootslangs": "2",
  "The Canyon Colossus": "3",
  "The Nameless Anomaly": "4",
  "Orphion's Nexus of Light": "5",
  "The Wartorn Palace": "6",
};

type BonusRow = { left: string; points: string };

const DEFAULT_PLACEMENTS: BonusRow[] = [
  { left: '1', points: '192' },
  { left: '2', points: '128' },
  { left: '3', points: '64' },
];

function parseBonusRows(rows: BonusRow[], leftKey: 'threshold' | 'placement', label: string) {
  return rows
    .filter(r => r.left.trim() || r.points.trim())
    .map(r => {
      // Number('') is 0, so a half-filled row would otherwise save as a 0-point bonus
      if (!r.left.trim() || !r.points.trim()) {
        throw new Error(`Every ${label} row needs both a ${leftKey} and bonus points`);
      }
      const left = Number(r.left);
      const points = Number(r.points);
      if (!Number.isInteger(left) || left <= 0 || !Number.isInteger(points) || points < 0) {
        throw new Error(`Every ${label} row needs a positive whole ${leftKey} and non-negative whole bonus points`);
      }
      return { [leftKey]: left, points };
    })
    .sort((a, b) => a[leftKey] - b[leftKey]);
}

function toBonusRows(items: any[] | undefined, leftKey: 'threshold' | 'placement'): BonusRow[] {
  return (items ?? []).map(item => ({ left: String(item[leftKey]), points: String(item.points) }));
}

function isNonNegativePointDecimal(value: string) {
  return /^\d+(\.\d{1,2})?$/.test(value.trim());
}

const PLACE_COLORS: Record<number, string> = { 1: '#eab308', 2: '#9ca3af', 3: '#b45309' };

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: '700',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

function DetailTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div style={{ flex: '1 1 auto', background: 'var(--bg-primary)', border: '1px solid var(--border-card)', borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
      <div style={{ ...sectionLabelStyle, marginBottom: '0.25rem', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{sub}</div>}
    </div>
  );
}

function ChipGroup({ label, chips }: { label: string; chips: { key: string; left: string; right: string; color?: string }[] }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...sectionLabelStyle, marginBottom: '0.4rem' }}>{label}</div>
      {chips.length === 0 ? (
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>None</span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {chips.map(c => (
            <span key={c.key} style={{ display: 'inline-flex', alignItems: 'stretch', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-card)', fontSize: '0.75rem', lineHeight: 1 }}>
              <span style={{ padding: '0.3rem 0.5rem', background: 'var(--bg-primary)', color: c.color ?? 'var(--text-secondary)', fontWeight: '600' }}>{c.left}</span>
              <span style={{ padding: '0.3rem 0.5rem', background: 'rgba(59, 130, 246, 0.12)', color: 'var(--text-primary)', fontWeight: '700' }}>{c.right}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BonusRowsEditor({ label, leftHeader, leftPlaceholder, rows, onChange, inputStyle }: {
  label: string;
  leftHeader: string;
  leftPlaceholder: string;
  rows: BonusRow[];
  onChange: (rows: BonusRow[]) => void;
  inputStyle: React.CSSProperties;
}) {
  const update = (i: number, patch: Partial<BonusRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const compact: React.CSSProperties = { ...inputStyle, padding: '0.35rem 0.5rem' };
  return (
    <div>
      <div style={{ ...sectionLabelStyle, marginBottom: '0.5rem' }}>{label}</div>
      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.75rem', gap: '0.35rem 0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{leftHeader}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Bonus points</span>
          <span />
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <input value={r.left} onChange={e => update(i, { left: e.target.value })} style={compact} type="number" min={1} placeholder={leftPlaceholder} />
              <input value={r.points} onChange={e => update(i, { points: e.target.value })} style={compact} type="number" min={0} placeholder="0" />
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                aria-label={`Remove ${label.toLowerCase()} row`}
                style={{ width: '1.75rem', height: '1.75rem', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0.375rem', border: 'none', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer' }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange([...rows, { left: '', points: '' }])}
        style={{ marginTop: rows.length > 0 ? '0.5rem' : 0, width: '100%', padding: '0.35rem', borderRadius: '0.375rem', border: '1px dashed var(--border-card)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}
      >
        + Add
      </button>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', color: checked ? 'var(--text-primary)' : 'var(--text-secondary)', userSelect: 'none' }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{ position: 'relative', width: '2.1rem', height: '1.2rem', borderRadius: '999px', border: 'none', padding: 0, cursor: 'pointer', background: checked ? '#f59e0b' : 'rgba(107, 114, 128, 0.4)', transition: 'background 0.15s', flexShrink: 0 }}
      >
        <span style={{ position: 'absolute', top: '0.15rem', left: checked ? '1.05rem' : '0.15rem', width: '0.9rem', height: '0.9rem', borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
      </button>
      {label}
    </label>
  );
}

export default function GraidEvents() {
  const { events, loading, error, refresh, createEvent, endEvent, updateEvent } = useExecGraid();
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const { markPaid, ...leaderboard } = useExecGraidLeaderboard(selectedEventId);

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [minPoints, setMinPoints] = useState('1');
  const [lePerPoint, setLePerPoint] = useState('1');
  const [endDate, setEndDate] = useState('');
  const [raidPoints, setRaidPoints] = useState<Record<string, string>>({ ...DEFAULT_RAID_POINTS });
  const [milestones, setMilestones] = useState<BonusRow[]>([]);
  const [placementBonuses, setPlacementBonuses] = useState<BonusRow[]>(DEFAULT_PLACEMENTS);

  useEffect(() => {
    if (events.length > 0 && selectedEventId === null) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const selectedEvent = events.find(e => e.id === selectedEventId) ?? null;
  const selectedIsLegacy = selectedEvent?.rewardMode === 'legacy';
  // Payouts only settle once an event ends, so the unpaid filter is a past-event tool.
  const canFilterUnpaid = !!selectedEvent && !selectedEvent.active;
  const unpaidRows = leaderboard.rows.filter(r => r.meetsMin && !r.paid);
  const visibleRows = canFilterUnpaid && unpaidOnly ? unpaidRows : leaderboard.rows;

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-card)',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    color: 'var(--text-primary)',
    fontSize: '0.875rem',
    outline: 'none',
    width: '100%',
  };
  const btnStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: '600',
    transition: 'opacity 0.15s',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '0.8rem',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    marginBottom: '0.25rem',
    display: 'block',
  };

  const resetForm = () => {
    setTitle('');
    setMinPoints('1');
    setLePerPoint('1');
    setEndDate('');
    setRaidPoints({ ...DEFAULT_RAID_POINTS });
    setMilestones([]);
    setPlacementBonuses(DEFAULT_PLACEMENTS);
    setFormError(null);
  };

  const toLocalDateTime = (value: string | null) => {
    if (!value) return '';
    const d = new Date(value);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const startEdit = (ev: typeof selectedEvent) => {
    if (!ev) return;
    // Create and edit share one set of form fields, so only one can be open
    setShowCreate(false);
    setEditingId(ev.id);
    setTitle(ev.title);
    setMinPoints(String(ev.minPoints));
    setLePerPoint(String(ev.lePerPoint));
    setEndDate(toLocalDateTime(ev.endTs));
    setRaidPoints(Object.fromEntries(RAID_NAMES.map(name => [name, String(ev.raidPoints?.[name] ?? 0)])));
    setMilestones(toBonusRows(ev.milestones, 'threshold'));
    setPlacementBonuses(toBonusRows(ev.placementBonuses, 'placement'));
    setFormError(null);
  };

  const buildPayload = () => {
    if (!title.trim()) throw new Error('Title is required');
    if (!endDate) throw new Error('End date is required');

    const parsedMinPoints = Number(minPoints);
    const parsedLePerPoint = Number(lePerPoint);
    if (!Number.isInteger(parsedMinPoints) || parsedMinPoints < 0) {
      throw new Error('Minimum points must be a non-negative integer');
    }
    if (!Number.isInteger(parsedLePerPoint) || parsedLePerPoint <= 0) {
      throw new Error('LE per point must be a positive integer');
    }

    const parsedRaidPoints: Record<string, number> = {};
    for (const raidName of RAID_NAMES) {
      const value = Number(raidPoints[raidName]);
      if (!isNonNegativePointDecimal(raidPoints[raidName]) || !Number.isFinite(value)) {
        throw new Error(`${RAID_SHORT_NAMES[raidName]} points must be a non-negative decimal with at most 2 decimal places`);
      }
      parsedRaidPoints[raidName] = value;
    }

    return {
      title: title.trim(),
      minPoints: parsedMinPoints,
      lePerPoint: parsedLePerPoint,
      raidPoints: parsedRaidPoints,
      milestones: parseBonusRows(milestones, 'threshold', 'milestone') as { threshold: number; points: number }[],
      placementBonuses: parseBonusRows(placementBonuses, 'placement', 'placement bonus') as { placement: number; points: number }[],
      endDate: new Date(endDate).toISOString(),
    };
  };

  const handleCreate = async () => {
    setFormError(null);
    try {
      const result = await createEvent(buildPayload());
      resetForm();
      setShowCreate(false);
      if (result.id) setSelectedEventId(result.id);
    } catch (e: any) {
      setFormError(e.message);
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setFormError(null);
    try {
      await updateEvent(editingId, buildPayload());
      setEditingId(null);
      resetForm();
    } catch (e: any) {
      setFormError(e.message);
    }
  };

  const handleEnd = async () => {
    if (!selectedEvent) return;
    await endEvent(selectedEvent.id);
    setConfirmEnd(false);
  };

  const getEventStatus = (ev: typeof events[0]) => {
    if (ev.active) return 'Current';
    if (!ev.endTs && new Date(ev.startTs) > new Date()) return 'Future';
    return 'Past';
  };

  const statusColors: Record<string, { bg: string; text: string }> = {
    Current: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
    Future: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
    Past: { bg: 'rgba(107, 114, 128, 0.15)', text: '#6b7280' },
  };

  const headerActions = (
    <>
      <button
        onClick={refresh}
        style={{ ...btnStyle, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}
      >
        Refresh
      </button>
      <button
        onClick={() => { setEditingId(null); resetForm(); setShowCreate(true); }}
        disabled={showCreate}
        style={{ ...btnStyle, background: '#22c55e', color: '#fff', opacity: showCreate ? 0.5 : 1, cursor: showCreate ? 'default' : 'pointer' }}
      >
        + New Event
      </button>
    </>
  );

  const fieldLabelStyle: React.CSSProperties = { ...sectionLabelStyle, display: 'block', marginBottom: '0.3rem' };
  const panelStyle: React.CSSProperties = { padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: '0.5rem', border: '1px solid var(--border-card)' };

  const formActions = (onSubmit: () => void, submitLabel: string, onCancel: () => void) => (
    <>
      <button onClick={onCancel} style={{ ...btnStyle, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>Cancel</button>
      <button onClick={onSubmit} style={{ ...btnStyle, background: '#22c55e', color: '#fff' }}>{submitLabel}</button>
    </>
  );

  const renderForm = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.25rem' }}>
      {formError && (
        <div style={{ color: '#ef4444', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.375rem', padding: '0.5rem 0.75rem' }}>{formError}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
        <div>
          <label style={fieldLabelStyle}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="e.g. Raid Week 10/16" />
        </div>
        <div>
          <label style={fieldLabelStyle}>Ends</label>
          <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} required />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.75rem' }}>
        <div>
          <label style={fieldLabelStyle}>Min Points</label>
          <input value={minPoints} onChange={e => setMinPoints(e.target.value)} style={inputStyle} type="number" min={0} />
        </div>
        <div>
          <label style={fieldLabelStyle}>LE per Point</label>
          <input value={lePerPoint} onChange={e => setLePerPoint(e.target.value)} style={inputStyle} type="number" min={1} />
        </div>
      </div>
      <div style={panelStyle}>
        <div style={{ ...sectionLabelStyle, marginBottom: '0.5rem' }}>Raid Points</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '0.5rem' }}>
          {RAID_NAMES.map(raidName => (
            <div key={raidName}>
              <label style={{ ...labelStyle, fontSize: '0.75rem' }}>{RAID_SHORT_NAMES[raidName]}</label>
              <input
                value={raidPoints[raidName]}
                onChange={e => setRaidPoints(prev => ({ ...prev, [raidName]: e.target.value }))}
                style={inputStyle}
                type="number"
                min={0}
                step="0.01"
              />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem', alignItems: 'start' }}>
        <div style={panelStyle}>
          <BonusRowsEditor label="Milestones" leftHeader="At points" leftPlaceholder="50" rows={milestones} onChange={setMilestones} inputStyle={inputStyle} />
        </div>
        <div style={panelStyle}>
          <BonusRowsEditor label="Placement Bonuses" leftHeader="Place" leftPlaceholder="1" rows={placementBonuses} onChange={setPlacementBonuses} inputStyle={inputStyle} />
        </div>
      </div>
    </div>
  );

  if (loading && events.length === 0) {
    return (
      <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', height: '400px', animation: 'pulse 1.5s ease-in-out infinite' }}>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '1rem', color: '#ef4444' }}>
        Failed to load events: {error}
      </div>
    );
  }

  return (
    <div>

      {showCreate && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>New Event</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              {formActions(handleCreate, 'Create Event', () => { setShowCreate(false); resetForm(); })}
            </div>
          </div>
          {renderForm()}
        </div>
      )}

      <style>{`
        .graid-layout { display: flex; gap: 1.5rem; align-items: flex-start; }
        .graid-list { flex: 0 0 340px; }
        .graid-list-scroll { max-height: calc(100vh - 300px); overflow-y: auto; }
        @media (max-width: 768px) {
          .graid-layout { flex-direction: column; align-items: stretch; gap: 1rem; }
          .graid-list { flex: none; }
          .graid-list-scroll { max-height: 40vh; }
        }
        /* Keep Payout and the Paid checkbox on screen on phones; Rank and Reward Points are the expendable columns */
        @media (max-width: 600px) {
          .graid-table { min-width: 0 !important; }
          .graid-col-optional { display: none; }
        }
      `}</style>
      <div className="graid-layout">
        <div className="graid-list" style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-card)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              All Events
              <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>({events.length})</span>
            </h2>
          </div>
          <div className="graid-list-scroll">
            {events.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No events yet</div>
            )}
            {events.map(ev => {
              const status = getEventStatus(ev);
              const isSelected = selectedEventId === ev.id;
              const sc = statusColors[status];
              return (
                <div
                  key={ev.id}
                  onClick={() => setSelectedEventId(ev.id)}
                  style={{
                    padding: '0.75rem 1.25rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-card)',
                    background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--color-ocean-400)' : '3px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: '700',
                      padding: '0.1rem 0.35rem',
                      borderRadius: '0.2rem',
                      background: sc.bg,
                      color: sc.text,
                      textTransform: 'uppercase',
                    }}>
                      {status}
                    </span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.title}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    {new Date(ev.startTs).toLocaleDateString()} - {ev.endTs ? new Date(ev.endTs).toLocaleDateString() : 'Ongoing'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedEvent ? (
            <>
              <div style={{
                background: 'var(--bg-card)',
                borderRadius: '0.75rem',
                border: selectedEvent.active ? '2px solid #22c55e' : '1px solid var(--border-card)',
                padding: '1.25rem',
                marginBottom: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                    {selectedEvent.active && (
                      <span style={{ background: '#22c55e', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: '700' }}>ACTIVE</span>
                    )}
                    <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>{selectedEvent.title}</h2>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    {editingId === selectedEvent.id ? (
                      formActions(handleUpdate, 'Save Changes', () => { setEditingId(null); resetForm(); })
                    ) : (
                      <>
                        {selectedEvent.active && (
                          <>
                            <button onClick={() => startEdit(selectedEvent)} style={{ ...btnStyle, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>Edit</button>
                            {confirmEnd ? (
                              <div style={{ display: 'flex', gap: '0.375rem' }}>
                                <button onClick={handleEnd} style={{ ...btnStyle, background: '#ef4444', color: '#fff' }}>Confirm End</button>
                                <button onClick={() => setConfirmEnd(false)} style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmEnd(true)} style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>End Event</button>
                            )}
                            <span style={{ width: '1px', alignSelf: 'stretch', background: 'var(--border-card)', margin: '0 0.15rem' }} />
                          </>
                        )}
                        {headerActions}
                      </>
                    )}
                  </div>
                </div>

                {editingId === selectedEvent.id ? (
                  renderForm()
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <DetailTile label="Started" value={new Date(selectedEvent.startTs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} />
                      {selectedEvent.endTs && (
                        <DetailTile
                          label={selectedEvent.active ? 'Ends' : 'Ended'}
                          value={new Date(selectedEvent.endTs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          sub={new Date(selectedEvent.endTs).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        />
                      )}
                      {selectedIsLegacy ? (
                        <>
                          <DetailTile label="Mode" value="Legacy" />
                          <DetailTile label="Low Reward" value={formatPayout(selectedEvent.low)} sub="per raid" />
                          <DetailTile label="High Reward" value={formatPayout(selectedEvent.high)} sub="per raid" />
                          <DetailTile label="Min Completions" value={selectedEvent.minc} />
                          {selectedEvent.bonusThreshold != null && <DetailTile label="Bonus At" value={`${selectedEvent.bonusThreshold} raids`} />}
                          {selectedEvent.bonusAmount != null && <DetailTile label="Bonus" value={`${selectedEvent.bonusAmount} LE`} />}
                        </>
                      ) : (
                        <>
                          <DetailTile label="Mode" value="Points" />
                          <DetailTile label="Min Points" value={selectedEvent.minPoints} />
                          <DetailTile label="LE per Point" value={selectedEvent.lePerPoint} />
                        </>
                      )}
                    </div>
                    {!selectedIsLegacy && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                        <ChipGroup
                          label="Raid Points"
                          chips={RAID_NAMES.map(name => ({ key: name, left: RAID_SHORT_NAMES[name], right: formatPoints(selectedEvent.raidPoints?.[name] ?? 0) }))}
                        />
                        <ChipGroup
                          label="Milestones"
                          chips={(selectedEvent.milestones ?? []).map(m => ({ key: String(m.threshold), left: `${m.threshold} pts`, right: `+${m.points}` }))}
                        />
                        <ChipGroup
                          label="Placements"
                          chips={(selectedEvent.placementBonuses ?? []).map(p => ({ key: String(p.placement), left: ordinal(p.placement), right: `+${p.points}`, color: PLACE_COLORS[p.placement] }))}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {leaderboard.rows.length > 0 && (() => {
                const eligibleRows = leaderboard.rows.filter(r => r.meetsMin);
                const totalLE = eligibleRows.reduce((sum, r) => sum + r.payoutLe, 0);
                const paidLE = eligibleRows.filter(r => r.paid).reduce((sum, r) => sum + r.payoutLe, 0);
                const pct = totalLE > 0 ? Math.round((paidLE / totalLE) * 100) : 0;
                const paidCount = eligibleRows.filter(r => r.paid).length;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1rem 1.25rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Total Event Payout</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-primary)' }}>{formatLePayout(totalLE)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{eligibleRows.length} eligible players</div>
                    </div>
                    <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1rem 1.25rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Paid Out</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#22c55e' }}>{formatLePayout(paidLE)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{paidCount} / {eligibleRows.length} players paid</div>
                    </div>
                    <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1rem 1.25rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Remaining</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '800', color: pct === 100 ? '#22c55e' : '#f59e0b' }}>{formatLePayout(totalLE - paidLE)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: '2px', background: '#22c55e', transition: 'width 0.3s ease' }} />
                          </div>
                          <span>{pct}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
                <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                    Leaderboard
                    {leaderboard.rows.length > 0 && (
                      <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                        {canFilterUnpaid && unpaidOnly
                          ? `(${unpaidRows.length} of ${leaderboard.rows.length} unpaid)`
                          : `(${leaderboard.rows.length} participants)`}
                      </span>
                    )}
                  </h3>
                  {canFilterUnpaid && leaderboard.rows.length > 0 && (
                    <Switch checked={unpaidOnly} onChange={setUnpaidOnly} label={`Unpaid only${unpaidRows.length > 0 ? ` · ${unpaidRows.length}` : ''}`} />
                  )}
                </div>
                {leaderboard.loading ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading leaderboard...</div>
                ) : leaderboard.rows.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No participants yet</div>
                ) : visibleRows.length === 0 ? (
                  <div style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1rem', fontWeight: '700', color: '#22c55e', marginBottom: '0.25rem' }}>All rewards paid</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Every eligible participant in this event has been paid out.</div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                  <table className="graid-table" style={{ width: '100%', minWidth: '560px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-card)', background: 'var(--bg-primary)' }}>
                        {(selectedIsLegacy ? ['#', 'Player', 'Rank', 'Completions', 'Payout', 'Paid'] : ['#', 'Player', 'Rank', 'Points', 'Reward Points', 'Payout', 'Paid']).map(h => (
                          <th key={h} className={h === 'Rank' || h === 'Reward Points' ? 'graid-col-optional' : undefined} style={{ padding: '0.6rem 0.75rem', textAlign: h === 'Paid' ? 'center' : 'left', ...sectionLabelStyle }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, i) => (
                        <tr key={`${row.uuid ?? row.username}-${i}`} style={{ borderBottom: '1px solid var(--border-card)', opacity: row.meetsMin ? 1 : 0.5, background: i % 2 === 1 ? 'rgba(255, 255, 255, 0.025)' : 'transparent', transition: 'opacity 0.2s' }}>
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', fontWeight: '700', color: row.rankNum === 1 ? '#eab308' : row.rankNum === 2 ? '#9ca3af' : row.rankNum === 3 ? '#b45309' : 'var(--text-secondary)' }}>{row.rankNum}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '500' }}>{row.username}</td>
                          <td className="graid-col-optional" style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: getRankColor(row.rank), fontWeight: '600' }}>{row.rank || '-'}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{selectedIsLegacy ? row.rankingPoints : formatPoints(row.rankingPoints)}</td>
                          {!selectedIsLegacy && (
                            <td className="graid-col-optional" style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-primary)' }} title={row.bonusDetails.join(', ') || undefined}>{formatPoints(row.rewardPoints)}</td>
                          )}
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: row.meetsMin ? '#22c55e' : 'var(--text-secondary)' }}>
                            {row.meetsMin ? formatLePayout(row.payoutLe) : '-'}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                            {row.meetsMin && (
                              <input
                                type="checkbox"
                                checked={!!row.paid}
                                onChange={() => row.uuid && markPaid(row.uuid, !row.paid)}
                                style={{ width: '1rem', height: '1rem', cursor: 'pointer', accentColor: '#22c55e' }}
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ marginBottom: '1rem' }}>Select an event to view details and leaderboard</div>
              <div style={{ display: 'inline-flex', gap: '0.5rem' }}>{headerActions}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
