"use client";

import { useState, useMemo } from 'react';
import { useExecTracker, type TicketStatus } from '@/hooks/useExecTracker';
import { useExecTicket } from '@/hooks/useExecTicket';
import { btnPrimary } from '@/components/tracker/constants';
import KanbanBoard from '@/components/tracker/KanbanBoard';
import FilterBar from '@/components/tracker/FilterBar';
import TicketDetailPanel from '@/components/tracker/TicketDetailPanel';
import CreateTicketModal from '@/components/tracker/CreateTicketModal';

export default function ExecTrackerPage() {
  // Filters — no status filter (board columns handle that)
  const [typeFilter, setTypeFilter] = useState('');
  const [systemFilter, setSystemFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');

  // Fetch all tickets (no status filter)
  const filters = useMemo(() => ({
    ...(typeFilter && { type: typeFilter }),
    ...(systemFilter && { system: systemFilter }),
    ...(priorityFilter && { priority: priorityFilter }),
  }), [typeFilter, systemFilter, priorityFilter]);

  const { tickets, execMembers, loading, error, refresh, createTicket, updateTicketLocally } = useExecTracker(filters);

  // Client-side assignee filter
  const filteredTickets = useMemo(() => {
    if (!assigneeFilter) return tickets;
    return tickets.filter(t => t.assignedTo === assigneeFilter);
  }, [tickets, assigneeFilter]);

  // Detail panel
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detail = useExecTicket(selectedId);

  // Create modal
  const [showModal, setShowModal] = useState(false);

  const handleMoveTicket = async (ticketId: number, newStatus: TicketStatus) => {
    updateTicketLocally(ticketId, { status: newStatus });
    await fetch(`/api/exec/requests/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    refresh();
  };

  const handleDelete = async () => {
    await detail.deleteTicket();
    setSelectedId(null);
    refresh();
  };

  /* ─── Loading / Error ─── */

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
      <FilterBar
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        systemFilter={systemFilter}
        setSystemFilter={setSystemFilter}
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
        assigneeFilter={assigneeFilter}
        setAssigneeFilter={setAssigneeFilter}
        execMembers={execMembers}
        ticketCount={filteredTickets.length}
      />

      {/* Kanban Board */}
      <KanbanBoard
        tickets={filteredTickets}
        selectedId={selectedId}
        onSelectTicket={(id) => setSelectedId(id === selectedId ? null : id)}
        onMoveTicket={handleMoveTicket}
      />

      {/* Detail panel */}
      {selectedId && (
        <TicketDetailPanel
          ticket={detail.ticket}
          comments={detail.comments}
          loading={detail.loading}
          execMembers={execMembers}
          onClose={() => setSelectedId(null)}
          onUpdateTicket={detail.updateTicket}
          onUpdateLocal={updateTicketLocally}
          onAddComment={detail.addComment}
          onDelete={handleDelete}
          onRefresh={refresh}
        />
      )}

      {/* Create modal */}
      {showModal && (
        <CreateTicketModal
          onClose={() => setShowModal(false)}
          onCreate={createTicket}
        />
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
