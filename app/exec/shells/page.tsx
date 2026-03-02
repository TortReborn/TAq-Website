"use client";

import { useState, useMemo } from 'react';
import { useExecShells, IngredientRate, MaterialRate } from '@/hooks/useExecShells';
import { getRankColor } from '@/lib/rank-constants';

type Tab = 'manage' | 'leaderboard' | 'ingredients' | 'materials' | 'audit';

const TABS: { key: Tab; label: string }[] = [
  { key: 'manage', label: 'Manage Shells' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'ingredients', label: 'Ingredients' },
  { key: 'materials', label: 'Materials' },
  { key: 'audit', label: 'Audit Log' },
];

const DEFAULT_ING: IngredientRate = { shells: 0, per: 1, highlight: false, toggled: true };
const DEFAULT_TIER = { shells: 0, per: 1, highlight: false, toggled: true };
const DEFAULT_MAT: MaterialRate = { t1: { ...DEFAULT_TIER }, t2: { ...DEFAULT_TIER }, t3: { ...DEFAULT_TIER }, toggled: true };

export default function ExecShellsPage() {
  const {
    members, discordLinks, balances, ingredients, materials, auditLog,
    loading, error, refresh,
    manageShells, editExchangeItem, addExchangeItem, removeExchangeItem,
  } = useExecShells();

  const [activeTab, setActiveTab] = useState<Tab>('manage');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Manage tab state
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [shellAmount, setShellAmount] = useState('');
  const [shellAction, setShellAction] = useState<'add' | 'remove'>('add');
  const [showDropdown, setShowDropdown] = useState(false);

  // Ingredient tab state
  const [editingIng, setEditingIng] = useState<string | null>(null);
  const [editIngVals, setEditIngVals] = useState<IngredientRate>(DEFAULT_ING);
  const [showAddIng, setShowAddIng] = useState(false);
  const [newIngName, setNewIngName] = useState('');
  const [newIngVals, setNewIngVals] = useState<IngredientRate>(DEFAULT_ING);
  const [confirmRemoveIng, setConfirmRemoveIng] = useState<string | null>(null);

  // Material tab state
  const [editingMat, setEditingMat] = useState<string | null>(null);
  const [editMatVals, setEditMatVals] = useState<MaterialRate>(DEFAULT_MAT);
  const [showAddMat, setShowAddMat] = useState(false);
  const [newMatName, setNewMatName] = useState('');
  const [confirmRemoveMat, setConfirmRemoveMat] = useState<string | null>(null);

  // Leaderboard search
  const [lbSearch, setLbSearch] = useState('');

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
    borderRadius: '0.375rem', padding: '0.5rem 0.75rem',
    color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', width: '100%',
  };
  const btnStyle: React.CSSProperties = {
    padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none',
    cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', transition: 'opacity 0.15s',
  };
  const smallBtn: React.CSSProperties = { ...btnStyle, padding: '0.25rem 0.5rem', fontSize: '0.75rem' };
  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block',
  };
  const thStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600',
    color: 'var(--text-secondary)', textTransform: 'uppercase',
  };
  const tdStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-primary)',
  };

  const clearFeedback = () => { setActionError(null); setActionSuccess(null); };

  // Filtered members for search
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return [];
    const q = memberSearch.toLowerCase();
    return members.filter((m: { name: string }) => m.name.toLowerCase().includes(q)).slice(0, 10);
  }, [members, memberSearch]);

  // Resolve selected member info
  const selectedMember = useMemo(() => {
    if (!selectedUuid) return null;
    const link = discordLinks[selectedUuid];
    if (!link) return null;
    const bal = balances.find(b => b.discordId === link.discordId);
    const mem = members.find((m: { uuid: string }) => m.uuid === selectedUuid);
    return {
      ign: mem?.name || link.ign,
      uuid: selectedUuid,
      discordId: link.discordId,
      rank: link.rank,
      shells: bal?.shells ?? 0,
      balance: bal?.balance ?? 0,
    };
  }, [selectedUuid, discordLinks, balances, members]);

  const handleManageShells = async () => {
    if (!selectedMember) return;
    const amt = parseInt(shellAmount);
    if (!amt || amt <= 0) { setActionError('Enter a valid amount'); return; }
    clearFeedback();
    try {
      await manageShells(selectedMember.discordId, amt, shellAction);
      setActionSuccess(`${shellAction === 'add' ? 'Added' : 'Removed'} ${amt} shells ${shellAction === 'add' ? 'to' : 'from'} ${selectedMember.ign}`);
      setShellAmount('');
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleEditIng = async (name: string) => {
    clearFeedback();
    try {
      await editExchangeItem('ingredient', name, editIngVals);
      setEditingIng(null);
    } catch (e: any) { setActionError(e.message); }
  };

  const handleAddIng = async () => {
    if (!newIngName.trim()) return;
    clearFeedback();
    try {
      await addExchangeItem('ingredient', newIngName.trim(), newIngVals);
      setShowAddIng(false);
      setNewIngName('');
      setNewIngVals(DEFAULT_ING);
    } catch (e: any) { setActionError(e.message); }
  };

  const handleRemoveIng = async (name: string) => {
    clearFeedback();
    try {
      await removeExchangeItem('ingredient', name);
      setConfirmRemoveIng(null);
    } catch (e: any) { setActionError(e.message); }
  };

  const handleEditMat = async (name: string) => {
    clearFeedback();
    try {
      await editExchangeItem('material', name, editMatVals);
      setEditingMat(null);
    } catch (e: any) { setActionError(e.message); }
  };

  const handleAddMat = async () => {
    if (!newMatName.trim()) return;
    clearFeedback();
    try {
      await addExchangeItem('material', newMatName.trim(), DEFAULT_MAT);
      setShowAddMat(false);
      setNewMatName('');
    } catch (e: any) { setActionError(e.message); }
  };

  const handleRemoveMat = async (name: string) => {
    clearFeedback();
    try {
      await removeExchangeItem('material', name);
      setConfirmRemoveMat(null);
    } catch (e: any) { setActionError(e.message); }
  };

  if (loading && balances.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>Shell Exchange</h1>
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', height: '400px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && balances.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>Shell Exchange</h1>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '1rem', color: '#ef4444' }}>
          Failed to load shell data: {error}
        </div>
      </div>
    );
  }

  const badge = (on: boolean) => (
    <span style={{
      fontSize: '0.7rem', fontWeight: '600', padding: '0.15rem 0.4rem', borderRadius: '0.2rem',
      background: on ? 'rgba(34, 197, 94, 0.15)' : 'rgba(107, 114, 128, 0.15)',
      color: on ? '#22c55e' : '#6b7280',
    }}>
      {on ? 'Yes' : 'No'}
    </span>
  );

  const ingEntries = Object.entries(ingredients).sort((a, b) => a[0].localeCompare(b[0]));
  const matEntries = Object.entries(materials).sort((a, b) => a[0].localeCompare(b[0]));
  const filteredBalances = lbSearch.trim()
    ? balances.filter(b => b.ign.toLowerCase().includes(lbSearch.toLowerCase()))
    : balances;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>Shell Exchange</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            Manage shell balances and exchange rates
          </p>
        </div>
        <button onClick={refresh} style={{ ...btnStyle, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>
          Refresh
        </button>
      </div>

      {/* Feedback */}
      {actionError && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#22c55e', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {actionSuccess}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-card)', paddingBottom: '0' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); clearFeedback(); }}
            style={{
              ...btnStyle, borderRadius: '0.375rem 0.375rem 0 0',
              background: activeTab === t.key ? 'var(--bg-card)' : 'transparent',
              color: activeTab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === t.key ? '2px solid var(--color-ocean-400)' : '2px solid transparent',
              padding: '0.5rem 1rem',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Manage Shells Tab ═══ */}
      {activeTab === 'manage' && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 1rem' }}>Add or Remove Shells</h2>

          {/* Member search */}
          <div style={{ marginBottom: '1rem', position: 'relative' }}>
            <label style={labelStyle}>Search Member</label>
            <input
              value={memberSearch}
              onChange={e => { setMemberSearch(e.target.value); setShowDropdown(true); setSelectedUuid(null); clearFeedback(); }}
              onFocus={() => setShowDropdown(true)}
              style={inputStyle}
              placeholder="Type a player IGN..."
            />
            {showDropdown && filteredMembers.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                background: 'var(--bg-card)', border: '1px solid var(--border-card)',
                borderRadius: '0 0 0.375rem 0.375rem', maxHeight: '200px', overflowY: 'auto',
              }}>
                {filteredMembers.map((m: { name: string; uuid: string }) => {
                  const link = discordLinks[m.uuid];
                  return (
                    <div
                      key={m.uuid}
                      onClick={() => {
                        setSelectedUuid(m.uuid);
                        setMemberSearch(m.name);
                        setShowDropdown(false);
                        clearFeedback();
                      }}
                      style={{
                        padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem',
                        color: 'var(--text-primary)', borderBottom: '1px solid var(--border-card)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {m.name}
                      {link && <span style={{ color: getRankColor(link.rank), marginLeft: '0.5rem', fontSize: '0.8rem' }}>{link.rank}</span>}
                      {!link && <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem', fontSize: '0.75rem' }}>(not linked)</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected member info */}
          {selectedMember && (
            <div style={{
              background: 'var(--bg-primary)', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem',
              display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap',
            }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Player</span>
                <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{selectedMember.ign}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Rank</span>
                <div style={{ fontWeight: '600', color: getRankColor(selectedMember.rank) }}>{selectedMember.rank || '—'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Balance</span>
                <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{selectedMember.balance}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>All-Time</span>
                <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{selectedMember.shells}</div>
              </div>
            </div>
          )}

          {/* Amount + action */}
          {selectedMember && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Amount</label>
                <input
                  value={shellAmount}
                  onChange={e => setShellAmount(e.target.value)}
                  style={inputStyle}
                  type="number"
                  min="1"
                  placeholder="Number of shells..."
                  onKeyDown={e => e.key === 'Enter' && handleManageShells()}
                />
              </div>
              <button
                onClick={() => setShellAction('add')}
                style={{
                  ...btnStyle,
                  background: shellAction === 'add' ? '#22c55e' : 'var(--bg-primary)',
                  color: shellAction === 'add' ? '#fff' : 'var(--text-secondary)',
                  border: shellAction === 'add' ? 'none' : '1px solid var(--border-card)',
                }}
              >
                Add
              </button>
              <button
                onClick={() => setShellAction('remove')}
                style={{
                  ...btnStyle,
                  background: shellAction === 'remove' ? '#ef4444' : 'var(--bg-primary)',
                  color: shellAction === 'remove' ? '#fff' : 'var(--text-secondary)',
                  border: shellAction === 'remove' ? 'none' : '1px solid var(--border-card)',
                }}
              >
                Remove
              </button>
              <button
                onClick={handleManageShells}
                disabled={!shellAmount.trim()}
                style={{ ...btnStyle, background: 'var(--color-ocean-400)', color: '#fff', opacity: shellAmount.trim() ? 1 : 0.5 }}
              >
                Submit
              </button>
            </div>
          )}

          {!selectedMember && selectedUuid === null && memberSearch.trim() === '' && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontStyle: 'italic' }}>Search for a guild member above to manage their shells.</p>
          )}
        </div>
      )}

      {/* ═══ Leaderboard Tab ═══ */}
      {activeTab === 'leaderboard' && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-card)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              Balance Leaderboard
              <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>({balances.length})</span>
            </h3>
            <input
              value={lbSearch}
              onChange={e => setLbSearch(e.target.value)}
              style={{ ...inputStyle, maxWidth: '220px' }}
              placeholder="Filter by IGN..."
            />
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                {['#', 'Player', 'Rank', 'Balance', 'All-Time'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredBalances.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No entries</td></tr>
              )}
              {filteredBalances.map((b, i) => (
                <tr key={b.discordId} style={{ borderBottom: '1px solid var(--border-card)', background: i % 2 === 1 ? 'rgba(255, 255, 255, 0.025)' : 'transparent' }}>
                  <td style={{ ...tdStyle, fontWeight: '700', color: 'var(--text-secondary)', width: '3rem' }}>{i + 1}</td>
                  <td style={{ ...tdStyle, fontWeight: '500' }}>{b.ign}</td>
                  <td style={{ ...tdStyle, color: getRankColor(b.rank || ''), fontWeight: '600', fontSize: '0.8rem' }}>{b.rank || '—'}</td>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{b.balance}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{b.shells}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ Ingredients Tab ═══ */}
      {activeTab === 'ingredients' && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              Ingredient Exchange Rates
              <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>({ingEntries.length})</span>
            </h3>
            {!showAddIng && (
              <button onClick={() => setShowAddIng(true)} style={{ ...smallBtn, background: '#22c55e', color: '#fff' }}>Add Ingredient</button>
            )}
          </div>

          {/* Add form */}
          {showAddIng && (
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-card)', background: 'var(--bg-primary)', display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={labelStyle}>Name</label>
                <input value={newIngName} onChange={e => setNewIngName(e.target.value)} style={inputStyle} placeholder="Ingredient name" />
              </div>
              <div style={{ width: '80px' }}>
                <label style={labelStyle}>Shells</label>
                <input value={newIngVals.shells} onChange={e => setNewIngVals({ ...newIngVals, shells: parseInt(e.target.value) || 0 })} style={inputStyle} type="number" />
              </div>
              <div style={{ width: '80px' }}>
                <label style={labelStyle}>Per</label>
                <input value={newIngVals.per} onChange={e => setNewIngVals({ ...newIngVals, per: Math.max(1, parseInt(e.target.value) || 1) })} style={inputStyle} type="number" />
              </div>
              <button onClick={handleAddIng} disabled={!newIngName.trim()} style={{ ...smallBtn, background: '#22c55e', color: '#fff', opacity: newIngName.trim() ? 1 : 0.5 }}>Add</button>
              <button onClick={() => { setShowAddIng(false); setNewIngName(''); setNewIngVals(DEFAULT_ING); }} style={{ ...smallBtn, background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>Cancel</button>
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                {['Name', 'Shells', 'Per', 'Highlight', 'Toggled', ''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ingEntries.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No ingredients configured</td></tr>
              )}
              {ingEntries.map(([name, ing], idx) => (
                <tr key={name} style={{ borderBottom: '1px solid var(--border-card)', background: idx % 2 === 1 ? 'rgba(255, 255, 255, 0.025)' : 'transparent' }}>
                  <td style={{ ...tdStyle, fontWeight: '500' }}>{name}</td>
                  {editingIng === name ? (
                    <>
                      <td style={tdStyle}><input value={editIngVals.shells} onChange={e => setEditIngVals({ ...editIngVals, shells: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, width: '70px' }} type="number" /></td>
                      <td style={tdStyle}><input value={editIngVals.per} onChange={e => setEditIngVals({ ...editIngVals, per: Math.max(1, parseInt(e.target.value) || 1) })} style={{ ...inputStyle, width: '70px' }} type="number" /></td>
                      <td style={tdStyle}>
                        <button onClick={() => setEditIngVals({ ...editIngVals, highlight: !editIngVals.highlight })} style={{ ...smallBtn, background: editIngVals.highlight ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)', color: editIngVals.highlight ? '#22c55e' : '#6b7280' }}>
                          {editIngVals.highlight ? 'Yes' : 'No'}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <button onClick={() => setEditIngVals({ ...editIngVals, toggled: !editIngVals.toggled })} style={{ ...smallBtn, background: editIngVals.toggled ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)', color: editIngVals.toggled ? '#22c55e' : '#6b7280' }}>
                          {editIngVals.toggled ? 'Yes' : 'No'}
                        </button>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                          <button onClick={() => handleEditIng(name)} style={{ ...smallBtn, background: '#22c55e', color: '#fff' }}>Save</button>
                          <button onClick={() => setEditingIng(null)} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={tdStyle}>{ing.shells}</td>
                      <td style={tdStyle}>{ing.per}</td>
                      <td style={tdStyle}>{badge(ing.highlight)}</td>
                      <td style={tdStyle}>{badge(ing.toggled)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                          <button onClick={() => { setEditingIng(name); setEditIngVals(ing); }} style={{ ...smallBtn, background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>Edit</button>
                          {confirmRemoveIng === name ? (
                            <>
                              <button onClick={() => handleRemoveIng(name)} style={{ ...smallBtn, background: '#ef4444', color: '#fff' }}>Confirm</button>
                              <button onClick={() => setConfirmRemoveIng(null)} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setConfirmRemoveIng(name)} style={{ ...smallBtn, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Remove</button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ Materials Tab ═══ */}
      {activeTab === 'materials' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              Material Exchange Rates
              <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>({matEntries.length})</span>
            </h3>
            {!showAddMat && (
              <button onClick={() => setShowAddMat(true)} style={{ ...smallBtn, background: '#22c55e', color: '#fff' }}>Add Material</button>
            )}
          </div>

          {/* Add form */}
          {showAddMat && (
            <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Material Name</label>
                <input value={newMatName} onChange={e => setNewMatName(e.target.value)} style={inputStyle} placeholder="Material name" />
              </div>
              <button onClick={handleAddMat} disabled={!newMatName.trim()} style={{ ...smallBtn, background: '#22c55e', color: '#fff', opacity: newMatName.trim() ? 1 : 0.5 }}>Add</button>
              <button onClick={() => { setShowAddMat(false); setNewMatName(''); }} style={{ ...smallBtn, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>Cancel</button>
            </div>
          )}

          {matEntries.length === 0 && (
            <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              No materials configured
            </div>
          )}

          {matEntries.map(([name, mat]) => (
            <div key={name} style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', marginBottom: '0.75rem', overflow: 'hidden' }}>
              {/* Material header */}
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{name}</span>
                  {editingMat === name ? (
                    <button onClick={() => setEditMatVals({ ...editMatVals, toggled: !editMatVals.toggled })} style={{ ...smallBtn, background: editMatVals.toggled ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)', color: editMatVals.toggled ? '#22c55e' : '#6b7280' }}>
                      {editMatVals.toggled ? 'Active' : 'Inactive'}
                    </button>
                  ) : (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: '600', padding: '0.15rem 0.4rem', borderRadius: '0.2rem',
                      background: mat.toggled ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)',
                      color: mat.toggled ? '#22c55e' : '#6b7280',
                    }}>
                      {mat.toggled ? 'Active' : 'Inactive'}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {editingMat === name ? (
                    <>
                      <button onClick={() => handleEditMat(name)} style={{ ...smallBtn, background: '#22c55e', color: '#fff' }}>Save</button>
                      <button onClick={() => setEditingMat(null)} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditingMat(name); setEditMatVals(mat); }} style={{ ...smallBtn, background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>Edit</button>
                      {confirmRemoveMat === name ? (
                        <>
                          <button onClick={() => handleRemoveMat(name)} style={{ ...smallBtn, background: '#ef4444', color: '#fff' }}>Confirm</button>
                          <button onClick={() => setConfirmRemoveMat(null)} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmRemoveMat(name)} style={{ ...smallBtn, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Remove</button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Tier table */}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                    {['Tier', 'Shells', 'Per', 'Highlight', 'Toggled'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(['t1', 't2', 't3'] as const).map((tier, ti) => {
                    const tierData = mat[tier] || DEFAULT_TIER;
                    const tierLabel = `Tier ${ti + 1}`;
                    const tierColors = ['#22c55e', '#eab308', '#ef4444'];
                    return (
                      <tr key={tier} style={{ borderBottom: ti < 2 ? '1px solid var(--border-card)' : 'none' }}>
                        <td style={{ ...tdStyle, fontWeight: '600', color: tierColors[ti] }}>{tierLabel}</td>
                        {editingMat === name ? (
                          <>
                            <td style={tdStyle}>
                              <input
                                value={editMatVals[tier]?.shells ?? 0}
                                onChange={e => setEditMatVals({ ...editMatVals, [tier]: { ...editMatVals[tier], shells: parseInt(e.target.value) || 0 } })}
                                style={{ ...inputStyle, width: '70px' }} type="number"
                              />
                            </td>
                            <td style={tdStyle}>
                              <input
                                value={editMatVals[tier]?.per ?? 1}
                                onChange={e => setEditMatVals({ ...editMatVals, [tier]: { ...editMatVals[tier], per: Math.max(1, parseInt(e.target.value) || 1) } })}
                                style={{ ...inputStyle, width: '70px' }} type="number"
                              />
                            </td>
                            <td style={tdStyle}>
                              <button
                                onClick={() => setEditMatVals({ ...editMatVals, [tier]: { ...editMatVals[tier], highlight: !editMatVals[tier]?.highlight } })}
                                style={{ ...smallBtn, background: editMatVals[tier]?.highlight ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)', color: editMatVals[tier]?.highlight ? '#22c55e' : '#6b7280' }}
                              >
                                {editMatVals[tier]?.highlight ? 'Yes' : 'No'}
                              </button>
                            </td>
                            <td style={tdStyle}>
                              <button
                                onClick={() => setEditMatVals({ ...editMatVals, [tier]: { ...editMatVals[tier], toggled: !editMatVals[tier]?.toggled } })}
                                style={{ ...smallBtn, background: editMatVals[tier]?.toggled ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)', color: editMatVals[tier]?.toggled ? '#22c55e' : '#6b7280' }}
                              >
                                {editMatVals[tier]?.toggled ? 'Yes' : 'No'}
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={tdStyle}>{tierData.shells}</td>
                            <td style={tdStyle}>{tierData.per}</td>
                            <td style={tdStyle}>{badge(tierData.highlight)}</td>
                            <td style={tdStyle}>{badge(tierData.toggled)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Audit Log Tab ═══ */}
      {activeTab === 'audit' && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-card)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              Recent Shell Actions
              <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>({auditLog.length})</span>
            </h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                {['Actor', 'Action', 'Time'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {auditLog.length === 0 && (
                <tr><td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No recent shell actions</td></tr>
              )}
              {auditLog.map((entry, idx) => (
                <tr key={entry.id} style={{ borderBottom: '1px solid var(--border-card)', background: idx % 2 === 1 ? 'rgba(255, 255, 255, 0.025)' : 'transparent' }}>
                  <td style={{ ...tdStyle, fontWeight: '500' }}>{entry.actorName}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{entry.action}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{new Date(entry.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
