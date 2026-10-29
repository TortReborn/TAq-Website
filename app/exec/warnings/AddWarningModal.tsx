"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { KIND_META, WARNING_KINDS, type WarningKind } from '@/lib/warnings';
import { addWarning, searchWarningPlayers } from '@/hooks/useExecWarnings';
import ScreenshotDrop from './ScreenshotDrop';
import { btnStyle, cardStyle, inputStyle, labelStyle } from './ui';

// Inputs need a fill to read against the modal's solid card
const fieldStyle: React.CSSProperties = { ...inputStyle, background: 'var(--bg-card-solid-hover)' };

export default function AddWarningModal({ initialIgn = '', onClose, onAdded }: {
  initialIgn?: string;
  onClose: () => void;
  onAdded: (uuid: string, failedUploads: string[]) => void;
}) {
  const [ign, setIgn] = useState(initialIgn);
  const [kind, setKind] = useState<WarningKind>('soft');
  const [rule, setRule] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = ign.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(() => { searchWarningPlayers(q).then(setSuggestions); }, 200);
    return () => clearTimeout(t);
  }, [ign]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const canSave = ign.trim() && rule.trim() && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const { uuid, failedUploads } = await addWarning({ ign: ign.trim(), kind, rule: rule.trim(), notes: notes.trim() }, files);
      onAdded(uuid, failedUploads);
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  // Portalled to <body>: the exec layout is its own stacking context, so a
  // fixed overlay inside it would sit under the site header.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-warning-title"
      onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.6)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 1rem', overflowY: 'auto',
      }}
    >
      <div style={{ ...cardStyle, background: 'var(--bg-card-solid)', width: '100%', maxWidth: '560px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 id="add-warning-title" style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
          Add warning
        </h2>

        <div>
          <label htmlFor="warning-ign" style={labelStyle}>Player</label>
          <input
            id="warning-ign"
            list="warning-ign-suggestions"
            value={ign}
            onChange={e => setIgn(e.target.value)}
            style={fieldStyle}
            placeholder="Minecraft name"
            autoComplete="off"
            autoFocus={!initialIgn}
          />
          <datalist id="warning-ign-suggestions">
            {suggestions.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>

        <div>
          <label htmlFor="warning-kind" style={labelStyle}>Type</label>
          <select id="warning-kind" value={kind} onChange={e => setKind(e.target.value as WarningKind)} style={fieldStyle}>
            {WARNING_KINDS.map(k => <option key={k} value={k}>{KIND_META[k].label}</option>)}
          </select>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{KIND_META[kind].hint}</p>
        </div>

        <div>
          <label htmlFor="warning-rule" style={labelStyle}>Rule broken</label>
          <input
            id="warning-rule"
            value={rule}
            onChange={e => setRule(e.target.value)}
            style={fieldStyle}
            placeholder="e.g. Slurs in guild chat; harassing a member"
            autoFocus={!!initialIgn}
          />
        </div>

        <div>
          <label htmlFor="warning-notes" style={labelStyle}>Notes (optional)</label>
          <textarea
            id="warning-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Context, what was said to them, how they took it"
          />
        </div>

        <div>
          <span style={labelStyle}>Proof</span>
          <ScreenshotDrop files={files} onChange={setFiles} />
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            style={{ ...btnStyle, background: '#ef4444', color: '#fff', opacity: canSave ? 1 : 0.5 }}
          >
            {saving ? (files.length ? 'Saving and uploading…' : 'Saving…') : 'Add warning'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
