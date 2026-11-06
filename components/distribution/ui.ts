/** Shared look for the /exec/distribution tabs. */

export const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.75rem', padding: '1rem' };
export const input: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)', borderRadius: '0.375rem',
  padding: '0.45rem 0.65rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
};
export const btn = (bg: string): React.CSSProperties => ({
  padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer',
  fontSize: '0.8rem', fontWeight: 600, background: bg, color: '#fff',
});
export const th: React.CSSProperties = { textAlign: 'left', padding: '0.4rem 0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' };
export const td: React.CSSProperties = { padding: '0.45rem 0.5rem', fontSize: '0.83rem', color: 'var(--text-primary)', borderTop: '1px solid var(--border-card)' };
export const h2: React.CSSProperties = { fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.75rem' };
export const muted: React.CSSProperties = { fontSize: '0.8rem', color: 'var(--text-muted)' };

export const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};
