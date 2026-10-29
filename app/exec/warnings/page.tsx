"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useExecWarnings } from '@/hooks/useExecWarnings';
import AddWarningModal from './AddWarningModal';
import { btnStyle, cardStyle, CountSummary, formatDate, inputStyle, PlayerHead } from './ui';

export default function ExecWarningsPage() {
  const router = useRouter();
  const { profiles, loading, error, refresh } = useExecWarnings();
  const [query, setQuery] = useState('');
  const [showCleared, setShowCleared] = useState(false);
  const [adding, setAdding] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles.filter(p =>
      (showCleared || p.activeEntryCount > 0) && (!q || p.ign.toLowerCase().includes(q))
    );
  }, [profiles, query, showCleared]);

  const clearedCount = profiles.filter(p => p.activeEntryCount === 0).length;

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>Warnings</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
          {loading && profiles.length === 0
            ? 'Loading…'
            : `${profiles.length - clearedCount} player${profiles.length - clearedCount !== 1 ? 's' : ''} on file`}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={refresh} style={{ ...btnStyle, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>
          Refresh
        </button>
        <button onClick={() => setAdding(true)} style={{ ...btnStyle, background: '#ef4444', color: '#fff' }}>
          Add warning
        </button>
      </div>
    </div>
  );

  const modal = adding && (
    <AddWarningModal
      onClose={() => setAdding(false)}
      onAdded={(uuid, failed) => {
        setAdding(false);
        const qs = failed.length ? `?uploadFailed=${failed.length}` : '';
        router.push(`/exec/warnings/${uuid}${qs}`);
      }}
    />
  );

  if (loading && profiles.length === 0) {
    return (
      <div>
        {header}
        <div style={{ ...cardStyle, height: '400px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        {modal}
      </div>
    );
  }

  if (error && profiles.length === 0) {
    return (
      <div>
        {header}
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '1rem', color: '#ef4444' }}>
          Failed to load warnings: {error}
        </div>
        {modal}
      </div>
    );
  }

  return (
    <div>
      {header}

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          id="warnings-search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search players…"
          style={{ ...inputStyle, maxWidth: '320px' }}
        />
        {clearedCount > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input id="warnings-show-cleared" type="checkbox" checked={showCleared} onChange={e => setShowCleared(e.target.checked)} />
            Show {clearedCount} player{clearedCount !== 1 ? 's' : ''} with everything revoked
          </label>
        )}
      </div>

      {visible.length === 0 ? (
        <div style={{ ...cardStyle, padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {profiles.length === 0
            ? 'No warnings on file yet. Use Add warning to log the first one.'
            : 'No players match that search.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {visible.map(p => (
            <Link
              key={p.uuid}
              href={`/exec/warnings/${p.uuid}`}
              style={{
                ...cardStyle, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
                textDecoration: 'none', opacity: p.activeEntryCount === 0 ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                <PlayerHead ign={p.ign} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.ign}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    {p.entryCount} entr{p.entryCount !== 1 ? 'ies' : 'y'} · last {formatDate(p.lastIssuedAt)}
                  </div>
                </div>
              </div>
              <CountSummary counts={p.counts} />
            </Link>
          ))}
        </div>
      )}

      {modal}
    </div>
  );
}
