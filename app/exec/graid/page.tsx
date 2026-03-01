"use client";

import { useState, useEffect } from 'react';
import { useExecGraid, useExecGraidLeaderboard } from '@/hooks/useExecGraid';
import { getRankColor } from '@/lib/rank-constants';
import { formatPayout } from '@/lib/currency';

export default function ExecGraidPage() {
  const { events, loading, error, refresh, createEvent, endEvent, updateEvent } = useExecGraid();

  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const leaderboard = useExecGraidLeaderboard(selectedEventId);

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [lowReward, setLowReward] = useState('1536');
  const [highReward, setHighReward] = useState('1536');
  const [minComp, setMinComp] = useState('12');
  const [bonusThreshold, setBonusThreshold] = useState('');
  const [bonusAmount, setBonusAmount] = useState('');

  // Auto-select the most recent event on first load
  useEffect(() => {
    if (events.length > 0 && selectedEventId === null) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const selectedEvent = events.find(e => e.id === selectedEventId) ?? null;

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

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
    borderRadius: '0.375rem', padding: '0.5rem 0.75rem',
    color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', width: '100%',
  };
  const btnStyle: React.CSSProperties = {
    padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none',
    cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', transition: 'opacity 0.15s',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block',
  };

  const resetForm = () => {
    setTitle(''); setLowReward('1536'); setHighReward('1536');
    setMinComp('12'); setBonusThreshold(''); setBonusAmount('');
    setFormError(null);
  };

  const startEdit = (ev: typeof selectedEvent) => {
    if (!ev) return;
    setEditingId(ev.id);
    setTitle(ev.title);
    setLowReward(String(ev.lowRankReward));
    setHighReward(String(ev.highRankReward));
    setMinComp(String(ev.minCompletions));
    setBonusThreshold(ev.bonusThreshold ? String(ev.bonusThreshold) : '');
    setBonusAmount(ev.bonusAmount ? String(ev.bonusAmount) : '');
  };

  const handleCreate = async () => {
    setFormError(null);
    if (!title.trim()) { setFormError('Title is required'); return; }
    try {
      const result = await createEvent({
        title: title.trim(),
        lowRankReward: parseInt(lowReward) || 1536,
        highRankReward: parseInt(highReward) || 1536,
        minCompletions: parseInt(minComp) || 12,
        bonusThreshold: bonusThreshold ? parseInt(bonusThreshold) : undefined,
        bonusAmount: bonusAmount ? parseInt(bonusAmount) : undefined,
      });
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
      await updateEvent(editingId, {
        title: title.trim(),
        lowRankReward: parseInt(lowReward) || 1536,
        highRankReward: parseInt(highReward) || 1536,
        minCompletions: parseInt(minComp) || 12,
        bonusThreshold: bonusThreshold ? parseInt(bonusThreshold) : null,
        bonusAmount: bonusAmount ? parseInt(bonusAmount) : null,
      });
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

  if (loading && events.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>Graid Events</h1>
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', height: '400px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>Graid Events</h1>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '1rem', color: '#ef4444' }}>
          Failed to load events: {error}
        </div>
      </div>
    );
  }

  const renderForm = (onSubmit: () => void, submitLabel: string, onCancel: () => void) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
      <div>
        <label style={labelStyle}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="e.g. Weekly Graid Event 2026/03/01" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Low Rank Reward (EM per raid)</label>
          <input value={lowReward} onChange={e => setLowReward(e.target.value)} style={inputStyle} type="number" />
        </div>
        <div>
          <label style={labelStyle}>High Rank Reward (EM per raid)</label>
          <input value={highReward} onChange={e => setHighReward(e.target.value)} style={inputStyle} type="number" />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Min Completions for Payout</label>
        <input value={minComp} onChange={e => setMinComp(e.target.value)} style={inputStyle} type="number" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Bonus Threshold (optional)</label>
          <input value={bonusThreshold} onChange={e => setBonusThreshold(e.target.value)} style={inputStyle} type="number" placeholder="Raids needed" />
        </div>
        <div>
          <label style={labelStyle}>Bonus Amount (optional, in LE)</label>
          <input value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} style={inputStyle} type="number" placeholder="LE bonus" />
        </div>
      </div>
      {formError && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{formError}</div>}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={onSubmit} style={{ ...btnStyle, background: '#22c55e', color: '#fff' }}>{submitLabel}</button>
        <button onClick={onCancel} style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>Graid Events</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            Create, manage, and track guild raid events
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!showCreate && (
            <button onClick={() => { resetForm(); setShowCreate(true); }} style={{ ...btnStyle, background: '#22c55e', color: '#fff' }}>
              Create Event
            </button>
          )}
          <button onClick={refresh} style={{ ...btnStyle, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Create New Event</h2>
          {renderForm(handleCreate, 'Create Event', () => { setShowCreate(false); resetForm(); })}
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* Left: Event list */}
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
                    padding: '0.75rem 1.25rem', cursor: 'pointer',
                    borderBottom: '1px solid var(--border-card)',
                    background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--color-ocean-400)' : '3px solid transparent',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{
                      fontSize: '0.65rem', fontWeight: '700', padding: '0.1rem 0.35rem',
                      borderRadius: '0.2rem', background: sc.bg, color: sc.text, textTransform: 'uppercase',
                    }}>
                      {status}
                    </span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.title}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    {new Date(ev.startTs).toLocaleDateString()} — {ev.endTs ? new Date(ev.endTs).toLocaleDateString() : 'Ongoing'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Selected event details + leaderboard */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedEvent ? (
            <>
              {/* Event details card */}
              <div style={{
                background: 'var(--bg-card)', borderRadius: '0.75rem',
                border: selectedEvent.active ? '2px solid #22c55e' : '1px solid var(--border-card)',
                padding: '1.25rem', marginBottom: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {selectedEvent.active && (
                      <span style={{ background: '#22c55e', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: '700' }}>ACTIVE</span>
                    )}
                    <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>{selectedEvent.title}</h2>
                  </div>
                  {selectedEvent.active && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div><strong>Started:</strong> {new Date(selectedEvent.startTs).toLocaleDateString()}</div>
                    {selectedEvent.endTs && <div><strong>Ended:</strong> {new Date(selectedEvent.endTs).toLocaleDateString()}</div>}
                    <div><strong>Low Reward:</strong> {formatPayout(selectedEvent.lowRankReward)}/raid</div>
                    <div><strong>High Reward:</strong> {formatPayout(selectedEvent.highRankReward)}/raid</div>
                    <div><strong>Min Completions:</strong> {selectedEvent.minCompletions}</div>
                    {selectedEvent.bonusThreshold && <div><strong>Bonus at:</strong> {selectedEvent.bonusThreshold} raids</div>}
                    {selectedEvent.bonusAmount && <div><strong>Bonus:</strong> {selectedEvent.bonusAmount} LE</div>}
                  </div>
                )}
              </div>

              {/* Leaderboard */}
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
                        {['#', 'Player', 'Rank', 'Raids', 'Payout', ''].map(h => (
                          <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.rows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-card)', opacity: row.meetsMin ? 1 : 0.5 }}>
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', fontWeight: '700', color: row.rankNum <= 3 ? '#f59e0b' : 'var(--text-secondary)' }}>{row.rankNum}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '500' }}>{row.username}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: getRankColor(row.rank), fontWeight: '600' }}>{row.rank || '—'}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{row.total}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: row.meetsMin ? '#22c55e' : 'var(--text-secondary)' }}>{row.meetsMin ? formatPayout(row.payout) : '—'}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.7rem' }}>
                            {row.isRankLeader && <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', fontWeight: '600' }}>Leader</span>}
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
