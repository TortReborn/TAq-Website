"use client";

import { useState, useMemo } from 'react';
import { useExecSession } from '@/hooks/useExecSession';
import { useGuildBank, GuildBankTransaction } from '@/hooks/useGuildBank';

type View = 'inventory' | 'history';

interface InventoryItem {
  itemName: string;
  bankType: string;
  quantity: number;
}

export default function GuildBankPage() {
  useExecSession();
  const { transactions, loading, error, refresh } = useGuildBank();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('inventory');

  // Compute current inventory: sum deposits - withdrawals per item
  const inventory = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const t of transactions) {
      const key = `${t.itemName}||${t.bankType}`;
      const existing = map.get(key);
      const delta = t.action === 'deposited' ? t.itemCount : -t.itemCount;
      if (existing) {
        existing.quantity += delta;
      } else {
        map.set(key, { itemName: t.itemName, bankType: t.bankType, quantity: delta });
      }
    }
    return Array.from(map.values())
      .filter(i => i.quantity > 0)
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [transactions]);

  const filteredInventory = useMemo(() => {
    if (!search.trim()) return inventory;
    const q = search.toLowerCase();
    return inventory.filter(i => i.itemName.toLowerCase().includes(q));
  }, [inventory, search]);

  const filteredHistory = useMemo(() => {
    if (!search.trim()) return transactions;
    const q = search.toLowerCase();
    return transactions.filter(t =>
      t.playerName.toLowerCase().includes(q) ||
      t.itemName.toLowerCase().includes(q)
    );
  }, [transactions, search]);

  const stats = useMemo(() => {
    const deposits = transactions.filter(t => t.action === 'deposited').length;
    const withdrawals = transactions.filter(t => t.action === 'withdrew').length;
    return { deposits, withdrawals, totalItems: inventory.reduce((s, i) => s + i.quantity, 0), uniqueItems: inventory.length };
  }, [transactions, inventory]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const views: { value: View; label: string }[] = [
    { value: 'inventory', label: 'Current Inventory' },
    { value: 'history', label: 'Transaction History' },
  ];

  return (
    <div>
      <h1 style={{
        fontSize: '1.75rem',
        fontWeight: '800',
        color: 'var(--text-primary)',
        marginBottom: '0.5rem',
      }}>
        Guild Bank
      </h1>
      <p style={{
        color: 'var(--text-secondary)',
        fontSize: '0.85rem',
        marginBottom: '1.5rem',
      }}>
        View current bank contents or browse the full transaction history.
      </p>

      {/* Stats row */}
      {!loading && transactions.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
        }}>
          {[
            { label: 'Items in Bank', value: stats.totalItems, color: 'var(--text-primary)' },
            { label: 'Unique Items', value: stats.uniqueItems, color: 'var(--text-primary)' },
            { label: 'Deposits', value: stats.deposits, color: '#22c55e' },
            { label: 'Withdrawals', value: stats.withdrawals, color: '#ef4444' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-card)',
              borderRadius: '0.5rem',
              padding: '0.6rem 1rem',
              minWidth: '100px',
            }}>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {views.map(v => (
            <button
              key={v.value}
              onClick={() => setView(v.value)}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid',
                borderColor: view === v.value ? 'var(--color-ocean-500)' : 'var(--border-card)',
                background: view === v.value ? 'var(--color-ocean-500)' : 'transparent',
                color: view === v.value ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '600',
                outline: 'none',
                WebkitAppearance: 'none',
                transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            placeholder={view === 'inventory' ? 'Search items...' : 'Search player or item...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--border-card)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              outline: 'none',
              width: '220px',
            }}
          />
          <button
            onClick={refresh}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--border-card)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: '600',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
        }}>
          Loading guild bank data...
        </div>
      ) : error ? (
        <div style={{
          textAlign: 'center',
          padding: '2rem 1rem',
          color: '#ef4444',
          fontSize: '0.85rem',
        }}>
          {error}
        </div>
      ) : view === 'inventory' ? (
        <>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            marginBottom: '0.5rem',
          }}>
            {filteredInventory.length} item{filteredInventory.length !== 1 ? 's' : ''} in bank
          </div>

          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-card)',
            borderRadius: '0.5rem',
            overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                    {['Item', 'Qty', 'Bank'].map(h => (
                      <th key={h} style={{
                        padding: '0.65rem 0.75rem',
                        textAlign: h === 'Qty' ? 'center' : 'left',
                        color: 'var(--text-secondary)',
                        fontWeight: '600',
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No items found.
                      </td>
                    </tr>
                  ) : (
                    filteredInventory.map(i => (
                      <tr key={`${i.itemName}||${i.bankType}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-primary)' }}>
                          {i.itemName}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-primary)', fontWeight: '600', textAlign: 'center' }}>
                          {i.quantity}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          {i.bankType}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            marginBottom: '0.5rem',
          }}>
            Showing {filteredHistory.length} of {transactions.length} transactions
          </div>

          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-card)',
            borderRadius: '0.5rem',
            overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                    {['Time', 'Player', 'Action', 'Item', 'Qty', 'Bank'].map(h => (
                      <th key={h} style={{
                        padding: '0.65rem 0.75rem',
                        textAlign: h === 'Qty' ? 'center' : 'left',
                        color: 'var(--text-secondary)',
                        fontWeight: '600',
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No transactions found.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((t: GuildBankTransaction) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                          {formatDate(t.firstReported)}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-primary)', fontWeight: '600' }}>
                          {t.playerName}
                        </td>
                        <td style={{
                          padding: '0.55rem 0.75rem',
                          color: t.action === 'deposited' ? '#22c55e' : '#ef4444',
                          fontWeight: '600',
                          textTransform: 'capitalize',
                        }}>
                          {t.action}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-primary)' }}>
                          {t.itemName}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-primary)', fontWeight: '600', textAlign: 'center' }}>
                          {t.itemCount}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          {t.bankType}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
