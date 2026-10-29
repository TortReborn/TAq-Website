"use client";

import { KIND_META, type WarningCounts, type WarningKind } from '@/lib/warnings';

export const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.5rem 0.75rem',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', width: '100%',
};

export const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none',
  cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', transition: 'opacity 0.15s',
};

export const smallBtn: React.CSSProperties = { ...btnStyle, padding: '0.25rem 0.5rem', fontSize: '0.75rem' };

export const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block',
};

export const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)',
};

export function KindChip({ kind, revoked }: { kind: WarningKind; revoked?: boolean }) {
  const meta = KIND_META[kind];
  return (
    <span
      title={meta.hint}
      style={{
        display: 'inline-block', padding: '0.125rem 0.5rem', borderRadius: '0.25rem',
        fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.03em', textTransform: 'uppercase',
        color: meta.color, background: `${meta.color}1f`, border: `1px solid ${meta.color}55`,
        textDecoration: revoked ? 'line-through' : 'none',
      }}
    >
      {meta.label}
    </span>
  );
}

/** The red count badge plus per-level chips. */
export function CountSummary({ counts, size = 'md' }: { counts: WarningCounts; size?: 'md' | 'lg' }) {
  const badge = size === 'lg' ? 36 : 28;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <span
        title="Active soft, written and formal warnings"
        style={{
          minWidth: badge, height: badge, padding: '0 0.5rem', borderRadius: badge / 2,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: counts.total > 0 ? '#ef4444' : 'var(--bg-primary)',
          color: counts.total > 0 ? '#fff' : 'var(--text-secondary)',
          border: counts.total > 0 ? 'none' : '1px solid var(--border-card)',
          fontWeight: '800', fontSize: size === 'lg' ? '1rem' : '0.85rem', fontVariantNumeric: 'tabular-nums',
        }}
      >
        {counts.total}
      </span>
      {(['soft', 'written', 'formal'] as const).filter(k => counts[k] > 0).map(k => (
        <span key={k} style={{ fontSize: '0.75rem', color: KIND_META[k].color, fontWeight: '600' }}>
          {counts[k]} {KIND_META[k].label.toLowerCase()}
        </span>
      ))}
      {counts.dishonored && <KindChip kind="dishonored_fish" />}
    </div>
  );
}

export function PlayerHead({ ign, size = 40 }: { ign: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://mc-heads.net/avatar/${encodeURIComponent(ign)}/${size}`}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: '0.25rem', imageRendering: 'pixelated', flex: 'none' }}
    />
  );
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
