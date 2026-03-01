"use client";

import { useState } from 'react';
import { useExecAgendaBau, useExecAgendaRequested } from '@/hooks/useExecAgenda';

export default function ExecAgendaPage() {
  const bau = useExecAgendaBau();
  const requested = useExecAgendaRequested();

  const [newBauTopic, setNewBauTopic] = useState('');
  const [newBauDesc, setNewBauDesc] = useState('');
  const [editingBauId, setEditingBauId] = useState<number | null>(null);
  const [editBauTopic, setEditBauTopic] = useState('');
  const [editBauDesc, setEditBauDesc] = useState('');

  const [newReqTopic, setNewReqTopic] = useState('');
  const [newReqDesc, setNewReqDesc] = useState('');

  const loading = bau.loading || requested.loading;
  const error = bau.error || requested.error;

  if (loading && bau.topics.length === 0 && requested.topics.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>
          Meeting Agenda
        </h1>
        <div style={{
          background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)',
          height: '400px', animation: 'pulse 1.5s ease-in-out infinite',
        }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && bau.topics.length === 0 && requested.topics.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>
          Meeting Agenda
        </h1>
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '0.5rem', padding: '1rem', color: '#ef4444',
        }}>
          Failed to load agenda: {error}
        </div>
      </div>
    );
  }

  const handleAddBau = async () => {
    if (!newBauTopic.trim()) return;
    await bau.addTopic(newBauTopic, newBauDesc);
    setNewBauTopic('');
    setNewBauDesc('');
  };

  const handleEditBau = async () => {
    if (!editBauTopic.trim() || editingBauId === null) return;
    await bau.editTopic(editingBauId, editBauTopic, editBauDesc);
    setEditingBauId(null);
    setEditBauTopic('');
    setEditBauDesc('');
  };

  const startEditBau = (id: number, topic: string, description: string | null) => {
    setEditingBauId(id);
    setEditBauTopic(topic);
    setEditBauDesc(description || '');
  };

  const handleAddRequested = async () => {
    if (!newReqTopic.trim()) return;
    await requested.submitTopic(newReqTopic, newReqDesc);
    setNewReqTopic('');
    setNewReqDesc('');
  };

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

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
            Meeting Agenda
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            Manage standing and requested topics for exec meetings
          </p>
        </div>
        <button
          onClick={() => { bau.refresh(); requested.refresh(); }}
          style={{ ...btnStyle, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}
        >
          Refresh
        </button>
      </div>

      {/* BAU Topics */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)',
        padding: '1.5rem', marginBottom: '1.5rem',
      }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 1rem' }}>
          Standing Topics
          <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
            ({bau.topics.length})
          </span>
        </h2>

        {bau.topics.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontStyle: 'italic' }}>No standing topics</p>
        )}

        {bau.topics.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.75rem', borderRadius: '0.5rem',
            background: 'var(--bg-primary)', marginBottom: '0.5rem',
          }}>
            {editingBauId === t.id ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  value={editBauTopic}
                  onChange={e => setEditBauTopic(e.target.value)}
                  style={inputStyle}
                  placeholder="Topic"
                  onKeyDown={e => e.key === 'Enter' && handleEditBau()}
                />
                <input
                  value={editBauDesc}
                  onChange={e => setEditBauDesc(e.target.value)}
                  style={inputStyle}
                  placeholder="Description (optional)"
                  onKeyDown={e => e.key === 'Enter' && handleEditBau()}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={handleEditBau} style={{ ...btnStyle, background: '#22c55e', color: '#fff' }}>Save</button>
                  <button onClick={() => setEditingBauId(null)} style={{ ...btnStyle, background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{t.topic}</div>
                  {t.description && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{t.description}</div>
                  )}
                </div>
                <button
                  onClick={() => startEditBau(t.id, t.topic, t.description)}
                  style={{ ...btnStyle, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '0.375rem 0.625rem' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => bau.removeTopic(t.id)}
                  style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.375rem 0.625rem' }}
                >
                  Remove
                </button>
              </>
            )}
          </div>
        ))}

        {/* Add BAU topic */}
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              value={newBauTopic}
              onChange={e => setNewBauTopic(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
              placeholder="New standing topic..."
              onKeyDown={e => e.key === 'Enter' && handleAddBau()}
            />
            <button onClick={handleAddBau} disabled={!newBauTopic.trim()} style={{
              ...btnStyle, background: '#22c55e', color: '#fff',
              opacity: newBauTopic.trim() ? 1 : 0.5,
            }}>
              Add
            </button>
          </div>
          <input
            value={newBauDesc}
            onChange={e => setNewBauDesc(e.target.value)}
            style={inputStyle}
            placeholder="Description (optional)"
            onKeyDown={e => e.key === 'Enter' && handleAddBau()}
          />
        </div>
      </div>

      {/* Requested Topics */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)',
        padding: '1.5rem',
      }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 1rem' }}>
          Requested Topics
          <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
            ({requested.topics.length})
          </span>
        </h2>

        {requested.topics.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontStyle: 'italic' }}>No requested topics</p>
        )}

        {requested.topics.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.75rem', borderRadius: '0.5rem',
            background: 'var(--bg-primary)', marginBottom: '0.5rem',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{t.topic}</div>
              {t.description && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{t.description}</div>
              )}
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                by {t.submittedByIgn} &middot; {new Date(t.createdAt).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={() => requested.removeTopic(t.id)}
              style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.375rem 0.625rem' }}
            >
              Remove
            </button>
          </div>
        ))}

        {/* Add requested topic */}
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              value={newReqTopic}
              onChange={e => setNewReqTopic(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Submit a topic..."
              onKeyDown={e => e.key === 'Enter' && handleAddRequested()}
            />
            <button onClick={handleAddRequested} disabled={!newReqTopic.trim()} style={{
              ...btnStyle, background: 'var(--color-ocean-400)', color: '#fff',
              opacity: newReqTopic.trim() ? 1 : 0.5,
            }}>
              Submit
            </button>
          </div>
          <input
            value={newReqDesc}
            onChange={e => setNewReqDesc(e.target.value)}
            style={inputStyle}
            placeholder="Description (optional)"
            onKeyDown={e => e.key === 'Enter' && handleAddRequested()}
          />
        </div>
      </div>
    </div>
  );
}
