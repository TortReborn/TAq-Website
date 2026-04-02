import { PRIORITY_COLORS } from './constants';

export default function PriorityIcon({ priority, size = 14 }: { priority: string; size?: number }) {
  const color = PRIORITY_COLORS[priority] || '#6b7280';

  if (priority === 'critical') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <polyline points="4,10 8,6 12,10" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="4,14 8,10 12,14" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (priority === 'high') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <polyline points="4,11 8,5 12,11" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (priority === 'medium') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <line x1="3" y1="8" x2="13" y2="8" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  // low
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <polyline points="4,5 8,11 12,5" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
