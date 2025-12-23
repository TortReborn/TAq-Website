"use client";

import { useState, useCallback } from "react";

interface HistoryDatePickerProps {
  current: Date;
  earliest: Date;
  latest: Date;
  onJump: (date: Date) => void;
}

export default function HistoryDatePicker({
  current,
  earliest,
  latest,
  onJump,
}: HistoryDatePickerProps) {
  // Format date for date input (YYYY-MM-DD)
  const formatDateInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const [dateValue, setDateValue] = useState(formatDateInput(current));

  const handleJump = useCallback(() => {
    // Parse the date and set to noon to avoid timezone issues
    const newDate = new Date(`${dateValue}T12:00:00`);
    if (!isNaN(newDate.getTime())) {
      // Clamp to valid range
      const clampedTime = Math.max(
        earliest.getTime(),
        Math.min(latest.getTime(), newDate.getTime())
      );
      onJump(new Date(clampedTime));
    }
  }, [dateValue, earliest, latest, onJump]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
    }}>
      <input
        type="date"
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
          fontSize: '0.875rem',
          outline: 'none',
          colorScheme: 'dark light',
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
          color: '#fff',
          fontSize: '0.875rem',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'opacity 0.15s ease',
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
      >
        Jump
      </button>
    </div>
  );
}
