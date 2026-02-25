"use client";

import { useState, useCallback } from "react";

interface HistoryDatePickerProps {
  current: Date;
  earliest: Date;
  latest: Date;
  onJump: (date: Date) => void;
  vertical?: boolean;
}

export default function HistoryDatePicker({
  current,
  earliest,
  latest,
  onJump,
  vertical,
}: HistoryDatePickerProps) {
  // Format date for date input (YYYY-MM-DD)
  const formatDateInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  // Format time for time input (HH:MM)
  const formatTimeInput = (date: Date) => {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const [dateValue, setDateValue] = useState(formatDateInput(current));
  const [timeValue, setTimeValue] = useState(formatTimeInput(current));

  const handleJump = useCallback(() => {
    const [hours, minutes] = timeValue.split(':').map(Number);
    const newDate = new Date(`${dateValue}T00:00:00`);
    if (!isNaN(newDate.getTime())) {
      newDate.setHours(hours || 0, minutes || 0, 0, 0);
      // Clamp to valid range
      const clampedTime = Math.max(
        earliest.getTime(),
        Math.min(latest.getTime(), newDate.getTime())
      );
      onJump(new Date(clampedTime));
    }
  }, [dateValue, timeValue, earliest, latest, onJump]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: vertical ? 'column' : 'row',
      alignItems: vertical ? 'stretch' : 'center',
      gap: '0.375rem',
      flexWrap: vertical ? 'nowrap' : 'wrap',
      justifyContent: 'center',
    }}>
      <style>{`
        .history-date-input::-webkit-calendar-picker-indicator {
          filter: var(--calendar-icon-filter, none);
          cursor: pointer;
        }
        [data-theme="dark"] .history-date-input::-webkit-calendar-picker-indicator {
          filter: invert(1);
        }
      `}</style>
      <input
        type="date"
        className="history-date-input"
        value={dateValue}
        onChange={(e) => setDateValue(e.target.value)}
        min={formatDateInput(earliest)}
        max={formatDateInput(latest)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          padding: '0.375rem 0.5rem',
          borderRadius: '0.375rem',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontSize: '0.8rem',
          outline: 'none',
          colorScheme: 'dark light',
          minWidth: 0,
          flexShrink: 1,
        }}
      />
      <input
        type="time"
        value={timeValue}
        onChange={(e) => setTimeValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          padding: '0.375rem 0.5rem',
          borderRadius: '0.375rem',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontSize: '0.8rem',
          outline: 'none',
          colorScheme: 'dark light',
          width: '5rem',
          minWidth: 0,
          flexShrink: 1,
        }}
      />
      <button
        type="button"
        onClick={handleJump}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          padding: '0.375rem 0.75rem',
          borderRadius: '0.375rem',
          border: 'none',
          background: 'var(--accent-primary)',
          color: 'var(--text-on-accent)',
          fontSize: '0.8rem',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'opacity 0.15s ease',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
      >
        Jump
      </button>
    </div>
  );
}
