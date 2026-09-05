"use client";

import { useMemo } from "react";
import { AlertTriangle, FastForward, Layers } from "lucide-react";
import { outageAt } from "@/lib/war-outages";
import { anchorAt, isReconstructed, RECONSTRUCTION_END } from "@/lib/reconstruction";

// Formatters cached at module level (Intl construction is expensive)
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
// Outage windows are UTC day bounds — format in UTC so the dates don't
// shift a day in western timezones.
const DATE_FORMAT_UTC = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "six and a half weeks", "four days" — so a long outage reads as deliberate. */
function describeSpan(startMs: number, endMs: number): string {
  const days = Math.max(1, Math.round((endMs - startMs) / 86400000));
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  const weeks = days / 7;
  const whole = Math.floor(weeks);
  const half = weeks - whole >= 0.35 && weeks - whole < 0.85;
  const rounded = weeks - whole >= 0.85 ? whole + 1 : whole;
  return `${half ? `${whole} and a half` : rounded} weeks`;
}

const WARNING_COLOR = '#d97706';
// Reconstructed time is a different claim from missing data, so it gets its
// own colour rather than borrowing the warning amber.
const SYNTHETIC_COLOR = '#7c6bd6';

interface WarStateBannerProps {
  /** The scrubbed history timestamp */
  current: Date;
  /** Logging gaps from the bounds API (wars continued, data missing) */
  gaps?: Array<{ start: Date; end: Date }>;
  /** Jump the scrubber to a date (same handler as the date picker) */
  onJump?: (date: Date) => void;
}

/**
 * Persistent top-left map banner shown while the history scrubber sits in a
 * "dead zone" — either a known war-outage window (wars were disabled, the
 * frozen map is accurate) or a logging gap (wars continued but no exchanges
 * were recorded, so the map is stale and we'd love the missing data).
 * Offers a one-click jump to the moment things picked back up.
 */
export default function WarStateBanner({ current, gaps, onJump }: WarStateBannerProps) {
  const synthetic = useMemo(() => (isReconstructed(current) ? anchorAt(current) : null), [current]);
  const outage = useMemo(() => outageAt(current), [current]);
  // Half-open: g.end is the day data resumed, so jumping there is clean
  const gap = useMemo(
    () => gaps?.find(g => current >= g.start && current < g.end) ?? null,
    [gaps, current]
  );

  if (!synthetic && !outage && !gap) return null;

  // Before the exchange log begins there is nothing to be missing: the map is
  // a reading of the surviving sources, not a recording.
  if (synthetic) {
    return (
      <div
        data-testid="war-state-banner"
        data-state="synthetic"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          maxWidth: '20rem',
          padding: '0.5rem 0.75rem',
          backgroundColor: 'var(--bg-card-solid, var(--bg-card))',
          border: `1px solid ${SYNTHETIC_COLOR}88`,
          borderLeft: `3px solid ${SYNTHETIC_COLOR}`,
          borderRadius: '0.5rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          pointerEvents: 'auto',
        }}
      >
        <Layers size={16} strokeWidth={2.5} color={SYNTHETIC_COLOR} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
        <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600, color: SYNTHETIC_COLOR }}>Synthetic reconstruction</div>
          <div style={{ color: 'var(--text-secondary)' }}>
            No territory data was recorded before {DATE_FORMAT_UTC.format(RECONSTRUCTION_END)}. This map is reconstructed
            from surviving screenshots, one archived leaderboard capture and written accounts, so treat it as a reading
            of the sources rather than a record of what happened.
          </div>
          <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{synthetic.label}</span> — {synthetic.note}
          </div>
          {onJump && (
            <button
              type="button"
              data-testid="war-state-jump"
              onClick={() => onJump(new Date(RECONSTRUCTION_END))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                marginTop: '0.375rem',
                padding: '0.2rem 0.5rem',
                fontSize: '0.7rem',
                fontWeight: 600,
                color: SYNTHETIC_COLOR,
                background: 'transparent',
                border: `1px solid ${SYNTHETIC_COLOR}88`,
                borderRadius: '0.375rem',
                cursor: 'pointer',
              }}
            >
              <FastForward size={11} strokeWidth={2.5} />
              Jump to recorded data ({DATE_FORMAT_UTC.format(RECONSTRUCTION_END)})
            </button>
          )}
        </div>
      </div>
    );
  }

  const [title, detail, resumeDate] = outage
    ? [
        'Wars were down',
        `Wynncraft disabled wars on ${DATE_FORMAT_UTC.format(outage.startMs)} and they stayed off for ${describeSpan(outage.startMs, outage.resumeMs)} — territory control was frozen, so the map is accurate and nothing is missing.`,
        new Date(outage.resumeMs),
      ]
    : [
        'Logging gap',
        `No exchanges were recorded after ${DATE_FORMAT.format(gap!.start)} — wars continued, but the data is missing, so the map is frozen at the last known state. Have war logs from this era? We’d love a copy!`,
        gap!.end,
      ];

  return (
    <div
      data-testid="war-state-banner"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        maxWidth: '20rem',
        padding: '0.5rem 0.75rem',
        backgroundColor: 'var(--bg-card-solid, var(--bg-card))',
        border: `1px solid ${WARNING_COLOR}88`,
        borderLeft: `3px solid ${WARNING_COLOR}`,
        borderRadius: '0.5rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        pointerEvents: 'auto',
      }}
    >
      <AlertTriangle size={16} strokeWidth={2.5} color={WARNING_COLOR} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
      <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
        <div style={{ fontWeight: 600, color: WARNING_COLOR }}>{title}</div>
        <div style={{ color: 'var(--text-secondary)' }}>{detail}</div>
        {onJump && (
          <button
            type="button"
            data-testid="war-state-jump"
            onClick={() => onJump(resumeDate)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              marginTop: '0.375rem',
              padding: '0.2rem 0.5rem',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: WARNING_COLOR,
              background: 'transparent',
              border: `1px solid ${WARNING_COLOR}88`,
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            <FastForward size={11} strokeWidth={2.5} />
            {outage
              ? `Jump to wars returning (${DATE_FORMAT_UTC.format(resumeDate)})`
              : `Jump to next data (${DATE_FORMAT.format(resumeDate)})`}
          </button>
        )}
      </div>
    </div>
  );
}
