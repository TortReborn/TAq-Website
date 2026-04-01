import { useState } from 'react';
import type { TicketType, TicketSystem, TicketPriority } from '@/hooks/useExecTracker';
import { inputStyle, selectStyle, btnStyle, btnPrimary, btnSecondary } from './constants';

export default function CreateTicketModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { type: TicketType; system: TicketSystem[]; title: string; description: string; priority?: TicketPriority }) => Promise<void>;
}) {
  const [newType, setNewType] = useState<TicketType>('bug');
  const [newSystems, setNewSystems] = useState<TicketSystem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<TicketPriority>('medium');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newDesc.trim() || newSystems.length === 0) return;
    setCreating(true);
    try {
      await onCreate({
        type: newType,
        system: newSystems,
        title: newTitle,
        description: newDesc,
        priority: newPriority,
      });
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div style={{
        background: 'var(--bg-card-solid)',
        borderRadius: '0.75rem',
        border: '1px solid var(--border-card)',
        padding: '1.5rem',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}>
        <h2 style={{
          fontSize: '1.15rem',
          fontWeight: '700',
          color: 'var(--text-primary)',
          margin: '0 0 1.25rem',
        }}>
          New Request
        </h2>

        {/* Type */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
            Type
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['bug', 'feature'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setNewType(t)}
                style={{
                  ...btnStyle,
                  flex: 1,
                  background: newType === t ? (t === 'bug' ? 'rgba(239,68,68,0.15)' : 'rgba(139,92,246,0.15)') : 'transparent',
                  border: `1px solid ${newType === t ? (t === 'bug' ? '#ef4444' : '#8b5cf6') : 'var(--border-card)'}`,
                  color: newType === t ? (t === 'bug' ? '#ef4444' : '#8b5cf6') : 'var(--text-secondary)',
                }}
              >
                {t === 'bug' ? 'Bug Report' : 'Feature Request'}
              </button>
            ))}
          </div>
        </div>

        {/* System */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
            System <span style={{ fontWeight: '400', color: 'var(--text-muted)' }}>(select one or more)</span>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {([['discord_bot', 'Discord Bot'], ['minecraft_mod', 'Minecraft Mod'], ['website', 'Website']] as const).map(([val, label]) => {
              const active = newSystems.includes(val);
              return (
                <button
                  key={val}
                  onClick={() => {
                    if (active && newSystems.length > 1) {
                      setNewSystems(newSystems.filter(x => x !== val));
                    } else if (!active) {
                      setNewSystems([...newSystems, val]);
                    }
                  }}
                  style={{
                    ...btnStyle,
                    flex: 1,
                    background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
                    border: `1px solid ${active ? 'var(--color-ocean-500)' : 'var(--border-card)'}`,
                    color: active ? 'var(--color-ocean-500)' : 'var(--text-secondary)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
            Title
          </label>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={newType === 'bug' ? 'Brief description of the bug...' : 'What feature would you like?'}
            style={inputStyle}
            maxLength={200}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
            Description
          </label>
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder={newType === 'bug' ? 'Steps to reproduce, expected vs actual behavior...' : 'Describe the feature in detail...'}
            style={{
              ...inputStyle,
              resize: 'vertical',
              minHeight: '100px',
            }}
          />
        </div>

        {/* Priority */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
            Priority
          </label>
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
            style={{ ...selectStyle, width: '100%' }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button
            onClick={onClose}
            style={btnSecondary}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!newTitle.trim() || !newDesc.trim() || newSystems.length === 0 || creating}
            style={{
              ...btnPrimary,
              opacity: !newTitle.trim() || !newDesc.trim() || newSystems.length === 0 || creating ? 0.5 : 1,
              cursor: !newTitle.trim() || !newDesc.trim() || newSystems.length === 0 || creating ? 'default' : 'pointer',
            }}
          >
            {creating ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
