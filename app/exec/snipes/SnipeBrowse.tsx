"use client";

import { useState, useCallback } from 'react';
import { useExecSnipeLogs, useExecSnipeMutations, type SnipeFilters, type SnipeLog, type SnipeParticipant } from '@/hooks/useExecSnipes';
import { SNIPE_ROLES, getDifficultyColor, isDry, ROLE_COLORS } from '@/lib/snipe-constants';

interface Props {
  meta: {
    territories: string[];
    routeCounts: Record<string, number>;
    currentSeason: number;
    igns: string[];
    snipedHqs: string[];
    seasonsWithData: number[];
  };
  onViewStats: (ign: string) => void;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.4rem 0.6rem',
  color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
};

const btnStyle: React.CSSProperties = {
  padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: 'none',
  cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', transition: 'opacity 0.15s',
};

const smallLabel: React.CSSProperties = {
  fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.15rem', display: 'block',
};

export default function SnipeBrowse({ meta, onViewStats }: Props) {
  const { updateSnipe, deleteSnipe, bulkAction } = useExecSnipeMutations();

  // Filters
  const [filters, setFilters] = useState<SnipeFilters>({ sort: 'date_desc' });
  const { logs, total, page, perPage, loading, error, refresh } = useExecSnipeLogs(filters);

  // UI state
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<SnipeLog> & { participants?: SnipeParticipant[] } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkOp, setBulkOp] = useState<'delete' | 'season' | null>(null);
  const [bulkSeason, setBulkSeason] = useState(String(meta.currentSeason));
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const updateFilter = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined, page: 1 }));
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === logs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(logs.map(l => l.id)));
    }
  };

  const startEdit = (log: SnipeLog) => {
    setExpandedId(log.id);
    setEditData({
      hq: log.hq,
      difficulty: log.difficulty,
      guildTag: log.guildTag,
      conns: log.conns,
      season: log.season,
      participants: [...log.participants],
    });
  };

  const cancelEdit = () => {
    setExpandedId(null);
    setEditData(null);
  };

  const handleSaveEdit = async () => {
    if (!expandedId || !editData) return;
    setSaving(true);
    setActionError(null);
    try {
      await updateSnipe(expandedId, {
        hq: editData.hq,
        difficulty: editData.difficulty,
        guildTag: editData.guildTag,
        conns: editData.conns,
        season: editData.season,
        participants: editData.participants,
      });
      cancelEdit();
      refresh();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setSaving(true);
    setActionError(null);
    try {
      await deleteSnipe(id);
      setConfirmDeleteId(null);
      refresh();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkAction = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    setActionError(null);
    try {
      if (bulkOp === 'delete') {
        await bulkAction('delete', Array.from(selected));
      } else if (bulkOp === 'season') {
        await bulkAction('update_season', Array.from(selected), parseInt(bulkSeason, 10));
      }
      setSelected(new Set());
      setBulkOp(null);
      refresh();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filters.season != null) params.set('season', String(filters.season));
    if (filters.hq) params.set('hq', filters.hq);
    if (filters.guildTag) params.set('guildTag', filters.guildTag);
    if (filters.ign) params.set('ign', filters.ign);
    if (filters.diffMin) params.set('diffMin', String(filters.diffMin));
    if (filters.diffMax) params.set('diffMax', String(filters.diffMax));
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.sort) params.set('sort', filters.sort);
    const qs = params.toString();
    window.open(`/api/exec/snipes/export${qs ? `?${qs}` : ''}`, '_blank');
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const toggleColumnSort = (col: string) => {
    const current = filters.sort || '';
    if (current === `${col}_desc`) {
      updateFilter('sort', `${col}_asc`);
    } else {
      updateFilter('sort', `${col}_desc`);
    }
  };

  const sortArrow = (col: string) => {
    const current = filters.sort || '';
    if (current === `${col}_desc`) return ' ▼';
    if (current === `${col}_asc`) return ' ▲';
    return '';
  };

  const thSortStyle: React.CSSProperties = {
    padding: '0.6rem 0.5rem', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.7rem',
    cursor: 'pointer', userSelect: 'none',
  };

  return (
    <div>
      {actionError && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '0.75rem', color: '#ef4444', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {actionError}
        </div>
      )}

      {/* Filters */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>Filters</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button style={{ ...btnStyle, background: 'var(--color-ocean-400)', color: '#fff' }} onClick={handleExport}>Export CSV</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
          <div>
            <label style={smallLabel}>Season</label>
            <select style={{ ...inputStyle, width: '100%' }} value={filters.season ?? ''} onChange={e => updateFilter('season', e.target.value === '' ? undefined : e.target.value)}>
              <option value="">Current</option>
              <option value="0">All Time</option>
              {[...meta.seasonsWithData].sort((a, b) => b - a).map(s => (
                <option key={s} value={s}>Season {s}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={smallLabel}>HQ</label>
            <input style={{ ...inputStyle, width: '100%' }} placeholder="Territory..." value={filters.hq || ''} onChange={e => updateFilter('hq', e.target.value)} />
          </div>
          <div>
            <label style={smallLabel}>Guild</label>
            <input style={{ ...inputStyle, width: '100%' }} placeholder="Tag..." value={filters.guildTag || ''} onChange={e => updateFilter('guildTag', e.target.value)} />
          </div>
          <div>
            <label style={smallLabel}>Player</label>
            <input style={{ ...inputStyle, width: '100%' }} placeholder="IGN..." value={filters.ign || ''} onChange={e => updateFilter('ign', e.target.value)} />
          </div>
          <div>
            <label style={smallLabel}>Diff Min</label>
            <input style={{ ...inputStyle, width: '100%' }} type="number" placeholder="Min" value={filters.diffMin || ''} onChange={e => updateFilter('diffMin', e.target.value)} />
          </div>
          <div>
            <label style={smallLabel}>Diff Max</label>
            <input style={{ ...inputStyle, width: '100%' }} type="number" placeholder="Max" value={filters.diffMax || ''} onChange={e => updateFilter('diffMax', e.target.value)} />
          </div>
          <div>
            <label style={smallLabel}>Date From</label>
            <input style={{ ...inputStyle, width: '100%' }} type="date" value={filters.dateFrom || ''} onChange={e => updateFilter('dateFrom', e.target.value)} />
          </div>
          <div>
            <label style={smallLabel}>Date To</label>
            <input style={{ ...inputStyle, width: '100%' }} type="date" value={filters.dateTo || ''} onChange={e => updateFilter('dateTo', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.5rem', border: '1px solid var(--color-ocean-400)', padding: '0.75rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: '600' }}>{selected.size} selected</span>
          {bulkOp === null && (
            <>
              <button style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }} onClick={() => setBulkOp('delete')}>Bulk Delete</button>
              <button style={{ ...btnStyle, background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }} onClick={() => setBulkOp('season')}>Change Season</button>
            </>
          )}
          {bulkOp === 'delete' && (
            <>
              <span style={{ fontSize: '0.8rem', color: '#ef4444' }}>Delete {selected.size} snipes?</span>
              <button style={{ ...btnStyle, background: '#ef4444', color: '#fff' }} onClick={handleBulkAction} disabled={saving}>{saving ? 'Deleting...' : 'Confirm Delete'}</button>
              <button style={{ ...btnStyle, background: 'var(--border-card)', color: 'var(--text-primary)' }} onClick={() => setBulkOp(null)}>Cancel</button>
            </>
          )}
          {bulkOp === 'season' && (
            <>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Move to season:</span>
              <input style={{ ...inputStyle, width: '60px' }} type="number" min="1" value={bulkSeason} onChange={e => setBulkSeason(e.target.value)} />
              <button style={{ ...btnStyle, background: '#3b82f6', color: '#fff' }} onClick={handleBulkAction} disabled={saving}>{saving ? 'Moving...' : 'Confirm'}</button>
              <button style={{ ...btnStyle, background: 'var(--border-card)', color: 'var(--text-primary)' }} onClick={() => setBulkOp(null)}>Cancel</button>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
        {loading && logs.length === 0 ? (
          <div style={{ height: '300px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        ) : logs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No snipes found.</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.7rem' }}>
                      <input type="checkbox" checked={selected.size === logs.length && logs.length > 0} onChange={toggleSelectAll} />
                    </th>
                    <th style={{ ...thSortStyle, textAlign: 'left' }} onClick={() => toggleColumnSort('date')}>Date{sortArrow('date')}</th>
                    <th style={{ ...thSortStyle, textAlign: 'left' }} onClick={() => toggleColumnSort('hq')}>HQ{sortArrow('hq')}</th>
                    <th style={{ ...thSortStyle, textAlign: 'left' }} onClick={() => toggleColumnSort('guild')}>Guild{sortArrow('guild')}</th>
                    <th style={{ ...thSortStyle, textAlign: 'right' }} onClick={() => toggleColumnSort('diff')}>Diff{sortArrow('diff')}</th>
                    <th style={{ ...thSortStyle, textAlign: 'center' }} onClick={() => toggleColumnSort('conns')}>Conns{sortArrow('conns')}</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.7rem' }}>Participants</th>
                    <th style={{ ...thSortStyle, textAlign: 'center' }} onClick={() => toggleColumnSort('season')}>S{sortArrow('season')}</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.7rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const dry = isDry(log.hq, log.conns);
                    return (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border-card)' }}>
                        <td style={{ padding: '0.5rem' }}>
                          <input type="checkbox" checked={selected.has(log.id)} onChange={() => toggleSelect(log.id)} />
                        </td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{formatDate(log.snipedAt)}</td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-primary)', fontWeight: '500' }}>{log.hq}</td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-primary)' }}>[{log.guildTag}]</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', color: getDifficultyColor(log.difficulty), fontWeight: '700' }}>{log.difficulty}k</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center', color: dry ? '#f59e0b' : 'var(--text-secondary)' }}>
                          {log.conns}{dry ? ' DRY' : ''}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          {log.participants.map((p, i) => (
                            <span key={i}>
                              {i > 0 && ', '}
                              <span
                                style={{ color: ROLE_COLORS[p.role as keyof typeof ROLE_COLORS] || 'var(--text-primary)', cursor: 'pointer' }}
                                onClick={() => onViewStats(p.ign)}
                              >
                                {p.ign}
                              </span>
                            </span>
                          ))}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{log.season}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button style={{ ...btnStyle, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', marginRight: '0.25rem', padding: '0.25rem 0.5rem' }} onClick={() => startEdit(log)}>Edit</button>
                          {confirmDeleteId === log.id ? (
                            <>
                              <button style={{ ...btnStyle, background: '#ef4444', color: '#fff', padding: '0.25rem 0.5rem', marginRight: '0.25rem' }} onClick={() => handleDelete(log.id)}>Yes</button>
                              <button style={{ ...btnStyle, background: 'var(--border-card)', color: 'var(--text-primary)', padding: '0.25rem 0.5rem' }} onClick={() => setConfirmDeleteId(null)}>No</button>
                            </>
                          ) : (
                            <button style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '0.25rem 0.5rem' }} onClick={() => setConfirmDeleteId(log.id)}>Del</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Inline Edit Panel */}
            {expandedId && editData && (
              <div style={{ borderTop: '2px solid var(--color-ocean-400)', padding: '1rem', background: 'var(--bg-primary)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '0.75rem' }}>Edit Snipe #{expandedId}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={smallLabel}>HQ</label>
                    <input style={{ ...inputStyle, width: '100%' }} value={editData.hq || ''} onChange={e => setEditData({ ...editData, hq: e.target.value })} />
                  </div>
                  <div>
                    <label style={smallLabel}>Difficulty</label>
                    <input style={{ ...inputStyle, width: '100%' }} type="number" value={editData.difficulty ?? ''} onChange={e => setEditData({ ...editData, difficulty: parseInt(e.target.value, 10) })} />
                  </div>
                  <div>
                    <label style={smallLabel}>Guild</label>
                    <input style={{ ...inputStyle, width: '100%' }} value={editData.guildTag || ''} onChange={e => setEditData({ ...editData, guildTag: e.target.value })} />
                  </div>
                  <div>
                    <label style={smallLabel}>Conns</label>
                    <select style={{ ...inputStyle, width: '100%' }} value={editData.conns ?? 0} onChange={e => setEditData({ ...editData, conns: parseInt(e.target.value, 10) })}>
                      {[0, 1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={smallLabel}>Season</label>
                    <input style={{ ...inputStyle, width: '100%' }} type="number" value={editData.season ?? ''} onChange={e => setEditData({ ...editData, season: parseInt(e.target.value, 10) })} />
                  </div>
                </div>
                {/* Edit participants */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <label style={smallLabel}>Participants</label>
                    <button
                      style={{ ...btnStyle, background: 'var(--color-ocean-400)', color: '#fff', padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                      onClick={() => setEditData({ ...editData, participants: [...(editData.participants || []), { ign: '', role: 'DPS' }] })}
                    >
                      + Add
                    </button>
                  </div>
                  {(editData.participants || []).map((p, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.3rem', alignItems: 'center' }}>
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        value={p.ign}
                        onChange={e => {
                          const parts = [...(editData.participants || [])];
                          parts[idx] = { ...parts[idx], ign: e.target.value };
                          setEditData({ ...editData, participants: parts });
                        }}
                        placeholder="IGN"
                      />
                      <select
                        style={{ ...inputStyle, width: '90px' }}
                        value={p.role}
                        onChange={e => {
                          const parts = [...(editData.participants || [])];
                          parts[idx] = { ...parts[idx], role: e.target.value as any };
                          setEditData({ ...editData, participants: parts });
                        }}
                      >
                        {SNIPE_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      {(editData.participants || []).length > 1 && (
                        <button
                          style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                          onClick={() => {
                            const parts = (editData.participants || []).filter((_, i) => i !== idx);
                            setEditData({ ...editData, participants: parts });
                          }}
                        >
                          X
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button style={{ ...btnStyle, background: '#22c55e', color: '#fff', opacity: saving ? 0.6 : 1 }} onClick={handleSaveEdit} disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button style={{ ...btnStyle, background: 'var(--border-card)', color: 'var(--text-primary)' }} onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            )}

            {/* Pagination */}
            <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-card)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {total} total — page {page} of {totalPages}
              </span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button
                  style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-primary)', opacity: page <= 1 ? 0.4 : 1 }}
                  disabled={page <= 1}
                  onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) - 1 }))}
                >
                  Prev
                </button>
                <button
                  style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-primary)', opacity: page >= totalPages ? 0.4 : 1 }}
                  disabled={page >= totalPages}
                  onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) + 1 }))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
