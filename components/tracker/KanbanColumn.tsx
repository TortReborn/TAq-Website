import { useState } from 'react';
import type { Ticket, TicketStatus } from '@/hooks/useExecTracker';
import { STATUS_LABELS, COLUMN_COLORS } from './constants';
import KanbanCard from './KanbanCard';

export default function KanbanColumn({
  status,
  tickets,
  selectedId,
  draggingId,
  onSelectTicket,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  status: TicketStatus;
  tickets: Ticket[];
  selectedId: number | null;
  draggingId: number | null;
  onSelectTicket: (id: number) => void;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
  onDrop: (status: TicketStatus, ticketId: number) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const color = COLUMN_COLORS[status] || '#6b7280';

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const ticketId = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (!isNaN(ticketId)) onDrop(status, ticketId);
      }}
      style={{
        flex: 1,
        minWidth: '200px',
        background: dragOver ? `${color}0A` : 'var(--bg-card)',
        borderRadius: '0.75rem',
        border: `1px solid ${dragOver ? color : 'var(--border-card)'}`,
        borderTop: `3px solid ${color}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '0.6rem 0.75rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-card)',
      }}>
        <span style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}>
          {STATUS_LABELS[status]}
        </span>
        <span style={{
          fontSize: '0.65rem',
          fontWeight: 600,
          background: `${color}20`,
          color,
          padding: '0.1rem 0.4rem',
          borderRadius: '999px',
          minWidth: '18px',
          textAlign: 'center',
        }}>
          {tickets.length}
        </span>
      </div>

      {/* Cards */}
      <div
        className="themed-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {tickets.map((ticket) => (
          <KanbanCard
            key={ticket.id}
            ticket={ticket}
            isSelected={ticket.id === selectedId}
            isDragging={ticket.id === draggingId}
            onSelect={onSelectTicket}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
        {tickets.length === 0 && (
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: '1.5rem 0.5rem',
          }}>
            No tickets
          </div>
        )}
      </div>
    </div>
  );
}
