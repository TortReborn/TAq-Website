"use client";

import { useRef } from "react";
import { Calendar, Clock } from "lucide-react";

interface PickerFieldProps {
  type: 'date' | 'time';
  value?: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  /** Width of the whole field (input + icon). */
  width?: string;
  maxWidth?: string;
}

/**
 * Date/time input with a lucide icon in place of the native
 * ::-webkit-calendar-picker-indicator. The native glyphs are two different
 * browser-drawn shapes with inconsistent size, weight and vertical centering;
 * hiding them and overlaying Calendar/Clock keeps every icon in the panel on
 * the same grid. Clicking the icon opens the native picker via showPicker().
 */
export default function PickerField({
  type,
  value,
  defaultValue,
  min,
  max,
  onChange,
  width,
  maxWidth,
}: PickerFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus(); // older browsers without showPicker()
    }
  };

  const Icon = type === 'date' ? Calendar : Clock;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ position: 'relative', width, maxWidth, minWidth: 0, flexShrink: 1 }}
    >
      {/* color-scheme keeps the browser's popup calendar/clock themed */}
      <style>{`
        .picker-field-input { color-scheme: light; }
        [data-theme="dark"] .picker-field-input { color-scheme: dark; }
        .picker-field-input::-webkit-calendar-picker-indicator {
          display: none;
          -webkit-appearance: none;
        }
      `}</style>
      <input
        ref={inputRef}
        type={type}
        className="picker-field-input"
        value={value}
        defaultValue={defaultValue}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: '32px',
          boxSizing: 'border-box',
          width: '100%',
          padding: '0 1.75rem 0 0.5rem',
          borderRadius: '0.375rem',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontSize: '0.8rem',
          outline: 'none',
        }}
      />
      <Icon
        size={14}
        strokeWidth={2}
        onClick={openPicker}
        style={{
          position: 'absolute',
          right: '0.5rem',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-primary)',
          opacity: 0.7,
          cursor: 'pointer',
        }}
      />
    </div>
  );
}
