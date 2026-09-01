"use client";

import { useState, useCallback } from "react";
import PickerField from "./PickerField";

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
      <PickerField
        type="date"
        value={dateValue}
        onChange={setDateValue}
        min={formatDateInput(earliest)}
        max={formatDateInput(latest)}
        width="8.5rem"
      />
      <PickerField
        type="time"
        value={timeValue}
        onChange={setTimeValue}
        width="7rem"
      />
      <button
        type="button"
        onClick={handleJump}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          height: '32px',
          boxSizing: 'border-box',
          padding: '0 0.75rem',
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
