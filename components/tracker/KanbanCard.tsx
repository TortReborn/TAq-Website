import type { Ticket } from '@/hooks/useExecTracker';
import PriorityIcon from './PriorityIcon';
import SystemIcon from './SystemIcon';
import { TYPE_LABELS, TYPE_COLORS } from './constants';

export default function KanbanCard({
  ticket,
  isSelected,
  isDragging,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  ticket: Ticket;
  isSelected: boolean;
  isDragging: boolean;
  onSelect: (id: number) => void;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
}) {
  const dueDateStr = ticket.dueDate ? ticket.dueDate.split('T')[0] : null;
  const dueDate = dueDateStr ? new Date(dueDateStr + 'T00:00:00') : null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / 86400000) : null;

  let dueDateColor = 'var(--text-muted)';
  if (daysUntilDue !== null) {
    if (daysUntilDue < 0) dueDateColor = '#ef4444';
    else if (daysUntilDue <= 2) dueDateColor = '#f59e0b';
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, ticket.id)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(ticket.id)}
      style={{
        background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-primary)',
        border: `1px solid ${isSelected ? 'rgba(59, 130, 246, 0.3)' : 'var(--border-card)'}`,
        borderRadius: '0.5rem',
        padding: '0.65rem 0.75rem',
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transition: 'transform 0.1s, box-shadow 0.1s, opacity 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Title */}
      <div style={{
        fontSize: '0.85rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
        lineHeight: 1.35,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        marginBottom: '0.4rem',
      }}>
        {ticket.title}
      </div>

      {/* Metadata row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        fontSize: '0.7rem',
        marginBottom: '0.35rem',
        flexWrap: 'wrap',
      }}>
        <PriorityIcon priority={ticket.priority} size={14} />
        {ticket.system.map((s) => (
          <SystemIcon key={s} system={s} size={13} />
        ))}
        <span style={{
          fontSize: '0.65rem',
          fontWeight: 600,
          padding: '0.1rem 0.35rem',
          borderRadius: '0.2rem',
          background: `${TYPE_COLORS[ticket.type]}18`,
          color: TYPE_COLORS[ticket.type],
        }}>
          {TYPE_LABELS[ticket.type]}
        </span>
        {ticket.commentCount > 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M3 4.5C3 3.67 3.67 3 4.5 3h7c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5H7l-2.5 2V11H4.5C3.67 11 3 10.33 3 9.5v-5z" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            {ticket.commentCount}
          </span>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.7rem',
      }}>
        <span style={{
          color: ticket.assignedToIgn ? 'var(--color-ocean-400)' : 'var(--text-muted)',
          fontWeight: ticket.assignedToIgn ? 500 : 400,
        }}>
          {ticket.assignedToIgn || 'Unassigned'}
        </span>
        {dueDate && (
          <span style={{ color: dueDateColor, fontWeight: 500 }}>
            {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </div>
  );
}
