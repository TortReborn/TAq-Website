"use client";

interface Props {
  label: string;
  value: number;
  unit: string;
  /** Same-length window before this one; null when there is nothing to compare. */
  previous?: number | null;
  /** Series for the sparkline, in bucket order. */
  series?: number[];
  /** Human name of the comparison window, e.g. "previous 30 days". */
  comparisonLabel?: string;
  loading?: boolean;
  active?: boolean;
  onClick?: () => void;
}

/** 1,284 / 12.9K / 1.4M — a headline number should not make you count digits. */
function compact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}K`;
  if (v >= 1000) return Math.round(v).toLocaleString();
  if (v >= 100) return String(Math.round(v));
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

function Sparkline({ series, active }: { series: number[]; active?: boolean }) {
  if (series.length < 2) return null;
  const max = Math.max(...series, 1);
  const w = 100;
  const h = 22;
  const pts = series
    .map((v, i) => `${(i / (series.length - 1)) * w},${h - (v / max) * h}`)
    .join(' L ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
         style={{ width: '100%', height: '22px', display: 'block', marginTop: '0.4rem' }}
         aria-hidden="true">
      <path d={`M 0,${h} L ${pts} L ${w},${h} Z`} fill="var(--chart-area)" />
      <path d={`M ${pts}`} fill="none" stroke={active ? 'var(--chart-line)' : 'var(--chart-spark)'}
            strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * One headline number, its direction, and its shape.
 *
 * Doubles as the metric selector for the chart below it: clicking a tile is a
 * more legible way to switch series than a row of pills, because the tile
 * already shows what you would be switching to.
 */
export default function StatTile({
  label, value, unit, previous, series, comparisonLabel, loading, active, onClick,
}: Props) {
  const delta = previous != null && previous > 0 ? (value - previous) / previous : null;
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      style={{
        textAlign: 'left',
        width: '100%',
        font: 'inherit',
        background: active ? 'var(--chart-tile-active)' : 'var(--bg-card)',
        border: `1px solid ${active ? 'var(--color-ocean-400)' : 'var(--border-card)'}`,
        borderRadius: '0.75rem',
        padding: '0.9rem 1rem',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s ease, background 0.15s ease',
      }}
    >
      {/* Single line, always: a wrapped label pushes this tile's value below
          its neighbours' and the row stops reading as one set of figures. */}
      <div style={{
        fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {label}
      </div>

      {loading ? (
        <div style={{ height: '2.2rem', marginTop: '0.35rem', borderRadius: '0.25rem',
                      background: 'var(--chart-empty)' }} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
            {compact(value)}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{unit}</span>
        </div>
      )}

      {/* Direction is stated in words as well as sign — never colour alone. */}
      {delta !== null && !loading && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
          {delta === 0 ? 'level with' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta * 100).toFixed(0)}% vs`}{' '}
          {comparisonLabel ?? 'previous period'}
        </div>
      )}

      {series && series.length > 1 && !loading && <Sparkline series={series} active={active} />}
    </Tag>
  );
}
