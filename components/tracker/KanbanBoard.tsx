import { useState, useMemo } from 'react';
import type { Ticket, TicketStatus } from '@/hooks/useExecTracker';
import { COLUMN_ORDER, VISIBLE_COLUMN_COUNT } from './constants';
import KanbanColumn from './KanbanColumn';

export default function KanbanBoard({
  tickets,
  selectedId,
  onSelectTicket,
  onMoveTicket,
}: {
  tickets: Ticket[];
  selectedId: number | null;
  onSelectTicket: (id: number) => void;
  onMoveTicket: (ticketId: number, newStatus: TicketStatus, position: number) => void;
}) {
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const map: Record<string, Ticket[]> = {};
    for (const status of COLUMN_ORDER) {
      map[status] = [];
    }
    for (const ticket of tickets) {
      if (map[ticket.status]) {
        map[ticket.status].push(ticket);
      }
    }
    return map;
  }, [tickets]);

  const handleDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.setData('text/plain', String(id));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
  };

  const handleDrop = (status: TicketStatus, position: number, ticketId: number) => {
    setDraggingId(null);
    onMoveTicket(ticketId, status, position);
  };

  // Fit exactly VISIBLE_COLUMN_COUNT columns in the visible area; the
  // extra columns (declined, archived) scroll off to the right.
  // 0.75rem gap * (N - 1) between the visible N columns.
  const colBasis = `calc((100% - ${(VISIBLE_COLUMN_COUNT - 1) * 0.75}rem) / ${VISIBLE_COLUMN_COUNT})`;

  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      flex: 1,
      minHeight: 0,
      overflowX: 'auto',
      ['--kanban-col-basis' as any]: colBasis,
    }}>
      {COLUMN_ORDER.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          tickets={grouped[status]}
          selectedId={selectedId}
          draggingId={draggingId}
          onSelectTicket={onSelectTicket}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
        />
      ))}
    </div>
  );
}
