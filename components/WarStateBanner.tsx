"use client";

import { useMemo } from "react";
import { AlertTriangle, FastForward } from "lucide-react";
import { outageAt } from "@/lib/war-outages";

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

const WARNING_COLOR = '#d97706';

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
  const outage = useMemo(() => outageAt(current), [current]);
  // Half-open: g.end is the day data resumed, so jumping there is clean
  const gap = useMemo(
    () => gaps?.find(g => current >= g.start && current < g.end) ?? null,
    [gaps, current]
  );

  if (!outage && !gap) return null;

  const [title, detail, resumeDate] = outage
    ? [
        'Wars were down',
        `Wynncraft disabled wars on ${DATE_FORMAT_UTC.format(outage.startMs)} — territory control was frozen, so the map is accurate and nothing is missing.`,
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
