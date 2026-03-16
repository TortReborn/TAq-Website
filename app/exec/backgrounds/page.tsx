"use client";

import { useState, useMemo, useCallback } from 'react';
import { useExecBackgrounds, Background, UserCustomization } from '@/hooks/useExecBackgrounds';
import { getRankColor } from '@/lib/rank-constants';

type Tab = 'manage' | 'users' | 'audit';

const TABS: { key: Tab; label: string }[] = [
  { key: 'manage', label: 'Manage Backgrounds' },
  { key: 'users', label: 'User Management' },
  { key: 'audit', label: 'Audit Log' },
];

export default function ExecBackgroundsPage() {
  const {
    backgrounds, members, discordLinks, auditLog,
    loading, error, refresh,
    uploadBackground, editBackground, unlockBackground, setBackground, setGradient, fetchUserCustomization,
  } = useExecBackgrounds();

  const [activeTab, setActiveTab] = useState<Tab>('manage');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadPrice, setUploadPrice] = useState('0');
  const [uploadPublic, setUploadPublic] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editVals, setEditVals] = useState<Partial<Omit<Background, 'id'>>>({});

  // User management state
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [userCustomization, setUserCustomization] = useState<UserCustomization | null>(null);
  const [userLoading, setUserLoading] = useState(false);

  // User action state
  const [unlockBgId, setUnlockBgId] = useState('');
  const [setBgId, setSetBgId] = useState('');
  const [gradTop, setGradTop] = useState('#000000');
  const [gradBottom, setGradBottom] = useState('#000000');

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

  const badge = (on: boolean) => (
    <span style={{
      fontSize: '0.7rem', fontWeight: '600', padding: '0.15rem 0.4rem', borderRadius: '0.2rem',
      background: on ? 'rgba(34, 197, 94, 0.15)' : 'rgba(107, 114, 128, 0.15)',
      color: on ? '#22c55e' : '#6b7280',
    }}>
      {on ? 'Yes' : 'No'}
    </span>
  );

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
    const mem = members.find((m: { uuid: string }) => m.uuid === selectedUuid);
    return {
      ign: mem?.name || link.ign,
      uuid: selectedUuid,
      discordId: link.discordId,
      rank: link.rank,
    };
  }, [selectedUuid, discordLinks, members]);

  // Load user customization when member selected
  const loadUserCustomization = useCallback(async (discordId: string) => {
    setUserLoading(true);
    try {
      const cust = await fetchUserCustomization(discordId);
      setUserCustomization(cust);
    } catch (e: any) {
      setActionError(e.message);
      setUserCustomization(null);
    }
    setUserLoading(false);
  }, [fetchUserCustomization]);

  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim()) return;
    clearFeedback();
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', uploadFile);
      formData.append('name', uploadName.trim());
      formData.append('description', uploadDesc.trim());
      formData.append('price', uploadPrice);
      formData.append('public', String(uploadPublic));
      const { id } = await uploadBackground(formData);
      setActionSuccess(`Uploaded "${uploadName.trim()}" (ID: ${id})`);
      setShowUpload(false);
      setUploadFile(null);
      setUploadName('');
      setUploadDesc('');
      setUploadPrice('0');
      setUploadPublic(true);
    } catch (e: any) {
      setActionError(e.message);
    }
    setUploading(false);
  };

  const handleEdit = async (id: number) => {
    clearFeedback();
    try {
      await editBackground(id, editVals);
      setActionSuccess(`Updated background ${id}`);
      setEditingId(null);
      setEditVals({});
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleUnlock = async () => {
    if (!selectedMember || !unlockBgId) return;
    clearFeedback();
    try {
      await unlockBackground(selectedMember.discordId, parseInt(unlockBgId));
      setActionSuccess(`Unlocked background ${unlockBgId} for ${selectedMember.ign}`);
      setUnlockBgId('');
      loadUserCustomization(selectedMember.discordId);
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleSetBg = async () => {
    if (!selectedMember || !setBgId) return;
    clearFeedback();
    try {
      await setBackground(selectedMember.discordId, parseInt(setBgId));
      setActionSuccess(`Set background ${setBgId} for ${selectedMember.ign}`);
      setSetBgId('');
      loadUserCustomization(selectedMember.discordId);
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleSetGradient = async () => {
    if (!selectedMember) return;
    clearFeedback();
    try {
      await setGradient(selectedMember.discordId, gradTop, gradBottom);
      setActionSuccess(`Set gradient for ${selectedMember.ign}`);
      loadUserCustomization(selectedMember.discordId);
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  if (loading && backgrounds.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>Backgrounds</h1>
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', height: '400px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && backgrounds.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>Backgrounds</h1>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '1rem', color: '#ef4444' }}>
          Failed to load background data: {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>Backgrounds</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            Manage profile backgrounds, user assignments, and gradients
          </p>
        </div>
        <button onClick={refresh} style={{ ...btnStyle, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>
          Refresh
        </button>
      </div>

      {/* Feedback */}
      {actionError && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}>&times;</button>
        </div>
      )}
      {actionSuccess && (
        <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#22c55e', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: '1rem' }}>&times;</button>
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

      {/* ═══ Manage Backgrounds Tab ═══ */}
      {activeTab === 'manage' && (
        <div>
          {/* Upload button / form */}
          <div style={{ marginBottom: '1rem' }}>
            {!showUpload ? (
              <button onClick={() => setShowUpload(true)} style={{ ...btnStyle, background: '#22c55e', color: '#fff' }}>
                Upload New Background
              </button>
            ) : (
              <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1.25rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>Upload New Background</h3>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <label style={labelStyle}>Image (PNG, 800x526)</label>
                    <input
                      type="file"
                      accept="image/png"
                      onChange={e => setUploadFile(e.target.files?.[0] || null)}
                      style={{ ...inputStyle, padding: '0.35rem 0.5rem' }}
                    />
                  </div>
                  <div style={{ flex: '1 1 150px' }}>
                    <label style={labelStyle}>Name</label>
                    <input value={uploadName} onChange={e => setUploadName(e.target.value)} style={inputStyle} placeholder="Background name" />
                  </div>
                  <div style={{ flex: '2 1 200px' }}>
                    <label style={labelStyle}>Description</label>
                    <input value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} style={inputStyle} placeholder="Optional description" />
                  </div>
                  <div style={{ width: '80px' }}>
                    <label style={labelStyle}>Price</label>
                    <input value={uploadPrice} onChange={e => setUploadPrice(e.target.value)} style={inputStyle} type="number" min="0" max="9999" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.15rem' }}>
                    <label style={{ ...labelStyle, margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="checkbox"
                        checked={uploadPublic}
                        onChange={e => setUploadPublic(e.target.checked)}
                        style={{ accentColor: '#22c55e' }}
                      />
                      Public
                    </label>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button
                    onClick={handleUpload}
                    disabled={!uploadFile || !uploadName.trim() || uploading}
                    style={{ ...btnStyle, background: '#22c55e', color: '#fff', opacity: (!uploadFile || !uploadName.trim() || uploading) ? 0.5 : 1 }}
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                  <button
                    onClick={() => { setShowUpload(false); setUploadFile(null); setUploadName(''); setUploadDesc(''); setUploadPrice('0'); setUploadPublic(true); }}
                    disabled={uploading}
                    style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Backgrounds table */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-card)' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                All Backgrounds
                <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>({backgrounds.length})</span>
              </h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                  {['Preview', 'ID', 'Name', 'Description', 'Price', 'Public', ''].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {backgrounds.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No backgrounds</td></tr>
                )}
                {backgrounds.map((bg, idx) => (
                  <tr key={bg.id} style={{ borderBottom: '1px solid var(--border-card)', background: idx % 2 === 1 ? 'rgba(255, 255, 255, 0.025)' : 'transparent' }}>
                    <td style={{ ...tdStyle, width: '80px' }}>
                      <img
                        src={`/api/profile-background/${bg.id}`}
                        alt={bg.name}
                        loading="lazy"
                        style={{ width: '72px', height: '47px', objectFit: 'cover', borderRadius: '0.25rem', display: 'block' }}
                      />
                    </td>
                    <td style={{ ...tdStyle, fontWeight: '700', color: 'var(--text-secondary)', width: '3rem' }}>{bg.id}</td>
                    {editingId === bg.id ? (
                      <>
                        <td style={tdStyle}>
                          <input
                            value={editVals.name ?? bg.name}
                            onChange={e => setEditVals({ ...editVals, name: e.target.value })}
                            style={{ ...inputStyle, width: '140px' }}
                          />
                        </td>
                        <td style={tdStyle}>
                          <input
                            value={editVals.description ?? bg.description}
                            onChange={e => setEditVals({ ...editVals, description: e.target.value })}
                            style={{ ...inputStyle, width: '180px' }}
                          />
                        </td>
                        <td style={tdStyle}>
                          <input
                            value={editVals.price ?? bg.price}
                            onChange={e => setEditVals({ ...editVals, price: parseInt(e.target.value) || 0 })}
                            style={{ ...inputStyle, width: '70px' }}
                            type="number"
                          />
                        </td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => setEditVals({ ...editVals, public: !(editVals.public ?? bg.public) })}
                            style={{
                              ...smallBtn,
                              background: (editVals.public ?? bg.public) ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)',
                              color: (editVals.public ?? bg.public) ? '#22c55e' : '#6b7280',
                            }}
                          >
                            {(editVals.public ?? bg.public) ? 'Yes' : 'No'}
                          </button>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => handleEdit(bg.id)} style={{ ...smallBtn, background: '#22c55e', color: '#fff' }}>Save</button>
                            <button onClick={() => { setEditingId(null); setEditVals({}); }} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ ...tdStyle, fontWeight: '500' }}>{bg.name}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bg.description || '—'}</td>
                        <td style={tdStyle}>{bg.price}</td>
                        <td style={tdStyle}>{badge(bg.public)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button
                            onClick={() => { setEditingId(bg.id); setEditVals({}); }}
                            style={{ ...smallBtn, background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}
                          >
                            Edit
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ User Management Tab ═══ */}
      {activeTab === 'users' && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 1rem' }}>User Background Management</h2>

          {/* Member search */}
          <div style={{ marginBottom: '1rem', position: 'relative' }}>
            <label style={labelStyle}>Search Member</label>
            <input
              value={memberSearch}
              onChange={e => { setMemberSearch(e.target.value); setShowDropdown(true); setSelectedUuid(null); setUserCustomization(null); clearFeedback(); }}
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
                        if (link) loadUserCustomization(link.discordId);
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
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Player</span>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{selectedMember.ign}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Rank</span>
                  <div style={{ fontWeight: '600', color: getRankColor(selectedMember.rank) }}>{selectedMember.rank || '—'}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Discord ID</span>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.8rem' }}>{selectedMember.discordId}</div>
                </div>
              </div>

              {userLoading && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>Loading customization...</div>
              )}

              {!userLoading && userCustomization && (
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {/* Active background */}
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Active Background</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <img
                        src={`/api/profile-background/${userCustomization.background}`}
                        alt="Active"
                        style={{ width: '80px', height: '53px', objectFit: 'cover', borderRadius: '0.25rem', border: '2px solid #22c55e' }}
                      />
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '600' }}>
                        ID: {userCustomization.background}
                        {backgrounds.find(b => b.id === userCustomization.background) &&
                          ` (${backgrounds.find(b => b.id === userCustomization.background)!.name})`
                        }
                      </span>
                    </div>
                  </div>

                  {/* Owned backgrounds */}
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Owned Backgrounds</span>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {userCustomization.owned.length === 0 ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>None</span>
                      ) : (
                        userCustomization.owned.map(id => (
                          <div key={id} style={{
                            background: 'var(--bg-card)', border: '1px solid var(--border-card)',
                            borderRadius: '0.25rem', padding: '0.15rem 0.4rem', fontSize: '0.75rem',
                            color: 'var(--text-primary)', fontWeight: '500',
                          }}>
                            {id}
                            {backgrounds.find(b => b.id === id) && ` - ${backgrounds.find(b => b.id === id)!.name}`}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Gradient */}
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Gradient</span>
                    {userCustomization.gradient ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                          width: '40px', height: '24px', borderRadius: '0.25rem',
                          background: `linear-gradient(to bottom, ${userCustomization.gradient[0]}, ${userCustomization.gradient[1]})`,
                          border: '1px solid var(--border-card)',
                        }} />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                          {userCustomization.gradient[0]} / {userCustomization.gradient[1]}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>None</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {selectedMember && !userLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Unlock background */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={labelStyle}>Unlock Background</label>
                  <select
                    value={unlockBgId}
                    onChange={e => setUnlockBgId(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select background...</option>
                    {backgrounds.map(bg => (
                      <option key={bg.id} value={bg.id}>{bg.id} - {bg.name} ({bg.price} shells)</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleUnlock}
                  disabled={!unlockBgId}
                  style={{ ...btnStyle, background: '#3b82f6', color: '#fff', opacity: unlockBgId ? 1 : 0.5 }}
                >
                  Unlock
                </button>
              </div>

              {/* Set active background */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={labelStyle}>Set Active Background</label>
                  <select
                    value={setBgId}
                    onChange={e => setSetBgId(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select background...</option>
                    {backgrounds.map(bg => (
                      <option key={bg.id} value={bg.id}>{bg.id} - {bg.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleSetBg}
                  disabled={!setBgId}
                  style={{ ...btnStyle, background: '#22c55e', color: '#fff', opacity: setBgId ? 1 : 0.5 }}
                >
                  Set Active
                </button>
              </div>

              {/* Set gradient */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={labelStyle}>Top Color</label>
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <input
                      type="color"
                      value={gradTop}
                      onChange={e => setGradTop(e.target.value)}
                      style={{ width: '36px', height: '32px', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                    />
                    <input
                      value={gradTop}
                      onChange={e => setGradTop(e.target.value)}
                      style={{ ...inputStyle, width: '90px' }}
                      placeholder="#000000"
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Bottom Color</label>
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <input
                      type="color"
                      value={gradBottom}
                      onChange={e => setGradBottom(e.target.value)}
                      style={{ width: '36px', height: '32px', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                    />
                    <input
                      value={gradBottom}
                      onChange={e => setGradBottom(e.target.value)}
                      style={{ ...inputStyle, width: '90px' }}
                      placeholder="#000000"
                    />
                  </div>
                </div>
                <div style={{
                  width: '40px', height: '32px', borderRadius: '0.25rem',
                  background: `linear-gradient(to bottom, ${gradTop}, ${gradBottom})`,
                  border: '1px solid var(--border-card)', flexShrink: 0,
                }} />
                <button
                  onClick={handleSetGradient}
                  style={{ ...btnStyle, background: '#8b5cf6', color: '#fff' }}
                >
                  Set Gradient
                </button>
              </div>
            </div>
          )}

          {!selectedMember && selectedUuid === null && memberSearch.trim() === '' && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontStyle: 'italic' }}>Search for a guild member above to manage their backgrounds.</p>
          )}
        </div>
      )}

      {/* ═══ Audit Log Tab ═══ */}
      {activeTab === 'audit' && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-card)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              Recent Background Actions
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
                <tr><td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No recent background actions</td></tr>
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
