"use client";

import { useState } from 'react';

interface MemberNoteEditorProps {
  username: string;
  initialNote: string;
  onClose: () => void;
  onSave: (note: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const btnStyle: React.CSSProperties = {
  padding: '0.4rem 0.85rem',
  borderRadius: '0.375rem',
  border: 'none',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
};

export default function MemberNoteEditor({ username, initialNote, onClose, onSave, onDelete }: MemberNoteEditorProps) {
  const [text, setText] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!text.trim()) {
      setError('Write something first, or remove the note instead.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(text);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove note');
      setDeleting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card-solid)', borderRadius: '0.75rem',
          border: '1px solid var(--border-card)', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
          padding: '1.25rem', width: '420px', maxWidth: '100%',
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Note on {username}
        </h2>

        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What should exec remember about this member?"
          style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
            borderRadius: '0.5rem', padding: '0.65rem', color: 'var(--text-primary)',
            fontSize: '0.85rem', resize: 'vertical', minHeight: '110px', outline: 'none',
          }}
        />

        {error && (
          <div style={{ fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 0.65rem', borderRadius: '0.375rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
          {onDelete ? (
            <button
              onClick={handleDelete}
              disabled={saving || deleting}
              style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
            >
              {deleting ? 'Removing…' : 'Remove note'}
            </button>
          ) : <span />}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={onClose}
              disabled={saving || deleting}
              style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              style={{ ...btnStyle, background: 'var(--color-ocean-500)', color: '#fff' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
