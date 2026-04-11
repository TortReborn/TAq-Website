"use client";

import Link from 'next/link';
import { useState, useRef } from 'react';
import { useExecDashboard } from '@/hooks/useExecDashboard';
import { useExecDashboardNotes } from '@/hooks/useExecDashboardNotes';
import { useExecDashboardEvents } from '@/hooks/useExecDashboardEvents';
import { getRankColor, RANK_ORDER } from '@/lib/rank-constants';

function StatCard({ label, value, color, href }: { label: string; value: string | number; color: string; href?: string }) {
  const content = (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '0.5rem',
      padding: '0.75rem 1rem',
      border: '1px solid var(--border-card)',
      flex: '1 1 140px',
      minWidth: '120px',
      cursor: href ? 'pointer' : 'default',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
    }}
      onMouseEnter={(e) => {
        if (href) {
          e.currentTarget.style.borderColor = color;
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (href) {
          e.currentTarget.style.borderColor = 'var(--border-card)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      <div style={{
        fontSize: '1.4rem',
        fontWeight: '800',
        color: color,
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '0.7rem',
        color: 'var(--text-secondary)',
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        lineHeight: 1.2,
      }}>
        {label}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none', flex: '1 1 140px', minWidth: '120px' }}>{content}</Link>;
  }
  return content;
}

function OnlineStatCard({ count, members }: { count: number; members: { name: string; rank: string }[] }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sorted = [...members].sort((a, b) => {
    const aOrder = RANK_ORDER[a.rank] ?? 999;
    const bOrder = RANK_ORDER[b.rank] ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });

  return (
    <div
      style={{ position: 'relative', flex: '1 1 140px', minWidth: '120px' }}
      onMouseEnter={() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setShowTooltip(true);
      }}
      onMouseLeave={() => {
        timeoutRef.current = setTimeout(() => setShowTooltip(false), 150);
      }}
    >
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '0.5rem',
        padding: '0.75rem 1rem',
        border: '1px solid var(--border-card)',
        cursor: 'default',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#22c55e';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-card)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#22c55e', lineHeight: 1 }}>
          {count}
        </div>
        <div style={{
          fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '500',
          textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.2,
        }}>
          Online
        </div>
      </div>

      {showTooltip && sorted.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '6px',
          background: '#1e293b',
          border: '1px solid var(--border-card)',
          borderRadius: '0.5rem',
          padding: '0.5rem 0',
          minWidth: '180px',
          maxHeight: '280px',
          overflowY: 'auto',
          zIndex: 100,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        }}>
          {sorted.map((m) => (
            <div
              key={m.name}
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: '600',
                color: getRankColor(m.rank),
                whiteSpace: 'nowrap',
              }}
            >
              {m.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExecDashboardPage() {
  const { data, loading, error } = useExecDashboard();
  const notes = useExecDashboardNotes();
  const events = useExecDashboardEvents();

  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [editEventTitle, setEditEventTitle] = useState('');
  const [editEventDate, setEditEventDate] = useState('');
  const [editEventDesc, setEditEventDesc] = useState('');

  if (loading && !data) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: '800',
          color: 'var(--text-primary)',
          marginBottom: '2rem',
        }}>
          Dashboard
        </h1>
        <div style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              background: 'var(--bg-card)',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              border: '1px solid var(--border-card)',
              flex: '1 1 200px',
              minWidth: '180px',
              height: '100px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '0.5rem',
          padding: '1rem',
          color: '#ef4444',
        }}>
          Failed to load dashboard: {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 80px - 4rem)',
    }}>
      <h1 style={{
        fontSize: '1.75rem',
        fontWeight: '800',
        color: 'var(--text-primary)',
        marginBottom: '1rem',
      }}>
        Dashboard
      </h1>

      {/* Stats row */}
      <div data-tour="stats" style={{
        display: 'flex',
        gap: '0.75rem',
        flexWrap: 'wrap',
        marginBottom: '1rem',
      }}>
        <StatCard
          label="Pending Apps"
          value={data.pendingApplications}
          color="#f59e0b"
          href="/exec/applications"
        />
        <StatCard
          label="Members"
          value={data.guild.totalMembers}
          color="var(--color-ocean-400)"
          href="/exec/activity"
        />
        <OnlineStatCard
          count={data.guild.onlineMembers}
          members={data.guild.onlineMembersList || []}
        />
      </div>

      {/* Three-column layout: Notes | Events | Recent Apps */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '0.75rem',
        marginBottom: '1rem',
        flex: 1,
        minHeight: 0,
      }}>
        {/* Left: Shared Notes */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '0.75rem',
          border: '1px solid var(--border-card)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          <div style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-card)',
            flexShrink: 0,
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Notes</h2>
          </div>
          <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-card)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newNote.trim()) {
                    notes.addNote(newNote.trim());
                    setNewNote('');
                  }
                }}
                placeholder="Add a note..."
                style={{
                  flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
                  borderRadius: '0.375rem', padding: '0.4rem 0.65rem', color: 'var(--text-primary)',
                  fontSize: '0.8rem', outline: 'none',
                }}
              />
              <button
                onClick={() => { if (newNote.trim()) { notes.addNote(newNote.trim()); setNewNote(''); } }}
                style={{
                  background: '#22c55e', color: '#fff', border: 'none', borderRadius: '0.375rem',
                  padding: '0.4rem 0.75rem', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Add
              </button>
            </div>
          </div>
          <div className="themed-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
            {notes.notes.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
                No notes yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {notes.notes.map(note => (
                  <div
                    key={note.id}
                    style={{
                      padding: '0.45rem 0.6rem', borderRadius: '0.375rem',
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                      opacity: note.completed ? 0.5 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={note.completed}
                        onChange={() => notes.toggleNote(note.id, !note.completed)}
                        style={{ width: '0.85rem', height: '0.85rem', cursor: 'pointer', accentColor: '#22c55e', flexShrink: 0 }}
                      />
                      {editingNoteId === note.id ? (
                        <input
                          value={editingNoteContent}
                          onChange={e => setEditingNoteContent(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && editingNoteContent.trim()) {
                              notes.editNote(note.id, editingNoteContent.trim());
                              setEditingNoteId(null);
                            } else if (e.key === 'Escape') {
                              setEditingNoteId(null);
                            }
                          }}
                          onBlur={() => {
                            if (editingNoteContent.trim() && editingNoteContent.trim() !== note.content) {
                              notes.editNote(note.id, editingNoteContent.trim());
                            }
                            setEditingNoteId(null);
                          }}
                          autoFocus
                          style={{
                            flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
                            borderRadius: '0.25rem', padding: '0.15rem 0.4rem', color: 'var(--text-primary)',
                            fontSize: '0.8rem', outline: 'none',
                          }}
                        />
                      ) : (
                        <span
                          onDoubleClick={() => { setEditingNoteId(note.id); setEditingNoteContent(note.content); }}
                          style={{
                            flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)',
                            textDecoration: note.completed ? 'line-through' : 'none',
                            wordBreak: 'break-word', cursor: 'default',
                          }}
                          title="Double-click to edit"
                        >
                          {note.content}
                        </span>
                      )}
                      <button
                        onClick={() => { setEditingNoteId(note.id); setEditingNoteContent(note.content); }}
                        style={{
                          background: 'none', border: 'none', color: 'var(--text-secondary)',
                          cursor: 'pointer', fontSize: '0.7rem', padding: '0 0.2rem', flexShrink: 0,
                          opacity: 0.4, lineHeight: 1,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; }}
                        title="Edit note"
                      >
                        &#9998;
                      </button>
                      <button
                        onClick={() => notes.deleteNote(note.id)}
                        style={{
                          background: 'none', border: 'none', color: 'var(--text-secondary)',
                          cursor: 'pointer', fontSize: '0.85rem', padding: '0 0.25rem', flexShrink: 0,
                          opacity: 0.6, lineHeight: 1,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.opacity = '0.6'; }}
                        title="Delete note"
                      >
                        x
                      </button>
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.2rem', marginLeft: '1.35rem' }}>
                      {note.createdBy}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Middle: Planned Events */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '0.75rem',
          border: '1px solid var(--border-card)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-card)', flexShrink: 0,
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Planned Events</h2>
            <button
              onClick={() => setShowAddEvent(!showAddEvent)}
              style={{
                background: showAddEvent ? 'var(--bg-primary)' : 'rgba(59, 130, 246, 0.1)',
                color: showAddEvent ? 'var(--text-secondary)' : '#3b82f6',
                border: 'none', borderRadius: '0.375rem', padding: '0.3rem 0.6rem',
                fontSize: '0.7rem', fontWeight: '600', cursor: 'pointer',
              }}
            >
              {showAddEvent ? 'Cancel' : '+ Add'}
            </button>
          </div>
          {showAddEvent && (
            <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-card)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input
                value={eventTitle}
                onChange={e => setEventTitle(e.target.value)}
                placeholder="Event title"
                style={{
                  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
                  borderRadius: '0.375rem', padding: '0.4rem 0.65rem', color: 'var(--text-primary)',
                  fontSize: '0.8rem', outline: 'none', width: '100%',
                }}
              />
              <input
                type="datetime-local"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                style={{
                  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
                  borderRadius: '0.375rem', padding: '0.4rem 0.65rem', color: 'var(--text-primary)',
                  fontSize: '0.8rem', outline: 'none', width: '100%',
                }}
              />
              <input
                value={eventDesc}
                onChange={e => setEventDesc(e.target.value)}
                placeholder="Description (optional)"
                style={{
                  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
                  borderRadius: '0.375rem', padding: '0.4rem 0.65rem', color: 'var(--text-primary)',
                  fontSize: '0.8rem', outline: 'none', width: '100%',
                }}
              />
              <button
                onClick={async () => {
                  if (eventTitle.trim() && eventDate) {
                    await events.addEvent(eventTitle.trim(), new Date(eventDate).toISOString(), eventDesc.trim() || undefined);
                    setEventTitle(''); setEventDate(''); setEventDesc(''); setShowAddEvent(false);
                  }
                }}
                style={{
                  background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '0.375rem',
                  padding: '0.4rem 0.75rem', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                Save Event
              </button>
            </div>
          )}
          <div className="themed-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
            {events.events.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
                No events planned.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {events.events.map(ev => {
                  const evDate = new Date(ev.eventDate);
                  const isPast = evDate < new Date();
                  const isEditing = editingEventId === ev.id;
                  return (
                    <div
                      key={ev.id}
                      style={{
                        padding: '0.55rem 0.7rem', borderRadius: '0.375rem',
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                        opacity: isPast ? 0.5 : 1,
                      }}
                    >
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <input
                            value={editEventTitle}
                            onChange={e => setEditEventTitle(e.target.value)}
                            style={{
                              background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
                              borderRadius: '0.25rem', padding: '0.3rem 0.5rem', color: 'var(--text-primary)',
                              fontSize: '0.8rem', outline: 'none', width: '100%',
                            }}
                          />
                          <input
                            type="datetime-local"
                            value={editEventDate}
                            onChange={e => setEditEventDate(e.target.value)}
                            style={{
                              background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
                              borderRadius: '0.25rem', padding: '0.3rem 0.5rem', color: 'var(--text-primary)',
                              fontSize: '0.8rem', outline: 'none', width: '100%',
                            }}
                          />
                          <input
                            value={editEventDesc}
                            onChange={e => setEditEventDesc(e.target.value)}
                            placeholder="Description (optional)"
                            style={{
                              background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
                              borderRadius: '0.25rem', padding: '0.3rem 0.5rem', color: 'var(--text-primary)',
                              fontSize: '0.8rem', outline: 'none', width: '100%',
                            }}
                          />
                          <div style={{ display: 'flex', gap: '0.375rem' }}>
                            <button
                              onClick={async () => {
                                if (editEventTitle.trim() && editEventDate) {
                                  await events.editEvent(ev.id, {
                                    title: editEventTitle.trim(),
                                    eventDate: new Date(editEventDate).toISOString(),
                                    description: editEventDesc.trim() || '',
                                  });
                                  setEditingEventId(null);
                                }
                              }}
                              style={{
                                background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '0.25rem',
                                padding: '0.25rem 0.5rem', fontSize: '0.7rem', fontWeight: '600', cursor: 'pointer',
                              }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingEventId(null)}
                              style={{
                                background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: 'none',
                                borderRadius: '0.25rem', padding: '0.25rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                            <div style={{
                              background: isPast ? 'rgba(107,114,128,0.15)' : 'rgba(59,130,246,0.15)',
                              color: isPast ? '#6b7280' : '#3b82f6',
                              borderRadius: '0.375rem', padding: '0.2rem 0.45rem',
                              fontSize: '0.65rem', fontWeight: '700', flexShrink: 0,
                              textAlign: 'center', lineHeight: 1.3, minWidth: '3.5rem',
                            }}>
                              {evDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              <br />
                              <span style={{ fontSize: '0.6rem', fontWeight: '500' }}>
                                {evDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <br />
                              <span style={{ fontSize: '0.55rem', fontWeight: '500', opacity: 0.7 }}>
                                {ev.createdBy}
                              </span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                                {ev.title}
                              </div>
                              {ev.description && (
                                <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '0.15rem', wordBreak: 'break-word' }}>
                                  {ev.description}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => {
                                setEditingEventId(ev.id);
                                setEditEventTitle(ev.title);
                                const d = new Date(ev.eventDate);
                                const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
                                setEditEventDate(local.toISOString().slice(0, 16));
                                setEditEventDesc(ev.description || '');
                              }}
                              style={{
                                background: 'none', border: 'none', color: 'var(--text-secondary)',
                                cursor: 'pointer', fontSize: '0.7rem', padding: '0 0.2rem', flexShrink: 0,
                                opacity: 0.4, lineHeight: 1,
                              }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; }}
                              title="Edit event"
                            >
                              &#9998;
                            </button>
                            <button
                              onClick={() => events.deleteEvent(ev.id)}
                              style={{
                                background: 'none', border: 'none', color: 'var(--text-secondary)',
                                cursor: 'pointer', fontSize: '0.85rem', padding: '0 0.25rem', flexShrink: 0,
                                opacity: 0.6, lineHeight: 1,
                              }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.opacity = '1'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.opacity = '0.6'; }}
                              title="Delete event"
                            >
                              x
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Recent Applications */}
        <div data-tour="recent-apps" style={{
          background: 'var(--bg-card)',
          borderRadius: '0.75rem',
          border: '1px solid var(--border-card)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-card)',
            flexShrink: 0,
          }}>
            <h2 style={{
              fontSize: '1rem',
              fontWeight: '700',
              color: 'var(--text-primary)',
              margin: 0,
            }}>
              Recent Applications
            </h2>
            <Link href="/exec/applications" style={{
              fontSize: '0.75rem',
              color: 'var(--color-ocean-400)',
              textDecoration: 'none',
              fontWeight: '500',
            }}>
              View all
            </Link>
          </div>

          <div className="themed-scrollbar" style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.5rem',
          }}>
            {data.recentApplications.length === 0 ? (
              <div style={{
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
                textAlign: 'center',
                padding: '2rem 0',
              }}>
                No applications yet.
              </div>
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.375rem',
              }}>
                {data.recentApplications.slice(0, 5).map(app => {
                  const statusColors: Record<string, string> = {
                    pending: '#f59e0b',
                    accepted: '#22c55e',
                    denied: '#ef4444',
                  };
                  const voteSummary = app.votes
                    ? `${app.votes.accept}/${app.votes.deny}/${app.votes.abstain}`
                    : '0/0/0';

                  return (
                    <Link
                      key={app.id}
                      href={`/exec/applications?id=${app.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.6rem 0.75rem',
                        borderRadius: '0.5rem',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        textDecoration: 'none',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: statusColors[app.status] || '#6b7280',
                          flexShrink: 0,
                        }} />
                        <div>
                          <div style={{
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            color: 'var(--text-primary)',
                          }}>
                            {app.username}
                          </div>
                          <div style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                          }}>
                            {app.type === 'guild' ? 'Guild' : app.type === 'hammerhead' ? 'Hammerhead' : 'Community'} &middot; {new Date(app.submittedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-secondary)',
                        }} title="Accept / Deny / Abstain">
                          Votes: {voteSummary}
                        </div>
                        <div style={{
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.25rem',
                          background: `${statusColors[app.status] || '#6b7280'}20`,
                          color: statusColors[app.status] || '#6b7280',
                          textTransform: 'capitalize',
                        }}>
                          {app.status}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Links — pinned to bottom */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '0.75rem',
        flexShrink: 0,
      }}>
        {[
          {
            category: 'Members',
            color: 'var(--color-ocean-400)',
            links: [
              { href: '/exec/applications', label: 'Applications', desc: 'Review and vote on applications' },
              { href: '/exec/activity', label: 'Activity', desc: 'Track activity and update kick list' },
              { href: '/exec/promotions', label: 'Promotions', desc: 'Manage and suggest promotions' },
              { href: '/exec/blacklist', label: 'Blacklist', desc: 'View and add banned players' },
            ],
          },
          {
            category: 'Activities',
            color: '#ef4444',
            links: [
              { href: '/exec/snipes', label: 'Guild Wars', desc: 'Track territory snipe attempts' },
              { href: '/exec/guild-bank', label: 'Guild Bank', desc: 'Track war consumables and items' },
            ],
          },
          {
            category: 'Economy',
            color: '#f59e0b',
            links: [
              { href: '/exec/shells', label: 'Shells', desc: 'Manage member shell balances' },
              { href: '/exec/shell-exchange', label: 'Shell Exchange', desc: 'Update exchange rates' },
              { href: '/exec/backgrounds', label: 'Backgrounds', desc: 'Manage profile backgrounds' },
            ],
          },
          {
            category: 'Operations',
            color: '#22c55e',
            links: [
              { href: '/exec/agenda', label: 'Agenda', desc: 'View and manage meeting agenda' },
              { href: '/exec/requests', label: 'Requests', desc: 'Report bugs and request features' },
            ],
          },
        ].map((group) => (
          <div key={group.category} style={{
            background: 'var(--bg-card)',
            borderRadius: '0.75rem',
            border: '1px solid var(--border-card)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '0.625rem 1rem',
              fontSize: '0.75rem',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: group.color,
              background: 'rgba(255, 255, 255, 0.03)',
              borderBottom: '1px solid var(--border-card)',
            }}>
              {group.category}
            </div>
            <div style={{ padding: '0.5rem' }}>
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    display: 'block',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '0.375rem',
                    textDecoration: 'none',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    marginBottom: '0.15rem',
                  }}>
                    {link.label}
                  </div>
                  <div style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                  }}>
                    {link.desc}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
