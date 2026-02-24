"use client";

import { useState, useRef, useEffect } from "react";

interface HistoryPlaybackProps {
  isPlaying: boolean;
  speed: number;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  canStepForward: boolean;
  canStepBackward: boolean;
  hideSpeed?: boolean;
}

const SPEED_OPTIONS = [1, 2, 10, 50];
const FAST_SPEED = -1; // sentinel: jump 1 day every 0.1s

function speedLabel(s: number): string {
  return s === FAST_SPEED ? 'Fast' : `${s}x`;
}

export default function HistoryPlayback({
  isPlaying,
  speed,
  onPlayPause,
  onSpeedChange,
  onStepForward,
  onStepBackward,
  onJumpToStart,
  onJumpToEnd,
  canStepForward,
  canStepBackward,
  hideSpeed = false,
}: HistoryPlaybackProps) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!speedOpen) return;
    const handler = (e: MouseEvent) => {
      if (speedRef.current && !speedRef.current.contains(e.target as Node)) {
        setSpeedOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [speedOpen]);

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
      {/* Jump to start */}
      <button
        type="button"
        onClick={onJumpToStart}
        disabled={!canStepBackward}
        style={canStepBackward ? buttonStyle : disabledStyle}
        title="Jump to start"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="17,17 11,12 17,7" />
          <line x1="7" y1="7" x2="7" y2="17" />
        </svg>
      </button>

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

      {/* Jump to end */}
      <button
        type="button"
        onClick={onJumpToEnd}
        disabled={!canStepForward}
        style={canStepForward ? buttonStyle : disabledStyle}
        title="Jump to end"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="7,17 13,12 7,7" />
          <line x1="17" y1="7" x2="17" y2="17" />
        </svg>
      </button>

      {/* Custom speed dropdown - hidden when in compact mode */}
      {!hideSpeed && (
        <div
          ref={speedRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            marginLeft: '0.5rem',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Speed:
          </span>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSpeedOpen(prev => !prev); }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                ...buttonStyle,
                padding: '0.25rem 0.5rem',
                fontSize: '0.875rem',
                gap: '0.25rem',
                minWidth: '3.5rem',
              }}
            >
              {speedLabel(speed)}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6,9 12,15 18,9" />
              </svg>
            </button>
            {speedOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: '0.25rem',
                  background: 'var(--bg-card-solid)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.375rem',
                  overflow: 'hidden',
                  zIndex: 50,
                  minWidth: '3.5rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                {[...SPEED_OPTIONS, FAST_SPEED].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSpeedChange(s);
                      setSpeedOpen(false);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '0.375rem 0.625rem',
                      border: 'none',
                      background: s === speed ? 'var(--accent-primary)' : 'var(--bg-card-solid)',
                      color: s === speed ? 'var(--text-on-accent)' : 'var(--text-primary)',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {speedLabel(s)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
