import { useState, useEffect, useRef } from 'react';
import type { Ticket, TicketStatus, TicketSystem, ExecMember } from '@/hooks/useExecTracker';
import type { TicketComment, TicketAttachment } from '@/hooks/useExecTicket';
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  inputStyle,
  selectStyle,
  btnPrimary,
  btnDanger,
  btnSecondary,
  timeAgo,
  ASSIGNEE_FILTER_IGNS,
} from './constants';

function MultiToggleGroup({ options, value, onChange, colors }: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  colors?: Record<string, string>;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
      {options.map((opt) => {
        const active = value.includes(opt.value);
        const accentColor = colors?.[opt.value];
        return (
          <button
            key={opt.value}
            onClick={() => {
              if (active) onChange(value.filter(v => v !== opt.value));
              else onChange([...value, opt.value]);
            }}
            style={{
              fontSize: '0.72rem',
              fontWeight: '600',
              padding: '0.25rem 0.6rem',
              borderRadius: '999px',
              border: active
                ? `1px solid ${accentColor || 'var(--color-ocean-500)'}`
                : '1px solid var(--border-card)',
              background: active
                ? `${accentColor || 'var(--color-ocean-500)'}22`
                : 'transparent',
              color: active
                ? (accentColor || 'var(--color-ocean-500)')
                : 'var(--text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.12s ease',
              outline: 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterGroup({ options, value, onChange, colors }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  colors?: Record<string, string>;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {options.map((opt) => {
        const active = value === opt.value;
        const accentColor = colors?.[opt.value];
        return (
          <button
            key={opt.value}
            onClick={() => onChange(active ? '' : opt.value)}
            style={{
              fontSize: '0.72rem',
              fontWeight: '600',
              padding: '0.25rem 0.6rem',
              borderRadius: '999px',
              border: active
                ? `1px solid ${accentColor || 'var(--color-ocean-500)'}`
                : '1px solid var(--border-card)',
              background: active
                ? `${accentColor || 'var(--color-ocean-500)'}22`
                : 'transparent',
              color: active
                ? (accentColor || 'var(--color-ocean-500)')
                : 'var(--text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.12s ease',
              outline: 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

export default function TicketDetailPanel({
  ticket,
  comments,
  attachments,
  loading,
  execMembers,
  onClose,
  onUpdateTicket,
  onUpdateLocal,
  onAddComment,
  onUploadAttachments,
  onDeleteAttachment,
  onDelete,
  onRefresh,
}: {
  ticket: Ticket | null;
  comments: TicketComment[];
  attachments: TicketAttachment[];
  loading: boolean;
  execMembers: ExecMember[];
  onClose: () => void;
  onUpdateTicket: (fields: Record<string, any>) => Promise<void>;
  onUpdateLocal: (id: number, fields: Partial<Ticket>) => void;
  onAddComment: (body: string) => Promise<void>;
  onUploadAttachments: (files: File[]) => Promise<void>;
  onDeleteAttachment: (id: number) => Promise<void>;
  onDelete: () => Promise<void>;
  onRefresh: () => void;
}) {
  const [commentText, setCommentText] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [visible, setVisible] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState('');
  const attachInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ticket) {
      requestAnimationFrame(() => setVisible(true));
    }
    return () => setVisible(false);
  }, [ticket?.id]);

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setCommenting(true);
    try {
      await onAddComment(commentText);
      setCommentText('');
      onRefresh();
    } finally {
      setCommenting(false);
    }
  };

  const handleDelete = async () => {
    await onDelete();
    setShowDeleteConfirm(false);
  };

  if (!ticket && !loading) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: visible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)',
          zIndex: 99,
          transition: 'background 0.25s ease',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        height: '100vh',
        width: '480px',
        maxWidth: '90vw',
        background: 'var(--bg-card-solid)',
        borderLeft: '1px solid var(--border-card)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s ease',
      }}>
        {loading && !ticket ? (
          <div style={{ padding: '2rem', animation: 'pulse 1.5s ease-in-out infinite' }}>
            <div style={{ height: '20px', background: 'var(--border-card)', borderRadius: '0.25rem', marginBottom: '1rem' }} />
            <div style={{ height: '14px', background: 'var(--border-card)', borderRadius: '0.25rem', width: '60%' }} />
          </div>
        ) : ticket ? (
          <>
            {/* Header */}
            <div style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid var(--border-card)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '0.75rem',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TAQ-{ticket.id}</span>
                  <FilterGroup
                    options={[
                      { value: 'bug', label: 'Bug' },
                      { value: 'feature', label: 'Feature' },
                    ]}
                    value={ticket.type}
                    onChange={async (v) => {
                      if (!v || v === ticket.type) return;
                      onUpdateLocal(ticket.id, { type: v as any });
                      await onUpdateTicket({ type: v });
                      onRefresh();
                    }}
                    colors={{ bug: '#ef4444', feature: '#8b5cf6' }}
                  />
                  <div style={{ width: '1px', height: '1rem', background: 'var(--border-card)' }} />
                  <MultiToggleGroup
                    options={[
                      { value: 'discord_bot', label: 'Bot' },
                      { value: 'minecraft_mod', label: 'Mod' },
                      { value: 'website', label: 'Web' },
                    ]}
                    value={ticket.system}
                    onChange={async (v) => {
                      if (v.length === 0) return;
                      onUpdateLocal(ticket.id, { system: v as TicketSystem[] });
                      await onUpdateTicket({ system: v });
                      onRefresh();
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                  {editingTitle ? (
                    <input
                      autoFocus
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && editTitleValue.trim()) {
                          onUpdateLocal(ticket.id, { title: editTitleValue.trim() });
                          await onUpdateTicket({ title: editTitleValue.trim() });
                          onRefresh();
                          setEditingTitle(false);
                        } else if (e.key === 'Escape') {
                          setEditingTitle(false);
                        }
                      }}
                      onBlur={async () => {
                        if (editTitleValue.trim() && editTitleValue.trim() !== ticket.title) {
                          onUpdateLocal(ticket.id, { title: editTitleValue.trim() });
                          await onUpdateTicket({ title: editTitleValue.trim() });
                          onRefresh();
                        }
                        setEditingTitle(false);
                      }}
                      maxLength={200}
                      size={Math.max(editTitleValue.length, 10)}
                      style={{
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--color-ocean-500)',
                        borderRadius: '0.25rem',
                        padding: '0.15rem 0.35rem',
                        color: 'var(--text-primary)',
                        fontSize: '1.1rem',
                        fontWeight: '700',
                        outline: 'none',
                        width: 'auto',
                        minWidth: '100px',
                        maxWidth: '100%',
                      }}
                    />
                  ) : (
                    <h2
                      onClick={() => {
                        setEditTitleValue(ticket.title);
                        setEditingTitle(true);
                      }}
                      style={{
                        fontSize: '1.1rem',
                        fontWeight: '700',
                        color: 'var(--text-primary)',
                        margin: 0,
                        lineHeight: 1.3,
                        cursor: 'pointer',
                        borderRadius: '0.25rem',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      title="Click to edit title"
                    >
                      {ticket.title}
                    </h2>
                  )}
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/exec/requests/${ticket.id}`;
                      navigator.clipboard.writeText(url);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    }}
                    title="Copy link to ticket"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.2rem',
                      color: linkCopied ? 'var(--color-ocean-500)' : 'var(--text-muted)',
                      flexShrink: 0,
                      marginTop: '0.1rem',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => { if (!linkCopied) e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={(e) => { if (!linkCopied) e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    {linkCopied ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <polyline points="3,8.5 6.5,12 13,4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M6.5 9.5l-1-1a2.12 2.12 0 0 1 0-3l2-2a2.12 2.12 0 0 1 3 0l.5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <path d="M9.5 6.5l1 1a2.12 2.12 0 0 1 0 3l-2 2a2.12 2.12 0 0 1-3 0l-.5-.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  by {ticket.submittedByIgn || 'Unknown'} &middot; {timeAgo(ticket.createdAt)}
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  padding: '0.25rem',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="themed-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
              {/* Controls */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem',
                marginBottom: '0.75rem',
              }}>
                <div>
                  <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.2rem' }}>
                    Status
                  </label>
                  <select
                    value={ticket.status}
                    onChange={async (e) => {
                      const v = e.target.value;
                      onUpdateLocal(ticket.id, { status: v as TicketStatus });
                      await onUpdateTicket({ status: v });
                      onRefresh();
                    }}
                    style={{ ...selectStyle, width: '100%', minWidth: 0, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                  >
                    {Object.entries(STATUS_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.2rem' }}>
                    Priority
                  </label>
                  <select
                    value={ticket.priority}
                    onChange={async (e) => {
                      const v = e.target.value;
                      onUpdateLocal(ticket.id, { priority: v as any });
                      await onUpdateTicket({ priority: v });
                      onRefresh();
                    }}
                    style={{ ...selectStyle, width: '100%', minWidth: 0, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                  >
                    {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem',
                marginBottom: '1rem',
              }}>
                <div>
                  <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.2rem' }}>
                    Assignee
                  </label>
                  <select
                    value={ticket.assignedTo || ''}
                    onChange={async (e) => {
                      const v = e.target.value || null;
                      onUpdateLocal(ticket.id, { assignedTo: v });
                      await onUpdateTicket({ assigned_to: v });
                      onRefresh();
                    }}
                    style={{ ...selectStyle, width: '100%', minWidth: 0, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                  >
                    <option value="">Unassigned</option>
                    {execMembers.filter(m => ASSIGNEE_FILTER_IGNS.includes(m.ign)).map((m) => (
                      <option key={m.discordId} value={m.discordId}>{m.ign}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.2rem' }}>
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={ticket.dueDate ? (ticket.dueDate.split('T')[0]) : ''}
                    onChange={async (e) => {
                      const v = e.target.value || null;
                      onUpdateLocal(ticket.id, { dueDate: v });
                      await onUpdateTicket({ due_date: v });
                      onRefresh();
                    }}
                    style={{ ...selectStyle, width: '100%', minWidth: 0, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                  />
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '0.4rem',
                }}>
                  Description
                </div>
                <div style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: '0.375rem',
                  padding: '0.75rem',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  {ticket.description}
                </div>
              </div>

              {/* Attachments */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '0.4rem',
                }}>
                  Attachments ({attachments.length}/{MAX_ATTACHMENTS})
                </div>

                {attachments.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    {attachments.map((att) => (
                      <div key={att.id} style={{ position: 'relative', width: '80px', height: '80px' }}>
                        <img
                          src={`/api/exec/requests/${ticket.id}/attachments/${att.id}`}
                          alt={att.filename}
                          onClick={() => setLightboxUrl(`/api/exec/requests/${ticket.id}/attachments/${att.id}`)}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: '0.375rem',
                            border: '1px solid var(--border-card)',
                            cursor: 'pointer',
                            transition: 'border-color 0.15s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-ocean-500)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-card)'; }}
                        />
                        <button
                          onClick={async () => {
                            await onDeleteAttachment(att.id);
                            onRefresh();
                          }}
                          title="Remove attachment"
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

                {attachError && (
                  <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '0.4rem' }}>
                    {attachError}
                  </div>
                )}

                {attachments.length < MAX_ATTACHMENTS && (
                  <>
                    <input
                      ref={attachInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      multiple
                      onChange={async (e) => {
                        const fileList = e.target.files;
                        if (!fileList || fileList.length === 0) return;
                        setAttachError('');

                        const files: File[] = [];
                        for (let i = 0; i < fileList.length; i++) {
                          const file = fileList[i];
                          if (!ALLOWED_TYPES.includes(file.type)) {
                            setAttachError(`"${file.name}" is not a supported image type.`);
                            return;
                          }
                          if (file.size > MAX_FILE_SIZE) {
                            setAttachError(`"${file.name}" exceeds the 5MB size limit.`);
                            return;
                          }
                          files.push(file);
                        }

                        if (attachments.length + files.length > MAX_ATTACHMENTS) {
                          setAttachError(`Cannot exceed ${MAX_ATTACHMENTS} attachments.`);
                          return;
                        }

                        setUploading(true);
                        try {
                          await onUploadAttachments(files);
                          onRefresh();
                        } finally {
                          setUploading(false);
                          if (attachInputRef.current) attachInputRef.current.value = '';
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                    <button
                      onClick={() => attachInputRef.current?.click()}
                      disabled={uploading}
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        padding: '0.3rem 0.65rem',
                        borderRadius: '0.375rem',
                        border: '1px dashed var(--border-card)',
                        background: 'transparent',
                        color: uploading ? 'var(--text-muted)' : 'var(--text-secondary)',
                        cursor: uploading ? 'default' : 'pointer',
                        transition: 'all 0.12s ease',
                        outline: 'none',
                      }}
                    >
                      {uploading ? 'Uploading...' : '+ Add Images'}
                    </button>
                  </>
                )}
              </div>

              {/* Comments */}
              <div>
                <div style={{
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '0.5rem',
                }}>
                  Comments ({comments.length})
                </div>

                {comments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {comments.map((comment) => (
                      <div key={comment.id} style={{
                        padding: '0.6rem 0.75rem',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: '0.375rem',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '0.3rem',
                        }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-ocean-400)' }}>
                            {comment.authorIgn || 'Unknown'}
                          </span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            {timeAgo(comment.createdAt)}
                          </span>
                        </div>
                        <div style={{
                          fontSize: '0.825rem',
                          color: 'var(--text-primary)',
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                        }}>
                          {comment.body}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add comment */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddComment();
                      }
                    }}
                    style={{
                      ...inputStyle,
                      resize: 'vertical',
                      minHeight: '60px',
                      maxHeight: '120px',
                      flex: 1,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    style={btnDanger}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={handleAddComment}
                    disabled={!commentText.trim() || commenting}
                    style={{
                      ...btnPrimary,
                      opacity: !commentText.trim() || commenting ? 0.5 : 1,
                      cursor: !commentText.trim() || commenting ? 'default' : 'pointer',
                    }}
                  >
                    {commenting ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1002,
            cursor: 'pointer',
          }}
        >
          <img
            src={lightboxUrl}
            alt="Attachment preview"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: '0.5rem',
              cursor: 'default',
            }}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: '#fff',
              fontSize: '1.5rem',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
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
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
          }}
        >
          <div style={{
            background: 'var(--bg-card-solid)',
            borderRadius: '0.75rem',
            border: '1px solid var(--border-card)',
            padding: '1.5rem',
            maxWidth: '400px',
            width: '100%',
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 0.75rem' }}>
              Delete Ticket
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem' }}>
              Are you sure you want to delete this ticket and all its comments? This cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={btnSecondary}>Cancel</button>
              <button onClick={handleDelete} style={btnDanger}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
