import { useState, useRef } from 'react';
import type { TicketType, TicketSystem, TicketPriority } from '@/hooks/useExecTracker';
import { inputStyle, selectStyle, btnStyle, btnPrimary, btnSecondary } from './constants';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ATTACHMENTS = 5;

export default function CreateTicketModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { type: TicketType; system: TicketSystem[]; title: string; description: string; priority?: TicketPriority }) => Promise<number>;
}) {
  const [newType, setNewType] = useState<TicketType>('bug');
  const [newSystems, setNewSystems] = useState<TicketSystem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<TicketPriority>('medium');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    setFileError('');
    const newFiles: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!ALLOWED_TYPES.includes(file.type)) {
        setFileError(`"${file.name}" is not a supported image type. Use PNG, JPEG, GIF, or WebP.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setFileError(`"${file.name}" exceeds the 5MB size limit.`);
        return;
      }
      newFiles.push(file);
    }
    const total = pendingFiles.length + newFiles.length;
    if (total > MAX_ATTACHMENTS) {
      setFileError(`Maximum ${MAX_ATTACHMENTS} images allowed. You have ${pendingFiles.length}, tried to add ${newFiles.length}.`);
      return;
    }
    setPendingFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
    setFileError('');
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newDesc.trim() || newSystems.length === 0) return;
    setCreating(true);
    try {
      const ticketId = await onCreate({
        type: newType,
        system: newSystems,
        title: newTitle,
        description: newDesc,
        priority: newPriority,
      });

      if (pendingFiles.length > 0) {
        setUploadStatus('Uploading images...');
        const formData = new FormData();
        for (const file of pendingFiles) {
          formData.append('files', file);
        }
        await fetch(`/api/exec/requests/${ticketId}/attachments`, {
          method: 'POST',
          body: formData,
        });
      }

      onClose();
    } finally {
      setCreating(false);
      setUploadStatus('');
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

        {/* Images */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
            Images <span style={{ fontWeight: '400', color: 'var(--text-muted)' }}>({pendingFiles.length}/{MAX_ATTACHMENTS}, optional)</span>
          </label>

          {pendingFiles.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {pendingFiles.map((file, i) => (
                <div key={i} style={{ position: 'relative', width: '72px', height: '72px' }}>
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--border-card)',
                    }}
                  />
                  <button
                    onClick={() => removeFile(i)}
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#ef4444',
                      border: 'none',
                      color: '#fff',
                      fontSize: '0.65rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                    }}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          {fileError && (
            <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '0.4rem' }}>
              {fileError}
            </div>
          )}

          {pendingFiles.length < MAX_ATTACHMENTS && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                onChange={(e) => handleFilesSelected(e.target.files)}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  ...btnStyle,
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  border: '1px dashed var(--border-card)',
                  background: 'transparent',
                  padding: '0.4rem 0.75rem',
                }}
              >
                + Add Images
              </button>
            </>
          )}
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
            {uploadStatus || (creating ? 'Submitting...' : 'Submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
