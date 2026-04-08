"use client";

import { useState, useMemo } from 'react';
import { useExecGraidLogs, useExecGraidLogMutations } from '@/hooks/useExecGraidLogs';
import { getRaidShort, getRaidColor, RAID_NAMES } from '@/lib/graid-log-constants';

interface Props {
  meta: { igns: string[]; raidTypes: string[] };
  onViewStats: (ign: string) => void;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.4rem 0.6rem',
  color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
};

export default function GraidLogBrowse({ meta, onViewStats }: Props) {
  const [raidType, setRaidType] = useState('');
  const [ignSearch, setIgnSearch] = useState('');
  const [ign, setIgn] = useState('');
  const [showIgnDropdown, setShowIgnDropdown] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('Newest');
  const [page, setPage] = useState(1);

  const filteredIgns = useMemo(() => {
    if (!ignSearch) return [];
    const lower = ignSearch.toLowerCase();
    return meta.igns.filter(i => i.toLowerCase().includes(lower)).slice(0, 15);
  }, [ignSearch, meta.igns]);

  const selectIgn = (name: string) => {
    setIgnSearch(name);
    setIgn(name);
    setShowIgnDropdown(false);
    setPage(1);
  };

  const { logs, total, perPage, loading, error, refresh } = useExecGraidLogs({
    page, perPage: 25,
    raidType: raidType || undefined,
    ign: ign || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sort,
  });

  const { deleteLog } = useExecGraidLogMutations();
  const totalPages = Math.ceil(total / perPage);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this graid log entry?')) return;
    try { await deleteLog(id); refresh(); } catch (e) { console.error(e); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <label style={labelStyle}>Raid Type</label>
          <select style={inputStyle} value={raidType} onChange={e => { setRaidType(e.target.value); setPage(1); }}>
            <option value="">All Types</option>
            {RAID_NAMES.map(name => <option key={name} value={name}>{getRaidShort(name)}</option>)}
            <option value="Unknown">Unknown</option>
          </select>
        </div>
        <div style={{ position: 'relative' }}>
          <label style={labelStyle}>Player</label>
          <input
            style={inputStyle}
            placeholder="Search IGN..."
            value={ignSearch}
            onChange={e => { setIgnSearch(e.target.value); setIgn(''); setShowIgnDropdown(true); setPage(1); }}
            onFocus={() => setShowIgnDropdown(true)}
            onBlur={() => setTimeout(() => setShowIgnDropdown(false), 200)}
          />
          {showIgnDropdown && filteredIgns.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.375rem',
              maxHeight: '200px', overflowY: 'auto', marginTop: '2px',
            }}>
              {filteredIgns.map(name => (
                <div
                  key={name}
                  style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-primary)' }}
                  onMouseDown={() => selectIgn(name)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>From</label>
          <input type="date" style={inputStyle} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label style={labelStyle}>To</label>
          <input type="date" style={inputStyle} value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label style={labelStyle}>Sort</label>
          <select style={inputStyle} value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
            <option value="Newest">Newest</option>
            <option value="Oldest">Oldest</option>
          </select>
        </div>
      </div>

      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
        {total} result{total !== 1 ? 's' : ''}{totalPages > 1 && ` — Page ${page} of ${totalPages}`}
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ height: '300px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        ) : error ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#ef4444', fontSize: '0.85rem' }}>Failed to load logs</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No graid logs found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                  <th style={thStyle}>#</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Raid Type</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Participants</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border-card)' }}>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>{log.id}</td>
                    <td style={tdStyle}>
                      <span style={{ color: getRaidColor(log.raidType), fontWeight: '700' }}>{getRaidShort(log.raidType)}</span>
                    </td>
                    <td style={tdStyle}>
                      {log.participants.map((p, i) => (
                        <span key={i}>
                          {i > 0 && ', '}
                          <span style={{ cursor: 'pointer', color: 'var(--color-ocean-400)', fontWeight: '500' }}
                            onClick={() => onViewStats(p.ign)}>{p.ign}</span>
                        </span>
                      ))}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      {new Date(log.completedAt).toLocaleDateString()} {new Date(log.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button onClick={() => handleDelete(log.id)}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.4rem' }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={pageBtnStyle}>Prev</button>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.4rem' }}>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={pageBtnStyle}>Next</button>
        </div>
      )}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.15rem' };
const thStyle: React.CSSProperties = { padding: '0.6rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.7rem' };
const tdStyle: React.CSSProperties = { padding: '0.5rem' };
const pageBtnStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.375rem',
  padding: '0.4rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer',
};
