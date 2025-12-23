"use client";

interface MapModeSelectorProps {
  mode: 'live' | 'history';
  onModeChange: (mode: 'live' | 'history') => void;
  historyAvailable: boolean;
}

export default function MapModeSelector({
  mode,
  onModeChange,
  historyAvailable,
}: MapModeSelectorProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.25rem',
        background: 'var(--bg-card-solid)',
        borderRadius: '0.5rem',
        padding: '0.25rem',
        border: '1px solid var(--border-color)',
      }}
    >
      <button
        type="button"
        onClick={() => onModeChange('live')}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: '0.375rem',
          border: 'none',
          cursor: 'pointer',
          fontWeight: mode === 'live' ? '600' : '400',
          fontSize: '0.875rem',
          background: mode === 'live' ? 'var(--accent-primary)' : 'transparent',
          color: mode === 'live' ? 'var(--text-on-accent)' : 'var(--text-secondary)',
          transition: 'all 0.15s ease',
        }}
      >
        Live
      </button>
      <button
        type="button"
        onClick={() => historyAvailable && onModeChange('history')}
        disabled={!historyAvailable}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: '0.375rem',
          border: 'none',
          cursor: historyAvailable ? 'pointer' : 'not-allowed',
          fontWeight: mode === 'history' ? '600' : '400',
          fontSize: '0.875rem',
          background: mode === 'history' ? 'var(--accent-primary)' : 'transparent',
          color: mode === 'history' ? 'var(--text-on-accent)' : 'var(--text-secondary)',
          opacity: historyAvailable ? 1 : 0.5,
          transition: 'all 0.15s ease',
        }}
      >
        History
      </button>
    </div>
  );
}
