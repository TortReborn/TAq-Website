"use client";

interface HistoryPlaybackProps {
  isPlaying: boolean;
  speed: number;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  canStepForward: boolean;
  canStepBackward: boolean;
  hideSpeed?: boolean;
}

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10, 100];

export default function HistoryPlayback({
  isPlaying,
  speed,
  onPlayPause,
  onSpeedChange,
  onStepForward,
  onStepBackward,
  canStepForward,
  canStepBackward,
  hideSpeed = false,
}: HistoryPlaybackProps) {
  const buttonStyle: React.CSSProperties = {
    padding: '0.5rem',
    borderRadius: '0.375rem',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
    flexShrink: 0,
  };

  const disabledStyle: React.CSSProperties = {
    ...buttonStyle,
    opacity: 0.4,
    cursor: 'not-allowed',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.375rem',
      flexShrink: 0,
    }}>
      {/* Step backward */}
      <button
        type="button"
        onClick={onStepBackward}
        disabled={!canStepBackward}
        style={canStepBackward ? buttonStyle : disabledStyle}
        title="Previous snapshot"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15,17 9,12 15,7" />
        </svg>
      </button>

      {/* Play/Pause */}
      <button
        type="button"
        onClick={onPlayPause}
        style={{
          ...buttonStyle,
          padding: '0.5rem 1rem',
          background: isPlaying ? 'var(--accent-primary)' : 'var(--bg-secondary)',
          color: isPlaying ? 'var(--text-on-accent)' : 'var(--text-primary)',
        }}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>

      {/* Step forward */}
      <button
        type="button"
        onClick={onStepForward}
        disabled={!canStepForward}
        style={canStepForward ? buttonStyle : disabledStyle}
        title="Next snapshot"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9,17 15,12 9,7" />
        </svg>
      </button>

      {/* Speed selector - hidden when in compact mode */}
      {!hideSpeed && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          marginLeft: '0.5rem',
        }}>
          <span style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
          }}>
            Speed:
          </span>
          <select
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              cursor: 'pointer',
              appearance: 'auto',
              WebkitAppearance: 'menulist',
            }}
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                {s}x
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
