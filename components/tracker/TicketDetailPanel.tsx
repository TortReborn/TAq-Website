import { useState, useEffect } from 'react';
import type { Ticket, TicketStatus, TicketSystem, ExecMember } from '@/hooks/useExecTracker';
import type { TicketComment } from '@/hooks/useExecTicket';
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

export default function TicketDetailPanel({
  ticket,
  comments,
  loading,
  execMembers,
  onClose,
  onUpdateTicket,
  onUpdateLocal,
  onAddComment,
  onDelete,
  onRefresh,
}: {
  ticket: Ticket | null;
  comments: TicketComment[];
  loading: boolean;
  execMembers: ExecMember[];
  onClose: () => void;
  onUpdateTicket: (fields: Record<string, any>) => Promise<void>;
  onUpdateLocal: (id: number, fields: Partial<Ticket>) => void;
  onAddComment: (body: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onRefresh: () => void;
}) {
  const [commentText, setCommentText] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [visible, setVisible] = useState(false);

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
                    style={{
                      ...inputStyle,
                      fontSize: '1.1rem',
                      fontWeight: '700',
                      padding: '0.25rem 0.5rem',
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
