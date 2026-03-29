"use client";

import { useState, useMemo, useCallback } from 'react';
import { useExecTracker, type TrackerFilters, type TicketType, type TicketSystem, type TicketStatus, type TicketPriority, type Ticket } from '@/hooks/useExecTracker';
import { useExecTicket, type TicketComment } from '@/hooks/useExecTicket';

/* ─── Constants ─── */

const SYSTEM_LABELS: Record<string, string> = {
  discord_bot: 'Discord Bot',
  minecraft_mod: 'Minecraft Mod',
  website: 'Website',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#3b82f6',
  in_progress: '#f59e0b',
  resolved: '#22c55e',
  closed: '#6b7280',
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#6b7280',
};

const TYPE_LABELS: Record<string, string> = {
  bug: 'Bug',
  feature: 'Feature',
};

/* ─── Shared styles ─── */

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

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  width: 'auto',
  minWidth: '120px',
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

const btnPrimary: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--color-ocean-500)',
  color: '#fff',
};

const btnDanger: React.CSSProperties = {
  ...btnStyle,
  background: '#ef4444',
  color: '#fff',
};

const btnSecondary: React.CSSProperties = {
  ...btnStyle,
  background: 'transparent',
  border: '1px solid var(--border-card)',
  color: 'var(--text-secondary)',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: '0.7rem',
      fontWeight: '600',
      padding: '0.15rem 0.45rem',
      borderRadius: '0.25rem',
      background: `${color}20`,
      color,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

/* ─── Main Page ─── */

export default function ExecTrackerPage() {
  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [systemFilter, setSystemFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('open,in_progress');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [sortKey, setSortKey] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filters: TrackerFilters = useMemo(() => ({
    ...(typeFilter && { type: typeFilter }),
    ...(systemFilter && { system: systemFilter }),
    ...(statusFilter && { status: statusFilter }),
    ...(priorityFilter && { priority: priorityFilter }),
    sort: sortKey,
    order: sortOrder,
  }), [typeFilter, systemFilter, statusFilter, priorityFilter, sortKey, sortOrder]);

  const { tickets, execMembers, loading, error, refresh, createTicket } = useExecTracker(filters);

  // Detail panel
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detail = useExecTicket(selectedId);

  // New ticket modal
  const [showModal, setShowModal] = useState(false);
  const [newType, setNewType] = useState<TicketType>('bug');
  const [newSystem, setNewSystem] = useState<TicketSystem>('discord_bot');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<TicketPriority>('medium');
  const [creating, setCreating] = useState(false);

  // Comment
  const [commentText, setCommentText] = useState('');
  const [commenting, setCommenting] = useState(false);

  // Edit title
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newDesc.trim()) return;
    setCreating(true);
    try {
      await createTicket({
        type: newType,
        system: newSystem,
        title: newTitle,
        description: newDesc,
        priority: newPriority,
      });
      setShowModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewPriority('medium');
    } finally {
      setCreating(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setCommenting(true);
    try {
      await detail.addComment(commentText);
      setCommentText('');
      refresh();
    } finally {
      setCommenting(false);
    }
  };

  const handleDelete = async () => {
    await detail.deleteTicket();
    setSelectedId(null);
    setShowDeleteConfirm(false);
    refresh();
  };

  const handleColumnSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  }, [sortKey]);

  /* ─── Loading / Error states ─── */

  if (loading && tickets.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>
          Requests
        </h1>
        <div style={{
          background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)',
          height: '400px', animation: 'pulse 1.5s ease-in-out infinite',
        }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && tickets.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>
          Requests
        </h1>
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '0.5rem', padding: '1rem', color: '#ef4444',
        }}>
          Failed to load tickets: {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px - 4rem)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
          Requests
        </h1>
        <button
          onClick={() => setShowModal(true)}
          style={btnPrimary}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          + New Request
        </button>
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        marginBottom: '0.75rem',
        alignItems: 'center',
      }}>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
          <option value="">All Types</option>
          <option value="bug">Bug</option>
          <option value="feature">Feature</option>
        </select>

        <select value={systemFilter} onChange={(e) => setSystemFilter(e.target.value)} style={selectStyle}>
          <option value="">All Systems</option>
          <option value="discord_bot">Discord Bot</option>
          <option value="minecraft_mod">Minecraft Mod</option>
          <option value="website">Website</option>
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="">All Statuses</option>
          <option value="open,in_progress">Active</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>

        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={selectStyle}>
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Main content: table + detail panel */}
      <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>

        {/* Ticket table */}
        <div style={{
          flex: selectedId ? '0 0 55%' : '1',
          background: 'var(--bg-card)',
          borderRadius: '0.75rem',
          border: '1px solid var(--border-card)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'flex 0.2s ease',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '50px 1fr 70px 110px 90px 70px 80px 70px',
            gap: '0.5rem',
            padding: '0.6rem 1rem',
            borderBottom: '1px solid var(--border-card)',
            background: 'rgba(255,255,255,0.03)',
            fontSize: '0.7rem',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text-secondary)',
          }}>
            <div
              style={{ cursor: 'pointer' }}
              onClick={() => handleColumnSort('created_at')}
            >
              # {sortKey === 'created_at' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
            </div>
            <div>Title</div>
            <div>Type</div>
            <div>System</div>
            <div
              style={{ cursor: 'pointer' }}
              onClick={() => handleColumnSort('status')}
            >
              Status {sortKey === 'status' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
            </div>
            <div
              style={{ cursor: 'pointer' }}
              onClick={() => handleColumnSort('priority')}
            >
              Priority {sortKey === 'priority' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
            </div>
            <div>By</div>
            <div>Date</div>
          </div>

          {/* Table body */}
          <div className="themed-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
            {tickets.length === 0 ? (
              <div style={{
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
                textAlign: 'center',
                padding: '3rem 0',
              }}>
                No tickets found. Try adjusting your filters or create a new request.
              </div>
            ) : (
              tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedId(ticket.id === selectedId ? null : ticket.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '50px 1fr 70px 110px 90px 70px 80px 70px',
                    gap: '0.5rem',
                    padding: '0.55rem 1rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: ticket.id === selectedId ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                    transition: 'background 0.1s',
                    alignItems: 'center',
                    fontSize: '0.825rem',
                  }}
                  onMouseEnter={(e) => {
                    if (ticket.id !== selectedId) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  }}
                  onMouseLeave={(e) => {
                    if (ticket.id !== selectedId) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>#{ticket.id}</div>
                  <div style={{
                    color: 'var(--text-primary)',
                    fontWeight: '500',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}>
                    {ticket.title}
                    {ticket.commentCount > 0 && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        💬 {ticket.commentCount}
                      </span>
                    )}
                  </div>
                  <div><Badge label={TYPE_LABELS[ticket.type]} color={ticket.type === 'bug' ? '#ef4444' : '#8b5cf6'} /></div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{SYSTEM_LABELS[ticket.system]}</div>
                  <div><Badge label={STATUS_LABELS[ticket.status]} color={STATUS_COLORS[ticket.status]} /></div>
                  <div><Badge label={PRIORITY_LABELS[ticket.priority]} color={PRIORITY_COLORS[ticket.priority]} /></div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {ticket.submittedByIgn || '—'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {formatDate(ticket.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedId && (
          <div style={{
            flex: '0 0 44%',
            background: 'var(--bg-card)',
            borderRadius: '0.75rem',
            border: '1px solid var(--border-card)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {detail.loading && !detail.ticket ? (
              <div style={{ padding: '2rem', animation: 'pulse 1.5s ease-in-out infinite' }}>
                <div style={{ height: '20px', background: 'var(--border-card)', borderRadius: '0.25rem', marginBottom: '1rem' }} />
                <div style={{ height: '14px', background: 'var(--border-card)', borderRadius: '0.25rem', width: '60%' }} />
              </div>
            ) : detail.ticket ? (
              <>
                {/* Detail header */}
                <div style={{
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid var(--border-card)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>#{detail.ticket.id}</span>
                      <Badge label={TYPE_LABELS[detail.ticket.type]} color={detail.ticket.type === 'bug' ? '#ef4444' : '#8b5cf6'} />
                      <select
                        value={detail.ticket.system}
                        onChange={async (e) => { await detail.updateTicket({ system: e.target.value }); refresh(); }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          outline: 'none',
                          padding: 0,
                        }}
                      >
                        <option value="discord_bot">Discord Bot</option>
                        <option value="minecraft_mod">Minecraft Mod</option>
                        <option value="website">Website</option>
                      </select>
                    </div>
                    {editingTitle ? (
                      <input
                        autoFocus
                        value={editTitleValue}
                        onChange={(e) => setEditTitleValue(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && editTitleValue.trim()) {
                            await detail.updateTicket({ title: editTitleValue.trim() });
                            refresh();
                            setEditingTitle(false);
                          } else if (e.key === 'Escape') {
                            setEditingTitle(false);
                          }
                        }}
                        onBlur={async () => {
                          if (editTitleValue.trim() && editTitleValue.trim() !== detail.ticket!.title) {
                            await detail.updateTicket({ title: editTitleValue.trim() });
                            refresh();
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
                          setEditTitleValue(detail.ticket!.title);
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
                        {detail.ticket.title}
                      </h2>
                    )}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                      by {detail.ticket.submittedByIgn || 'Unknown'} &middot; {timeAgo(detail.ticket.createdAt)}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedId(null)}
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

                {/* Detail body */}
                <div className="themed-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
                  {/* Controls */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '0.5rem',
                    marginBottom: '1rem',
                  }}>
                    <div>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.2rem' }}>
                        Status
                      </label>
                      <select
                        value={detail.ticket.status}
                        onChange={async (e) => { await detail.updateTicket({ status: e.target.value }); refresh(); }}
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
                        value={detail.ticket.priority}
                        onChange={async (e) => { await detail.updateTicket({ priority: e.target.value }); refresh(); }}
                        style={{ ...selectStyle, width: '100%', minWidth: 0, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                      >
                        {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.2rem' }}>
                        Assignee
                      </label>
                      <select
                        value={detail.ticket.assignedTo || ''}
                        onChange={async (e) => { await detail.updateTicket({ assigned_to: e.target.value || null }); refresh(); }}
                        style={{ ...selectStyle, width: '100%', minWidth: 0, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                      >
                        <option value="">Unassigned</option>
                        {execMembers.map((m) => (
                          <option key={m.discordId} value={m.discordId}>{m.ign}</option>
                        ))}
                      </select>
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
                      {detail.ticket.description}
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
                      Comments ({detail.comments.length})
                    </div>

                    {detail.comments.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        {detail.comments.map((comment) => (
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
        )}
      </div>

      {/* New Ticket Modal */}
      {showModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
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
                System
              </label>
              <select
                value={newSystem}
                onChange={(e) => setNewSystem(e.target.value as TicketSystem)}
                style={{ ...selectStyle, width: '100%' }}
              >
                <option value="discord_bot">Discord Bot</option>
                <option value="minecraft_mod">Minecraft Mod</option>
                <option value="website">Website</option>
              </select>
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
                onClick={() => setShowModal(false)}
                style={btnSecondary}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim() || !newDesc.trim() || creating}
                style={{
                  ...btnPrimary,
                  opacity: !newTitle.trim() || !newDesc.trim() || creating ? 0.5 : 1,
                  cursor: !newTitle.trim() || !newDesc.trim() || creating ? 'default' : 'pointer',
                }}
              >
                {creating ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
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
              <button onClick={() => setShowDeleteConfirm(false)} style={btnSecondary}>
                Cancel
              </button>
              <button onClick={handleDelete} style={btnDanger}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
