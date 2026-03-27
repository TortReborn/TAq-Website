"use client";

import { useState } from 'react';
import { useExecShellExchange, IngredientItem, MaterialItem } from '@/hooks/useExecShellExchange';

type Tab = 'ingredients' | 'materials';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ingredients', label: 'Ingredients' },
  { key: 'materials', label: 'Materials' },
];

export default function ExecShellExchangePage() {
  const {
    ingredients, materials, loading, error, refresh,
    addItem, updateItem, deleteItem,
  } = useExecShellExchange();

  const [activeTab, setActiveTab] = useState<Tab>('ingredients');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Add form state
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addFile, setAddFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const clearFeedback = () => { setActionError(null); setActionSuccess(null); };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
    borderRadius: '0.375rem', padding: '0.5rem 0.75rem',
    color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', width: '100%',
    colorScheme: 'dark',
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

  const badge = (on: boolean) => (
    <span style={{
      fontSize: '0.7rem', fontWeight: '600', padding: '0.15rem 0.4rem', borderRadius: '0.2rem',
      background: on ? 'rgba(34, 197, 94, 0.15)' : 'rgba(107, 114, 128, 0.15)',
      color: on ? '#22c55e' : '#6b7280',
    }}>
      {on ? 'Yes' : 'No'}
    </span>
  );

  const iconUrl = (category: string, key: string) =>
    `/api/exec/shell-exchange/image?category=${category}&key=${encodeURIComponent(key)}`;

  // --- Add handler ---
  const handleAdd = async () => {
    if (!addName.trim() || !addFile) return;
    clearFeedback();
    setAdding(true);
    try {
      const formData = new FormData();
      formData.append('image', addFile);
      formData.append('name', addName.trim());
      formData.append('type', activeTab === 'ingredients' ? 'ingredient' : 'material');
      await addItem(formData);
      setActionSuccess(`Added "${addName.trim()}"`);
      setAddName('');
      setAddFile(null);
      setShowAdd(false);
    } catch (e: any) {
      setActionError(e.message);
    }
    setAdding(false);
  };

  // --- Edit handlers ---
  const startEditIngredient = (item: IngredientItem) => {
    setEditingKey(item.key);
    setEditFile(null);
    setEditValues({ shells: item.shells, per: item.per, highlight: item.highlight, toggled: item.toggled });
  };

  const startEditMaterial = (item: MaterialItem) => {
    setEditingKey(item.key);
    setEditFile(null);
    setEditValues({
      t1_shells: item.tiers.t1.shells, t1_per: item.tiers.t1.per, t1_highlight: item.tiers.t1.highlight, t1_toggled: item.tiers.t1.toggled,
      t2_shells: item.tiers.t2.shells, t2_per: item.tiers.t2.per, t2_highlight: item.tiers.t2.highlight, t2_toggled: item.tiers.t2.toggled,
      t3_shells: item.tiers.t3.shells, t3_per: item.tiers.t3.per, t3_highlight: item.tiers.t3.highlight, t3_toggled: item.tiers.t3.toggled,
    });
  };

  const handleSave = async () => {
    if (!editingKey) return;
    clearFeedback();
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('name', editingKey);
      formData.append('type', activeTab === 'ingredients' ? 'ingredient' : 'material');
      if (editFile) formData.append('image', editFile);

      if (activeTab === 'ingredients') {
        formData.append('shells', String(editValues.shells));
        formData.append('per', String(editValues.per));
        formData.append('highlight', String(editValues.highlight));
        formData.append('toggled', String(editValues.toggled));
      } else {
        for (const tier of ['t1', 't2', 't3']) {
          formData.append(`${tier}_shells`, String(editValues[`${tier}_shells`]));
          formData.append(`${tier}_per`, String(editValues[`${tier}_per`]));
          formData.append(`${tier}_highlight`, String(editValues[`${tier}_highlight`]));
          formData.append(`${tier}_toggled`, String(editValues[`${tier}_toggled`]));
        }
      }

      await updateItem(formData);
      setActionSuccess(`Updated "${editingKey}"`);
      setEditingKey(null);
      setEditFile(null);
    } catch (e: any) {
      setActionError(e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (key: string) => {
    clearFeedback();
    try {
      await deleteItem(key, activeTab === 'ingredients' ? 'ingredient' : 'material');
      setActionSuccess(`Deleted "${key}"`);
      setConfirmDelete(null);
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  if (loading) return <div style={{ color: 'var(--text-secondary)', padding: '2rem' }}>Loading...</div>;
  if (error) return <div style={{ color: '#ef4444', padding: '2rem' }}>Error: {error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Shell Exchange</h1>
        <button onClick={refresh} style={{ ...smallBtn, background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>Refresh</button>
      </div>

      {/* Feedback */}
      {actionError && (
        <div style={{ padding: '0.75rem', borderRadius: '0.375rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: '0.85rem' }}>
          {actionError}
          <button onClick={clearFeedback} style={{ ...smallBtn, marginLeft: '0.5rem', background: 'transparent', color: '#ef4444' }}>Dismiss</button>
        </div>
      )}
      {actionSuccess && (
        <div style={{ padding: '0.75rem', borderRadius: '0.375rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#22c55e', fontSize: '0.85rem' }}>
          {actionSuccess}
          <button onClick={clearFeedback} style={{ ...smallBtn, marginLeft: '0.5rem', background: 'transparent', color: '#22c55e' }}>Dismiss</button>
        </div>
      )}

      {/* Tabs + Add button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-card)', padding: '0.25rem', borderRadius: '0.5rem', width: 'fit-content' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setEditingKey(null); setShowAdd(false); clearFeedback(); }}
              style={{
                ...btnStyle,
                background: activeTab === tab.key ? '#3b82f6' : 'transparent',
                color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd); setEditingKey(null); }}
          style={{ ...btnStyle, background: showAdd ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)', color: showAdd ? '#ef4444' : '#22c55e' }}
        >
          {showAdd ? 'Cancel' : `+ Add ${activeTab === 'ingredients' ? 'Ingredient' : 'Material'}`}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.5rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', border: '1px solid var(--border-card)' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            Add {activeTab === 'ingredients' ? 'Ingredient' : 'Material'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input
                type="text"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="e.g. Ancient Heart"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Image (16x16 or 32x32 PNG)</label>
              <input
                type="file"
                accept="image/png"
                onChange={e => setAddFile(e.target.files?.[0] ?? null)}
                style={{ ...inputStyle, padding: '0.35rem 0.75rem' }}
              />
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !addName.trim() || !addFile}
            style={{ ...btnStyle, background: '#22c55e', color: '#fff', opacity: adding || !addName.trim() || !addFile ? 0.5 : 1, width: 'fit-content' }}
          >
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}

      {/* Ingredients table */}
      {activeTab === 'ingredients' && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--border-card)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                <th style={thStyle}>Icon</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Shells</th>
                <th style={thStyle}>Per</th>
                <th style={thStyle}>Highlight</th>
                <th style={thStyle}>Toggled</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map(item => (
                <tr key={item.key} style={{ borderBottom: '1px solid var(--border-card)' }}>
                  {editingKey === item.key ? (
                    <>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <img
                            src={iconUrl('ings', item.key)}
                            alt={item.name}
                            width={32} height={32}
                            style={{ imageRendering: 'pixelated' }}
                          />
                          <input type="file" accept="image/png" onChange={e => setEditFile(e.target.files?.[0] ?? null)} style={{ ...inputStyle, width: '140px', padding: '0.2rem', fontSize: '0.7rem' }} />
                        </div>
                      </td>
                      <td style={tdStyle}>{item.name}</td>
                      <td style={tdStyle}>
                        <input type="number" min={0} value={editValues.shells} onChange={e => setEditValues({ ...editValues, shells: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, width: '60px' }} />
                      </td>
                      <td style={tdStyle}>
                        <input type="number" min={1} value={editValues.per} onChange={e => setEditValues({ ...editValues, per: parseInt(e.target.value) || 1 })} style={{ ...inputStyle, width: '60px' }} />
                      </td>
                      <td style={tdStyle}>
                        <input type="checkbox" checked={editValues.highlight} onChange={e => setEditValues({ ...editValues, highlight: e.target.checked })} />
                      </td>
                      <td style={tdStyle}>
                        <input type="checkbox" checked={editValues.toggled} onChange={e => setEditValues({ ...editValues, toggled: e.target.checked })} />
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button onClick={handleSave} disabled={saving} style={{ ...smallBtn, background: '#22c55e', color: '#fff' }}>{saving ? '...' : 'Save'}</button>
                          <button onClick={() => setEditingKey(null)} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={tdStyle}>
                        <img
                          src={iconUrl('ings', item.key)}
                          alt={item.name}
                          width={32} height={32}
                          style={{ imageRendering: 'pixelated' }}
                        />
                      </td>
                      <td style={tdStyle}>{item.name}</td>
                      <td style={tdStyle}>{item.shells}</td>
                      <td style={tdStyle}>{item.per}</td>
                      <td style={tdStyle}>{badge(item.highlight)}</td>
                      <td style={tdStyle}>{badge(item.toggled)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button onClick={() => startEditIngredient(item)} style={{ ...smallBtn, background: '#3b82f6', color: '#fff' }}>Edit</button>
                          {confirmDelete === item.key ? (
                            <>
                              <button onClick={() => handleDelete(item.key)} style={{ ...smallBtn, background: '#ef4444', color: '#fff' }}>Confirm</button>
                              <button onClick={() => setConfirmDelete(null)} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setConfirmDelete(item.key)} style={{ ...smallBtn, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>Delete</button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {ingredients.length === 0 && (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>No ingredients yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Materials table */}
      {activeTab === 'materials' && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--border-card)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                <th style={thStyle}>Icon</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Tier</th>
                <th style={thStyle}>Shells</th>
                <th style={thStyle}>Per</th>
                <th style={thStyle}>Highlight</th>
                <th style={thStyle}>Toggled</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {materials.map(item => (
                editingKey === item.key ? (
                  <tr key={item.key} style={{ borderBottom: '1px solid var(--border-card)' }}>
                    <td style={tdStyle} rowSpan={1}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <img src={iconUrl('mats', item.key)} alt={item.name} width={32} height={32} style={{ imageRendering: 'pixelated' }} />
                        <input type="file" accept="image/png" onChange={e => setEditFile(e.target.files?.[0] ?? null)} style={{ ...inputStyle, width: '140px', padding: '0.2rem', fontSize: '0.7rem' }} />
                      </div>
                    </td>
                    <td style={tdStyle}>{item.name}</td>
                    <td colSpan={5} style={tdStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {(['t1', 't2', 't3'] as const).map(tier => (
                          <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                            <span style={{ width: '30px', fontWeight: '600', color: tier === 't1' ? '#fff' : tier === 't2' ? '#ffe164' : '#ff9632' }}>T{tier[1]}</span>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Shells</label>
                            <input type="number" min={0} value={editValues[`${tier}_shells`]} onChange={e => setEditValues({ ...editValues, [`${tier}_shells`]: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, width: '55px' }} />
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Per</label>
                            <input type="number" min={1} value={editValues[`${tier}_per`]} onChange={e => setEditValues({ ...editValues, [`${tier}_per`]: parseInt(e.target.value) || 1 })} style={{ ...inputStyle, width: '55px' }} />
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>HL</label>
                            <input type="checkbox" checked={editValues[`${tier}_highlight`]} onChange={e => setEditValues({ ...editValues, [`${tier}_highlight`]: e.target.checked })} />
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>On</label>
                            <input type="checkbox" checked={editValues[`${tier}_toggled`]} onChange={e => setEditValues({ ...editValues, [`${tier}_toggled`]: e.target.checked })} />
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button onClick={handleSave} disabled={saving} style={{ ...smallBtn, background: '#22c55e', color: '#fff' }}>{saving ? '...' : 'Save'}</button>
                          <button onClick={() => setEditingKey(null)} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  (['t1', 't2', 't3'] as const).map((tier, i) => (
                    <tr key={`${item.key}-${tier}`} style={{ borderBottom: tier === 't3' ? '1px solid var(--border-card)' : undefined }}>
                      {i === 0 && (
                        <>
                          <td style={tdStyle} rowSpan={3}>
                            <img src={iconUrl('mats', item.key)} alt={item.name} width={32} height={32} style={{ imageRendering: 'pixelated' }} />
                          </td>
                          <td style={tdStyle} rowSpan={3}>{item.name}</td>
                        </>
                      )}
                      <td style={{ ...tdStyle, fontWeight: '600', color: tier === 't1' ? '#fff' : tier === 't2' ? '#ffe164' : '#ff9632' }}>T{tier[1]}</td>
                      <td style={tdStyle}>{item.tiers[tier].shells}</td>
                      <td style={tdStyle}>{item.tiers[tier].per}</td>
                      <td style={tdStyle}>{badge(item.tiers[tier].highlight)}</td>
                      <td style={tdStyle}>{badge(item.tiers[tier].toggled)}</td>
                      {i === 0 && (
                        <td style={tdStyle} rowSpan={3}>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button onClick={() => startEditMaterial(item)} style={{ ...smallBtn, background: '#3b82f6', color: '#fff' }}>Edit</button>
                            {confirmDelete === item.key ? (
                              <>
                                <button onClick={() => handleDelete(item.key)} style={{ ...smallBtn, background: '#ef4444', color: '#fff' }}>Confirm</button>
                                <button onClick={() => setConfirmDelete(null)} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                              </>
                            ) : (
                              <button onClick={() => setConfirmDelete(item.key)} style={{ ...smallBtn, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>Delete</button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )
              ))}
              {materials.length === 0 && (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>No materials yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
