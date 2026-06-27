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

function parseBonusString(input: string, leftKey: 'threshold' | 'placement') {
  if (!input.trim()) return [];
  return input.split(',').map(part => {
    const [leftRaw, rightRaw] = part.split('=').map(value => value?.trim());
    const left = Number(leftRaw);
    const points = Number(rightRaw);
    if (!Number.isInteger(left) || left <= 0 || !Number.isInteger(points) || points < 0) {
      throw new Error('Use entries like 50=64,100=128');
    }
    return { [leftKey]: left, points };
  });
}

function bonusString(items: any[] | undefined, leftKey: 'threshold' | 'placement') {
  return (items ?? []).map(item => `${item[leftKey]}=${item.points}`).join(',');
}

function isNonNegativePointDecimal(value: string) {
  return /^\d+(\.\d{1,2})?$/.test(value.trim());
}

export default function GraidEvents() {
  const { events, loading, error, refresh, createEvent, endEvent, updateEvent } = useExecGraid();
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const { markPaid, ...leaderboard } = useExecGraidLeaderboard(selectedEventId);

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [minPoints, setMinPoints] = useState('1');
  const [lePerPoint, setLePerPoint] = useState('1');
  const [endDate, setEndDate] = useState('');
  const [raidPoints, setRaidPoints] = useState<Record<string, string>>({ ...DEFAULT_RAID_POINTS });
  const [milestones, setMilestones] = useState('');
  const [placementBonuses, setPlacementBonuses] = useState('1=192,2=128,3=64');

  useEffect(() => {
    if (events.length > 0 && selectedEventId === null) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const selectedEvent = events.find(e => e.id === selectedEventId) ?? null;
  const selectedIsLegacy = selectedEvent?.rewardMode === 'legacy';

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
    setMilestones('');
    setPlacementBonuses('1=192,2=128,3=64');
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
    setEditingId(ev.id);
    setTitle(ev.title);
    setMinPoints(String(ev.minPoints));
    setLePerPoint(String(ev.lePerPoint));
    setEndDate(toLocalDateTime(ev.endTs));
    setRaidPoints(Object.fromEntries(RAID_NAMES.map(name => [name, String(ev.raidPoints?.[name] ?? 0)])));
    setMilestones(bonusString(ev.milestones, 'threshold'));
    setPlacementBonuses(bonusString(ev.placementBonuses, 'placement'));
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
      milestones: parseBonusString(milestones, 'threshold') as { threshold: number; points: number }[],
      placementBonuses: parseBonusString(placementBonuses, 'placement') as { placement: number; points: number }[],
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

  const renderForm = (onSubmit: () => void, submitLabel: string, onCancel: () => void) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
      <div>
        <label style={labelStyle}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="e.g. Weekly Graid Event" />
      </div>
      <div>
        <label style={labelStyle}>End Date</label>
        <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} required />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Minimum Points</label>
          <input value={minPoints} onChange={e => setMinPoints(e.target.value)} style={inputStyle} type="number" min={0} />
        </div>
        <div>
          <label style={labelStyle}>LE per Point</label>
          <input value={lePerPoint} onChange={e => setLePerPoint(e.target.value)} style={inputStyle} type="number" min={1} />
        </div>
      </div>
      <div style={{ padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: '0.5rem', border: '1px solid var(--border-card)' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Raid Point Values</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
          {RAID_NAMES.map(raidName => (
            <div key={raidName}>
              <label style={labelStyle}>{RAID_SHORT_NAMES[raidName]}</label>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Milestones</label>
          <input value={milestones} onChange={e => setMilestones(e.target.value)} style={inputStyle} placeholder="50=64,100=128" />
        </div>
        <div>
          <label style={labelStyle}>Placement Bonuses</label>
          <input value={placementBonuses} onChange={e => setPlacementBonuses(e.target.value)} style={inputStyle} placeholder="1=192,2=128,3=64" />
        </div>
      </div>
      {formError && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{formError}</div>}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={onSubmit} style={{ ...btnStyle, background: '#22c55e', color: '#fff' }}>{submitLabel}</button>
        <button onClick={onCancel} style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '1rem' }}>
        {!showCreate && (
          <button onClick={() => { resetForm(); setShowCreate(true); }} style={{ ...btnStyle, background: '#22c55e', color: '#fff' }}>
            Create Event
          </button>
        )}
        <button onClick={refresh} style={{ ...btnStyle, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>
          Refresh
        </button>
      </div>

      {showCreate && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Create New Event</h2>
          {renderForm(handleCreate, 'Create Event', () => { setShowCreate(false); resetForm(); })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 340px', background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-card)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              All Events
              <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>({events.length})</span>
            </h2>
          </div>
          <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                    {selectedEvent.active && (
                      <span style={{ background: '#22c55e', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: '700' }}>ACTIVE</span>
                    )}
                    <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>{selectedEvent.title}</h2>
                  </div>
                  {selectedEvent.active && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      {editingId !== selectedEvent.id && (
                        <button onClick={() => startEdit(selectedEvent)} style={{ ...btnStyle, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>Edit</button>
                      )}
                      {confirmEnd ? (
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          <button onClick={handleEnd} style={{ ...btnStyle, background: '#ef4444', color: '#fff' }}>Confirm End</button>
                          <button onClick={() => setConfirmEnd(false)} style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmEnd(true)} style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>End Event</button>
                      )}
                    </div>
                  )}
                </div>

                {editingId === selectedEvent.id ? (
                  renderForm(handleUpdate, 'Save Changes', () => { setEditingId(null); resetForm(); })
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div><strong>Started:</strong> {new Date(selectedEvent.startTs).toLocaleDateString()}</div>
                    {selectedEvent.endTs && <div><strong>{selectedEvent.active ? 'Ends:' : 'Ended:'}</strong> {new Date(selectedEvent.endTs).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>}
                    {selectedIsLegacy ? (
                      <>
                        <div><strong>Mode:</strong> Legacy rewards</div>
                        <div><strong>Low Reward:</strong> {formatPayout(selectedEvent.low)}/raid</div>
                        <div><strong>High Reward:</strong> {formatPayout(selectedEvent.high)}/raid</div>
                        <div><strong>Min Completions:</strong> {selectedEvent.minc}</div>
                        {selectedEvent.bonusThreshold != null && <div><strong>Bonus at:</strong> {selectedEvent.bonusThreshold} raids</div>}
                        {selectedEvent.bonusAmount != null && <div><strong>Bonus:</strong> {selectedEvent.bonusAmount} LE</div>}
                      </>
                    ) : (
                      <>
                        <div><strong>Mode:</strong> Point rewards</div>
                        <div><strong>Minimum Points:</strong> {selectedEvent.minPoints}</div>
                        <div><strong>LE per Point:</strong> {selectedEvent.lePerPoint}</div>
                        <div><strong>Milestones:</strong> {bonusString(selectedEvent.milestones, 'threshold') || 'None'}</div>
                        <div><strong>Placements:</strong> {bonusString(selectedEvent.placementBonuses, 'placement') || 'None'}</div>
                        <div style={{ gridColumn: '1 / -1' }}><strong>Raid Points:</strong> {RAID_NAMES.map(name => `${RAID_SHORT_NAMES[name]}=${formatPoints(selectedEvent.raidPoints?.[name] ?? 0)}`).join(', ')}</div>
                      </>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
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
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-card)' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                    Leaderboard
                    {leaderboard.rows.length > 0 && (
                      <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                        ({leaderboard.rows.length} participants)
                      </span>
                    )}
                  </h3>
                </div>
                {leaderboard.loading ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading leaderboard...</div>
                ) : leaderboard.rows.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No participants yet</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                        {(selectedIsLegacy ? ['#', 'Player', 'Rank', 'Completions', 'Payout', 'Paid'] : ['#', 'Player', 'Rank', 'Points', 'Reward Points', 'Payout', 'Paid']).map(h => (
                          <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: h === 'Paid' ? 'center' : 'left', fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.rows.map((row, i) => (
                        <tr key={row.uuid ?? `${row.username}-${i}`} style={{ borderBottom: '1px solid var(--border-card)', opacity: row.meetsMin ? 1 : 0.5, background: i % 2 === 1 ? 'rgba(255, 255, 255, 0.025)' : 'transparent' }}>
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', fontWeight: '700', color: row.rankNum === 1 ? '#eab308' : row.rankNum === 2 ? '#9ca3af' : row.rankNum === 3 ? '#b45309' : 'var(--text-secondary)' }}>{row.rankNum}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '500' }}>{row.username}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: getRankColor(row.rank), fontWeight: '600' }}>{row.rank || '-'}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{selectedIsLegacy ? row.rankingPoints : formatPoints(row.rankingPoints)}</td>
                          {!selectedIsLegacy && (
                            <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-primary)' }} title={row.bonusDetails.join(', ') || undefined}>{formatPoints(row.rewardPoints)}</td>
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
                )}
              </div>
            </>
          ) : (
            <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Select an event to view details and leaderboard
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
