"use client";

import { useState } from 'react';
import { useExecBlacklist } from '@/hooks/useExecBlacklist';

export default function ExecBlacklistPage() {
  const { entries, loading, error, refresh, addToBlacklist, updateReason, removeFromBlacklist } = useExecBlacklist();

  const [newIgn, setNewIgn] = useState('');
  const [newReason, setNewReason] = useState('');
  const [editingIgn, setEditingIgn] = useState<string | null>(null);
  const [editReason, setEditReason] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newIgn.trim()) return;
    setActionError(null);
    try {
      await addToBlacklist(newIgn.trim(), newReason.trim() || undefined);
      setNewIgn('');
      setNewReason('');
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleEditSave = async () => {
    if (!editingIgn) return;
    setActionError(null);
    try {
      await updateReason(editingIgn, editReason);
      setEditingIgn(null);
      setEditReason('');
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleRemove = async (ign: string) => {
    await removeFromBlacklist(ign);
    setConfirmRemove(null);
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

  if (loading && entries.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>Blacklist</h1>
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', height: '400px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>Blacklist</h1>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '1rem', color: '#ef4444' }}>
          Failed to load blacklist: {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>Blacklist</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            {entries.length} blacklisted player{entries.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={refresh} style={{ ...btnStyle, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>
          Refresh
        </button>
      </div>

      {/* Add to blacklist */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)',
        padding: '1.25rem', marginBottom: '1.5rem',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 0.75rem' }}>
          Add Player
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>IGN</label>
            <input
              value={newIgn}
              onChange={e => setNewIgn(e.target.value)}
              style={inputStyle}
              placeholder="Enter player IGN..."
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>Reason (optional)</label>
            <input
              value={newReason}
              onChange={e => setNewReason(e.target.value)}
              style={inputStyle}
              placeholder="Reason..."
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!newIgn.trim()}
            style={{
              ...btnStyle, background: '#ef4444', color: '#fff',
              opacity: newIgn.trim() ? 1 : 0.5, whiteSpace: 'nowrap',
            }}
          >
            Add to Blacklist
          </button>
        </div>
        {actionError && (
          <div style={{ marginTop: '0.5rem', color: '#ef4444', fontSize: '0.85rem' }}>{actionError}</div>
        )}
      </div>

      {/* Blacklist table */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
              {['Player', 'Reason', 'Date', ''].map(h => (
                <th key={h} style={{
                  padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600',
                  color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  No blacklisted players
                </td>
              </tr>
            )}
            {entries.map(entry => (
              <tr key={entry.ign} style={{ borderBottom: '1px solid var(--border-card)' }}>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: '500' }}>
                  {entry.ign}
                </td>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {editingIgn === entry.ign ? (
                    <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                      <input
                        value={editReason}
                        onChange={e => setEditReason(e.target.value)}
                        style={{ ...inputStyle, width: 'auto', flex: 1 }}
                        placeholder="Reason..."
                        onKeyDown={e => e.key === 'Enter' && handleEditSave()}
                        autoFocus
                      />
                      <button onClick={handleEditSave} style={{ ...btnStyle, background: '#22c55e', color: '#fff', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                        Save
                      </button>
                      <button onClick={() => setEditingIgn(null)} style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => { setEditingIgn(entry.ign); setEditReason(entry.reason || ''); }}
                      style={{ cursor: 'pointer', borderBottom: '1px dashed var(--text-secondary)' }}
                      title="Click to edit reason"
                    >
                      {entry.reason || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>No reason — click to add</span>}
                    </span>
                  )}
                </td>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {new Date(entry.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                  {confirmRemove === entry.ign ? (
                    <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                      <button onClick={() => handleRemove(entry.ign)} style={{ ...btnStyle, background: '#ef4444', color: '#fff', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                        Confirm
                      </button>
                      <button onClick={() => setConfirmRemove(null)} style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(entry.ign)}
                      style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
