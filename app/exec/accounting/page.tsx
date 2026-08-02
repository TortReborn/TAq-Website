"use client";

import { useCallback, useEffect, useState } from 'react';
import styles from './accounting.module.css';

interface Entry {
  id: number;
  balance: number;
  previousBalance: number | null;
  delta: number | null;
  action: string;
  reason: string;
  author: string | null;
  storageAccount: string;
  createdAt: string;
}

interface AccountingData {
  entries: Entry[];
  current: { balance: number; updatedAt: string; author: string | null; storageAccount: string } | null;
  stats: { incoming: number; outgoing: number; changes: number };
  page: number;
  total: number;
  totalPages: number;
}

function emeralds(value: number | null, signed = false): string {
  if (value === null) return '—';
  const sign = signed && value !== 0 ? (value > 0 ? '+' : '−') : '';
  const amount = Math.abs(value);
  return `${sign}${Math.floor(amount / 64)} stx + ${amount % 64} LE`;
}

function date(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function AccountingPage() {
  const [data, setData] = useState<AccountingData | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (activeSearch) params.set('search', activeSearch);
      const response = await fetch(`/api/exec/accounting?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not load accounting.');
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load accounting.');
    } finally {
      setLoading(false);
    }
  }, [activeSearch, page]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>Guild treasury</span>
          <h1>Accounting</h1>
        </div>
        <button onClick={() => void load()}>Refresh</button>
      </header>

      <section className={styles.stats}>
        <article className={styles.balance}>
          <span>Current guild funds</span>
          <strong>{emeralds(data?.current?.balance ?? 0)}</strong>
          <small>{data?.current
            ? `Updated ${date(data.current.updatedAt)}${data.current.author ? ` by ${data.current.author}` : ''}`
            : 'No balance scans yet'}</small>
        </article>
        <article><span>Total received</span><strong className={styles.incoming}>{emeralds(data?.stats.incoming ?? 0, true)}</strong></article>
        <article><span>Total paid out</span><strong className={styles.outgoing}>{emeralds(-(data?.stats.outgoing ?? 0), true)}</strong></article>
        <article><span>Recorded changes</span><strong>{data?.stats.changes ?? 0}</strong></article>
      </section>

      <div className={styles.toolbar}>
        <form onSubmit={event => {
          event.preventDefault();
          setPage(1);
          setActiveSearch(search.trim());
        }}>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search reason, action, or author…" />
          <button type="submit">Search</button>
          {activeSearch && <button type="button" onClick={() => { setSearch(''); setActiveSearch(''); setPage(1); }}>Clear</button>}
        </form>
        <span>{data?.total ?? 0} records</span>
      </div>

      {error ? (
        <div className={styles.stateError}>{error}</div>
      ) : loading ? (
        <div className={styles.loading} />
      ) : !data?.entries.length ? (
        <div className={styles.empty}>No accounting entries match this search.</div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Date</th><th>Action</th><th>Change</th><th>Updated balance</th><th>Reason</th><th>Author</th></tr></thead>
              <tbody>
                {data.entries.map(entry => (
                  <tr key={entry.id}>
                    <td>{date(entry.createdAt)}</td>
                    <td>{entry.action}</td>
                    <td className={entry.delta !== null && entry.delta < 0 ? styles.outgoing : styles.incoming}>{emeralds(entry.delta, true)}</td>
                    <td><strong>{emeralds(entry.balance)}</strong></td>
                    <td>{entry.reason || 'N/A'}</td>
                    <td>{entry.author
                      ? <span className={styles.author}>{entry.author}</span>
                      : <span aria-label="No author recorded">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className={styles.pagination} aria-label="Accounting pages">
            <button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
            <span>Page {data.page} of {data.totalPages}</span>
            <button disabled={page >= data.totalPages} onClick={() => setPage(value => value + 1)}>Next</button>
          </nav>
        </>
      )}
    </div>
  );
}
