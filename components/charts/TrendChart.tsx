"use client";

import { useMemo, useState } from 'react';

export interface TrendChartPoint {
  t: string;
  value: number;
  /** 0–1 share of the bucket actually observed. Undefined = not a sampled metric. */
  coverage?: number;
  /** 0–1 share of member-days that were interpolated, clamped or capped. */
  approximate?: number;
  /** For averaged metrics: the underlying total (hours) behind the average. */
  rawTotal?: number;
}

interface Props {
  points: TrendChartPoint[];
  /** Names the single series — a one-series chart needs no legend box. */
  title: string;
  unit: string;
  bucket: 'hour' | 'day' | 'week';
  tz: string;
  loading?: boolean;
  /** Most recent data this metric has at all, used to explain an empty range. */
  latest?: string | null;
  /** True when values are averages, so the summary must not read as a total. */
  averaged?: boolean;
  /** Names the underlying total behind an average, e.g. "hours played". */
  rawUnit?: string;
  /** Window-wide figure from the API; for averages this is not the sum of points. */
  total?: number;
}

const PAD = { top: 16, right: 16, bottom: 26, left: 46 };
const HEIGHT = 240;
const VIEW_W = 900;

/** Coverage at or below this reads as "the sampler wasn't watching". */
const GAP_THRESHOLD = 0.5;

/** Above this share of adjusted member-days, a bucket gets called out. */
const ADJUSTED_THRESHOLD = 0.2;

function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? mag * 10;
  // Never subdivide below 1 once the axis spans a whole unit: event counts are
  // integers, and an empty chart was rendering 0 / 0.3 / 0.5 / 0.8 / 1.0.
  if (max >= 1) step = Math.max(1, step);
  const ticks: number[] = [];
  for (let v = 0; v <= max * 1.0001; v += step) ticks.push(v);
  return ticks;
}

function formatValue(v: number): string {
  if (v === 0) return '0';                     // a bare zero, not "0.0"
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return Math.round(v).toLocaleString();
  if (v >= 10) return v.toFixed(0);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

function formatTick(iso: string, bucket: Props['bucket'], tz: string, withYear = false): string {
  const d = new Date(iso);
  if (bucket === 'hour') {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(d);
  }
  // A multi-year span labelled "1 Jan / 4 Feb" reads as one year; the year is
  // the only thing distinguishing those ticks.
  return new Intl.DateTimeFormat('en-GB', withYear
    ? { month: 'short', year: 'numeric', timeZone: tz }
    : { day: 'numeric', month: 'short', timeZone: tz }).format(d);
}

function formatFull(iso: string, bucket: Props['bucket'], tz: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = bucket === 'hour'
    ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz }
    : { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz };
  return new Intl.DateTimeFormat('en-GB', opts).format(d);
}

/**
 * Single-series time chart.
 *
 * Two things it deliberately does not do: it never joins across a bucket the
 * sampler did not observe (those spans get a hatched band and the line breaks),
 * and it never draws a second y-axis. A gap in sampling and a genuine zero look
 * different because they are different.
 */
export default function TrendChart({
  points, title, unit, bucket, tz, loading, latest, averaged, rawUnit, total: totalProp,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const { ticks, xFor, yFor, segments, gaps } = useMemo(() => {
    const maxValue = Math.max(1, ...points.map((p) => p.value));
    const tickValues = niceTicks(maxValue);
    const top = Math.max(maxValue, tickValues[tickValues.length - 1] || 1);
    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;

    const x = (i: number) =>
      PAD.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

    // Two different states, and conflating them hid real data: a bucket with
    // NO observation must break the line, but a bucket that was only partly
    // observed still has a value worth drawing — hatched to say "treat with
    // caution", not erased. Breaking on partial coverage made a day sampled
    // for four hours render as a blank chart.
    const segs: number[][] = [];
    let current: number[] = [];
    const gapRanges: { from: number; to: number }[] = [];
    points.forEach((p, i) => {
      const unobserved = p.coverage !== undefined && p.coverage <= 0;
      const lowConfidence = p.coverage !== undefined && p.coverage <= GAP_THRESHOLD;

      if (unobserved) {
        if (current.length) segs.push(current);
        current = [];
      } else {
        current.push(i);
      }
      if (lowConfidence) {
        const last = gapRanges[gapRanges.length - 1];
        if (last && last.to === i - 1) last.to = i;
        else gapRanges.push({ from: i, to: i });
      }
    });
    if (current.length) segs.push(current);

    return { ticks: tickValues, xFor: x, yFor: y, segments: segs, gaps: gapRanges };
  }, [points]);

  if (loading) {
    return <div style={{ height: HEIGHT, borderRadius: '0.5rem', background: 'var(--chart-empty)' }} />;
  }

  if (!points.length) {
    return (
      <div style={{
        height: HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic',
      }}>
        No data in this range
      </div>
    );
  }

  // For an averaged metric the sum of buckets is meaningless, so the API's
  // window-wide figure is used when it is supplied.
  const total = totalProp ?? points.reduce((s, p) => s + p.value, 0);
  const lastIndex = points.length - 1;
  const hasApproximate = points.some((p) => p.approximate !== undefined);
  // Show years on the axis once the series crosses one.
  const spansYears = points.length > 1
    && new Date(points[0].t).getUTCFullYear() !== new Date(points[points.length - 1].t).getUTCFullYear();

  // A flat zero line is ambiguous on its own. If the metric has data, but all
  // of it predates this window, say so rather than letting it read as "we did
  // nothing".
  const staleNotice =
    total === 0 && latest && new Date(latest) < new Date(points[0].t)
      ? `No data in this range — this metric's most recent record is ${formatFull(latest, bucket, tz)}.`
      : null;
  const hoverPoint = hover !== null ? points[hover] : null;

  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {averaged
              ? `${formatValue(total)} ${unit} across the period · per ${bucket}`
              : `${formatValue(total)} ${unit} total · per ${bucket}`}
          </div>
          {staleNotice && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              {staleNotice}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowTable((v) => !v)}
          style={{
            fontSize: '0.7rem', padding: '0.25rem 0.5rem', borderRadius: '0.375rem',
            border: '1px solid var(--border-card)', background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          {showTable ? 'Chart' : 'Table'}
        </button>
      </div>

      {showTable ? (
        <div style={{ maxHeight: HEIGHT, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.25rem', color: 'var(--text-secondary)' }}>Bucket</th>
                <th style={{ textAlign: 'right', padding: '0.25rem', color: 'var(--text-secondary)' }}>{unit}</th>
                <th style={{ textAlign: 'right', padding: '0.25rem', color: 'var(--text-secondary)' }}>
                  {hasApproximate ? 'Adjusted' : 'Coverage'}
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.t}>
                  <td style={{ padding: '0.25rem', color: 'var(--text-primary)' }}>{formatFull(p.t, bucket, tz)}</td>
                  <td style={{ padding: '0.25rem', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {p.value.toFixed(1)}
                  </td>
                  <td style={{ padding: '0.25rem', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {hasApproximate
                      ? `${Math.round((p.approximate ?? 0) * 100)}%`
                      : p.coverage === undefined ? '—' : `${Math.round(p.coverage * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${VIEW_W} ${HEIGHT}`}
          style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
          role="img"
          aria-label={`${title}: ${formatValue(total)} ${unit} total`}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <pattern id="trend-gap" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-gap)" strokeWidth="1" opacity="0.5" />
            </pattern>
          </defs>

          {/* Gridlines: hairline, solid, recessive */}
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left} x2={VIEW_W - PAD.right} y1={yFor(v)} y2={yFor(v)}
                stroke="var(--chart-grid)" strokeWidth="1"
              />
              <text
                x={PAD.left - 8} y={yFor(v) + 4} textAnchor="end"
                fontSize="11" fill="var(--text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatValue(v)}
              </text>
            </g>
          ))}

          {/* Unobserved spans, marked rather than interpolated across */}
          {gaps.map((g, i) => {
            const x1 = xFor(Math.max(0, g.from - 0.5));
            const x2 = xFor(Math.min(lastIndex, g.to + 0.5));
            return (
              <rect
                key={i} x={x1} y={PAD.top} width={Math.max(2, x2 - x1)} height={HEIGHT - PAD.top - PAD.bottom}
                fill="url(#trend-gap)"
              >
                <title>Sampler offline — no data recorded</title>
              </rect>
            );
          })}

          {segments.map((seg, i) => {
            if (seg.length === 0) return null;
            // A lone observation has no line to be part of. Without a mark it
            // renders as literally nothing — an empty chart that does hold data.
            if (seg.length === 1) {
              const idx = seg[0];
              return (
                <circle
                  key={i} cx={xFor(idx)} cy={yFor(points[idx].value)} r="4"
                  fill="var(--chart-line)" stroke="var(--bg-card-solid)" strokeWidth="2"
                />
              );
            }
            const line = seg.map((idx) => `${xFor(idx)},${yFor(points[idx].value)}`).join(' L ');
            const areaPath =
              `M ${xFor(seg[0])},${yFor(0)} L ${line} L ${xFor(seg[seg.length - 1])},${yFor(0)} Z`;
            return (
              <g key={i}>
                <path d={areaPath} fill="var(--chart-area)" />
                <path
                  d={`M ${line}`} fill="none" stroke="var(--chart-line)" strokeWidth="2"
                  strokeLinejoin="round" strokeLinecap="round"
                />
              </g>
            );
          })}

          {/* Crosshair + end marker */}
          {hover !== null && (
            <line
              x1={xFor(hover)} x2={xFor(hover)} y1={PAD.top} y2={HEIGHT - PAD.bottom}
              stroke="var(--chart-line)" strokeWidth="1" opacity="0.5"
            />
          )}
          {hoverPoint && (
            <circle
              cx={xFor(hover!)} cy={yFor(hoverPoint.value)} r="5"
              fill="var(--chart-line)" stroke="var(--bg-card-solid)" strokeWidth="2"
            />
          )}

          {/* X labels, thinned so they never collide. The final bucket is
              always labelled, so a regular label too close to it is dropped
              rather than left to overlap. */}
          {points.map((p, i) =>
            i === lastIndex || (i % labelEvery === 0 && lastIndex - i >= labelEvery) ? (
              <text
                key={p.t} x={xFor(i)} y={HEIGHT - 8} textAnchor={i === lastIndex ? 'end' : 'middle'}
                fontSize="11" fill="var(--text-muted)"
              >
                {formatTick(p.t, bucket, tz, spansYears)}
              </text>
            ) : null,
          )}

          {/* Hit targets wider than the marks */}
          {points.map((p, i) => (
            <rect
              key={`hit-${p.t}`}
              x={xFor(i) - (VIEW_W - PAD.left - PAD.right) / (points.length * 2) - 1}
              y={PAD.top}
              width={(VIEW_W - PAD.left - PAD.right) / points.length + 2}
              height={HEIGHT - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            >
              <title>
                {`${formatFull(p.t, bucket, tz)}: ${p.value.toFixed(1)} ${unit}` +
                 (p.coverage !== undefined ? ` (${Math.round(p.coverage * 100)}% observed)` : '') +
                 ((p.approximate ?? 0) > ADJUSTED_THRESHOLD
                   ? ` (${Math.round(p.approximate! * 100)}% of member-days adjusted)` : '')}
              </title>
            </rect>
          ))}
        </svg>
      )}

      {/* Always rendered, fixed to one line: a readout that appears on hover
          would grow the card and shove the page under the cursor, and wrapping
          text would do it again at a second breakpoint. */}
      {!showTable && (
        <div style={{
          fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem',
          height: '1.15rem', lineHeight: '1.15rem',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {hoverPoint && (
            <>
              <strong style={{ color: 'var(--text-primary)' }}>
                {formatFull(hoverPoint.t, bucket, tz)}
              </strong>
              {' — '}{hoverPoint.value.toFixed(1)} {unit}
              {hoverPoint.rawTotal !== undefined && (
                <span style={{ color: 'var(--text-muted)' }}>
                  {' '}({Math.round(hoverPoint.rawTotal).toLocaleString()} {rawUnit ?? 'hours'})
                </span>
              )}
              {hoverPoint.coverage !== undefined && hoverPoint.coverage <= GAP_THRESHOLD && (
                <span style={{ color: 'var(--text-muted)' }}>
                  {' '}· only {Math.round(hoverPoint.coverage * 100)}% observed
                </span>
              )}
              {(hoverPoint.approximate ?? 0) > ADJUSTED_THRESHOLD && (
                <span style={{ color: 'var(--text-muted)' }}>
                  {' '}· {Math.round(hoverPoint.approximate! * 100)}% of member-days adjusted
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
