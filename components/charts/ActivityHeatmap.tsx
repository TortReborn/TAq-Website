"use client";

import { useMemo, useState } from 'react';

export interface HeatmapCell {
  dow: number;   // 0 = Monday
  hour: number;
  total: number;
  occurrences: number;
  average: number;
}

interface Props {
  cells: HeatmapCell[];
  title: string;
  unit: string;
  tz: string;
  loading?: boolean;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Five steps of one hue, light→dark by magnitude. The step values live in
 * globals.css because the dark theme re-picks them against its own surface
 * rather than inverting these.
 */
const RAMP = [
  'var(--chart-seq-1)',
  'var(--chart-seq-2)',
  'var(--chart-seq-3)',
  'var(--chart-seq-4)',
  'var(--chart-seq-5)',
];

function bandFor(value: number, max: number): number {
  if (value <= 0 || max <= 0) return -1;      // -1 = empty, not step 0
  const share = value / max;
  return Math.min(RAMP.length - 1, Math.floor(share * RAMP.length * 0.9999));
}

/**
 * 7x24 grid of when the guild is active, in the viewer's chosen zone.
 *
 * Cells are averaged per occurrence rather than summed, because a 30-day
 * window holds five Mondays and only four Tuesdays — raw totals would show
 * that calendar accident as activity. A slot with no occurrences at all is
 * drawn as empty rather than as zero.
 */
export default function ActivityHeatmap({ cells, title, unit, tz, loading }: Props) {
  const [hover, setHover] = useState<HeatmapCell | null>(null);
  const [showTable, setShowTable] = useState(false);

  const { max, byKey } = useMemo(() => {
    const m = cells.reduce((a, c) => Math.max(a, c.average), 0);
    const map = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c]));
    return { max: m, byKey: map };
  }, [cells]);

  if (loading) {
    return <div style={{ height: 220, borderRadius: '0.5rem', background: 'var(--chart-empty)' }} />;
  }

  if (!cells.length || max === 0) {
    return (
      <div style={{
        height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', textAlign: 'center',
      }}>
        Nothing recorded in this range yet
      </div>
    );
  }

  const peak = cells.reduce((a, b) => (b.average > a.average ? b : a));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
          {/* Deliberately does not restate the busiest slot: the caller shows
              that as a headline above the grid, and saying it twice in two
              formats reads as two different facts. */}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Average {unit} per slot · times in {tz}
          </div>
        </div>
        <button
          onClick={() => setShowTable((v) => !v)}
          style={{
            fontSize: '0.7rem', padding: '0.25rem 0.5rem', borderRadius: '0.375rem',
            border: '1px solid var(--border-card)', background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          {showTable ? 'Grid' : 'Table'}
        </button>
      </div>

      {showTable ? (
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.25rem', color: 'var(--text-secondary)' }}>Slot</th>
                <th style={{ textAlign: 'right', padding: '0.25rem', color: 'var(--text-secondary)' }}>Avg {unit}</th>
                <th style={{ textAlign: 'right', padding: '0.25rem', color: 'var(--text-secondary)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {[...cells].sort((a, b) => b.average - a.average).slice(0, 30).map((c) => (
                <tr key={`${c.dow}:${c.hour}`}>
                  <td style={{ padding: '0.25rem', color: 'var(--text-primary)' }}>
                    {DAYS[c.dow]} {String(c.hour).padStart(2, '0')}:00
                  </td>
                  <td style={{ padding: '0.25rem', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {c.average.toFixed(2)}
                  </td>
                  <td style={{ padding: '0.25rem', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {c.total.toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: '520px' }}>
            {/* Hour scale */}
            <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(24, 1fr)', gap: '2px', marginBottom: '2px' }}>
              <div />
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} style={{
                  fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
                </div>
              ))}
            </div>

            {DAYS.map((day, dow) => (
              <div key={day} style={{ display: 'grid', gridTemplateColumns: '34px repeat(24, 1fr)', gap: '2px', marginBottom: '2px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: '18px' }}>{day}</div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = byKey.get(`${dow}:${hour}`);
                  const band = cell ? bandFor(cell.average, max) : -1;
                  const isPeak = cell === peak;
                  return (
                    <div
                      key={hour}
                      onMouseEnter={() => cell && setHover(cell)}
                      onMouseLeave={() => setHover(null)}
                      title={cell
                        ? `${day} ${String(hour).padStart(2, '0')}:00 — ${cell.average.toFixed(2)} ${unit} avg (${cell.total.toFixed(0)} over ${cell.occurrences} occurrences)`
                        : `${day} ${String(hour).padStart(2, '0')}:00 — no data`}
                      style={{
                        height: '18px',
                        borderRadius: '2px',
                        background: band < 0 ? 'var(--chart-empty)' : RAMP[band],
                        outline: isPeak ? '2px solid var(--text-primary)' : 'none',
                        outlineOffset: '1px',
                        cursor: cell ? 'pointer' : 'default',
                      }}
                    />
                  );
                })}
              </div>
            ))}

            {/* Legend: the ramp is the only identity channel here, so it is always shown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.6rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Less</span>
              <div style={{ display: 'flex', gap: '2px' }}>
                <div style={{ width: 18, height: 12, borderRadius: 2, background: 'var(--chart-empty)' }} title="No activity" />
                {RAMP.map((c) => (
                  <div key={c} style={{ width: 18, height: 12, borderRadius: 2, background: c }} />
                ))}
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                More — darkest is {max.toFixed(1)} {unit} in one hour
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Fixed to one line whether or not anything is hovered, so moving the
          cursor over the grid never resizes the card underneath it. */}
      <div style={{
        fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem',
        height: '1.15rem', lineHeight: '1.15rem',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {hover && !showTable && (
          <>
            <strong style={{ color: 'var(--text-primary)' }}>
              {DAYS[hover.dow]} {String(hover.hour).padStart(2, '0')}:00
            </strong>
            {' — '}{hover.average.toFixed(2)} {unit} average
            <span style={{ color: 'var(--text-muted)' }}> · {hover.occurrences} occurrences in range</span>
          </>
        )}
      </div>
    </div>
  );
}
