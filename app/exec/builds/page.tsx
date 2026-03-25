"use client";

import { useState, useMemo, useRef, useEffect } from 'react';
import { useExecBuilds } from '@/hooks/useExecBuilds';
import { RANK_HIERARCHY, getRankColor } from '@/lib/rank-constants';
import { BUILD_ROLE_OPTIONS, ROLE_COLORS, type BuildDefinition, type BuildRole } from '@/lib/build-constants';

const FLAG_COLORS = {
  frequent_sniper: '#f59e0b',
  alt: '#a855f7',
} as const;

// ── Shared styles ──────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.32rem', padding: '0.425rem 0.64rem',
  color: 'var(--text-primary)', fontSize: '0.74rem', outline: 'none',
};
const btnStyle: React.CSSProperties = {
  padding: '0.32rem 0.64rem', borderRadius: '0.32rem', border: 'none',
  cursor: 'pointer', fontSize: '0.68rem', fontWeight: '600', transition: 'opacity 0.15s',
};

// ── Name renderer with split-color for dual flags ──────────────
function MemberName({ ign, flags }: { ign: string; flags: string[] }) {
  const isSniper = flags.includes('frequent_sniper');
  const isAlt = flags.includes('alt');

  if (isSniper && isAlt) {
    // Split: first half amber, second half purple
    const mid = Math.ceil(ign.length / 2);
    return (
      <span style={{ fontWeight: '600' }}>
        <span style={{ color: FLAG_COLORS.frequent_sniper }}>{ign.slice(0, mid)}</span>
        <span style={{ color: FLAG_COLORS.alt }}>{ign.slice(mid)}</span>
      </span>
    );
  }

  const color = isSniper
    ? FLAG_COLORS.frequent_sniper
    : isAlt
      ? FLAG_COLORS.alt
      : 'var(--text-primary)';

  return <span style={{ color, fontWeight: '600' }}>{ign}</span>;
}

// ── Build definition form (add / edit) ──────────────────────────
function BuildDefForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: BuildDefinition;
  onSubmit: (data: { key: string; name: string; role: string; color: string; connsUrl: string; hqUrl: string }) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [key, setKey] = useState(initial?.key ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState<BuildRole>(initial?.role ?? 'DPS');
  const [color, setColor] = useState(initial?.color ?? ROLE_COLORS.DPS);
  const [connsUrl, setConnsUrl] = useState(initial?.connsUrl ?? '#');
  const [hqUrl, setHqUrl] = useState(initial?.hqUrl ?? '#');

  // Default color when role changes (only for new builds)
  useEffect(() => {
    if (!initial) setColor(ROLE_COLORS[role]);
  }, [role, initial]);

  const isEdit = !!initial;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.425rem' }}>
      {!isEdit && (
        <div>
          <label style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Key (unique ID)</label>
          <input
            value={key}
            onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            style={{ ...inputStyle, width: '100%' }}
            placeholder="e.g. divzer"
            maxLength={32}
          />
        </div>
      )}
      <div>
        <label style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Display Name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, width: '100%' }} placeholder="e.g. Divzer DPS" />
      </div>
      <div style={{ display: 'flex', gap: '0.425rem' }}>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <label style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Role</label>
          <select value={role} onChange={e => setRole(e.target.value as BuildRole)} style={{ ...inputStyle, width: '100%' }}>
            {BUILD_ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ flexShrink: 0 }}>
          <label style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Color</label>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            style={{ display: 'block', width: '36px', height: '30px', border: '1px solid var(--border-card)', borderRadius: '0.32rem', background: 'none', cursor: 'pointer', padding: '2px' }}
          />
        </div>
      </div>
      <div>
        <label style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Conns Build Link</label>
        <input value={connsUrl} onChange={e => setConnsUrl(e.target.value)} style={{ ...inputStyle, width: '100%' }} placeholder="https://..." />
      </div>
      <div>
        <label style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>HQ Build Link</label>
        <input value={hqUrl} onChange={e => setHqUrl(e.target.value)} style={{ ...inputStyle, width: '100%' }} placeholder="https://..." />
      </div>
      <div style={{ display: 'flex', gap: '0.32rem', marginTop: '0.32rem' }}>
        <button
          onClick={() => onSubmit({ key: isEdit ? initial.key : key, name, role, color, connsUrl, hqUrl })}
          disabled={!name.trim() || (!isEdit && !key.trim())}
          style={{
            ...btnStyle, flex: 1,
            background: !name.trim() || (!isEdit && !key.trim()) ? '#6b7280' : '#22c55e',
            color: '#fff',
            cursor: !name.trim() || (!isEdit && !key.trim()) ? 'not-allowed' : 'pointer',
          }}
        >
          {submitLabel}
        </button>
        <button onClick={onCancel} style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────
export default function ExecBuildsPage() {
  const {
    members, allGuildMembers, buildDefinitions, lastUpdated, loading, error, refresh,
    assignBuild, removeBuild, toggleFlag,
    createBuildDefinition, updateBuildDefinition, deleteBuildDefinition,
  } = useExecBuilds();

  const [rankFilter, setRankFilter] = useState<string | null>(null);
  const [addDropdownUuid, setAddDropdownUuid] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ uuid: string; x: number; y: number } | null>(null);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);

  // Sidebar state
  const [showAddBuild, setShowAddBuild] = useState(false);
  const [editingBuild, setEditingBuild] = useState<BuildDefinition | null>(null);
  const [deletingBuild, setDeletingBuild] = useState<string | null>(null);
  const [defError, setDefError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const addMemberRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAddDropdownUuid(null);
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
      if (addMemberRef.current && !addMemberRef.current.contains(e.target as Node)) {
        setShowAddMember(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Build definitions indexed by key
  const buildDefMap = useMemo(() => {
    const map: Record<string, BuildDefinition> = {};
    for (const def of buildDefinitions) map[def.key] = def;
    return map;
  }, [buildDefinitions]);

  // Group definitions by role
  const defsByRole = useMemo(() => {
    const groups: Record<string, BuildDefinition[]> = { DPS: [], HEALER: [], TANK: [] };
    for (const def of buildDefinitions) {
      if (!groups[def.role]) groups[def.role] = [];
      groups[def.role].push(def);
    }
    return groups;
  }, [buildDefinitions]);

  // Unique ranks present for filter buttons
  const memberRanks = useMemo(() => {
    const ranks = new Set(members.map(m => m.discordRank).filter(Boolean) as string[]);
    return RANK_HIERARCHY.filter(r => ranks.has(r));
  }, [members]);

  // Filter tracked members
  const filteredMembers = useMemo(() => {
    let list = members;
    if (rankFilter) {
      list = list.filter(m => m.discordRank === rankFilter);
    }
    return list;
  }, [members, rankFilter]);

  // Filter guild members for add-member dropdown
  const addMemberResults = useMemo(() => {
    if (!addMemberSearch || addMemberSearch.length < 2) return [];
    const lower = addMemberSearch.toLowerCase();
    return allGuildMembers
      .filter(m => m.ign.toLowerCase().includes(lower))
      .slice(0, 10);
  }, [allGuildMembers, addMemberSearch]);

  const handleContextMenu = (e: React.MouseEvent, uuid: string) => {
    e.preventDefault();
    setContextMenu({ uuid, x: e.clientX, y: e.clientY });
  };

  const handleAddMember = async (uuid: string, buildKey: string) => {
    await assignBuild(uuid, buildKey);
    setShowAddMember(false);
    setAddMemberSearch('');
  };

  const handleCreateBuild = async (data: { key: string; name: string; role: string; color: string; connsUrl: string; hqUrl: string }) => {
    setDefError(null);
    try {
      await createBuildDefinition(data);
      setShowAddBuild(false);
    } catch (e: any) {
      setDefError(e.message);
    }
  };

  const handleUpdateBuild = async (data: { key: string; name: string; role: string; color: string; connsUrl: string; hqUrl: string }) => {
    setDefError(null);
    try {
      await updateBuildDefinition(data);
      setEditingBuild(null);
    } catch (e: any) {
      setDefError(e.message);
    }
  };

  const handleDeleteBuild = async (key: string) => {
    setDefError(null);
    try {
      await deleteBuildDefinition(key);
      setDeletingBuild(null);
    } catch (e: any) {
      setDefError(e.message);
    }
  };

  if (loading && members.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '1.7rem' }}>War Builds</h1>
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.64rem', border: '1px solid var(--border-card)', height: '340px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error && members.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '1.7rem' }}>War Builds</h1>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.425rem', padding: '0.85rem', color: '#ef4444' }}>
          Failed to load data: {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.28rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>War Builds</h1>
        </div>
        <button onClick={refresh} style={{ ...btnStyle, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>
          Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', height: 'calc(100vh - 11.9rem)', minHeight: '425px' }}>
        {/* ── Left panel: Member table ── */}
        <div style={{ flex: '5 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Controls */}
          <div style={{ background: 'var(--bg-card-solid)', borderRadius: '0.64rem', border: '1px solid var(--border-card)', padding: '0.85rem', marginBottom: '0.64rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '0.425rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => setRankFilter(null)}
                style={{ ...btnStyle, background: !rankFilter ? 'var(--color-ocean-400)' : 'var(--bg-primary)', color: !rankFilter ? '#fff' : 'var(--text-secondary)' }}
              >
                All
              </button>
              {memberRanks.map(rank => (
                <button
                  key={rank}
                  onClick={() => setRankFilter(rankFilter === rank ? null : rank)}
                  style={{
                    ...btnStyle,
                    background: rankFilter === rank ? getRankColor(rank) : 'var(--bg-primary)',
                    color: rankFilter === rank ? '#fff' : getRankColor(rank),
                    border: `1px solid ${rankFilter === rank ? 'transparent' : getRankColor(rank)}40`,
                  }}
                >
                  {rank}
                </button>
              ))}

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Add Member */}
              <div style={{ position: 'relative' }} ref={addMemberRef}>
                <button
                  onClick={() => { setShowAddMember(!showAddMember); setAddMemberSearch(''); }}
                  style={{ ...btnStyle, background: '#22c55e', color: '#fff', whiteSpace: 'nowrap' }}
                >
                  + Add Member
                </button>

                {showAddMember && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '0.32rem',
                    background: 'var(--bg-card-solid)',
                    border: '1px solid var(--border-card)',
                    borderRadius: '0.425rem',
                    padding: '0.53rem',
                    zIndex: 20,
                    width: '320px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                  }}>
                    <input
                      autoFocus
                      value={addMemberSearch}
                      onChange={e => setAddMemberSearch(e.target.value)}
                      style={{ ...inputStyle, width: '100%', marginBottom: '0.32rem' }}
                      placeholder="Search guild members..."
                    />
                    <div className="themed-scrollbar" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {addMemberSearch.length < 2 && (
                        <div style={{ fontSize: '0.64rem', color: 'var(--text-secondary)', padding: '0.32rem', fontStyle: 'italic' }}>
                          Type at least 2 characters...
                        </div>
                      )}
                      {addMemberSearch.length >= 2 && addMemberResults.length === 0 && (
                        <div style={{ fontSize: '0.64rem', color: 'var(--text-secondary)', padding: '0.32rem', fontStyle: 'italic' }}>
                          No untracked members found
                        </div>
                      )}
                      {addMemberResults.map(m => (
                        <div key={m.uuid} style={{
                          padding: '0.32rem 0.425rem',
                          borderRadius: '0.21rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.425rem',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.425rem', minWidth: 0 }}>
                            {m.discordRank && (
                              <span style={{
                                display: 'inline-block',
                                padding: '0.08rem 0.32rem',
                                borderRadius: '0.17rem',
                                fontSize: '0.58rem',
                                fontWeight: '700',
                                color: '#fff',
                                background: getRankColor(m.discordRank),
                                flexShrink: 0,
                              }}>
                                {m.discordRank}
                              </span>
                            )}
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-primary)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.ign}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.21rem', flexShrink: 0 }}>
                            {buildDefinitions.map(def => (
                              <button
                                key={def.key}
                                onClick={() => handleAddMember(m.uuid, def.key)}
                                title={`Add with ${def.name}`}
                                style={{
                                  ...btnStyle,
                                  padding: '0.1rem 0.32rem',
                                  fontSize: '0.58rem',
                                  background: `${def.color}1a`,
                                  color: def.color,
                                }}
                              >
                                {def.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Member table */}
          <style>{`.builds-row:hover { background: rgba(255, 255, 255, 0.06) !important; }`}</style>
          <div style={{ background: 'var(--bg-card-solid)', borderRadius: '0.64rem', border: '1px solid var(--border-card)', overflow: 'hidden', flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="themed-scrollbar" style={{ overflowY: 'auto', flex: '1 1 auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-card-solid)' }}>
                  <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                    <th style={{ padding: '0.425rem 0.64rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', whiteSpace: 'nowrap', width: '1%' }}>
                      Rank
                    </th>
                    <th style={{ padding: '0.425rem 0.64rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      IGN
                    </th>
                    <th style={{ padding: '0.425rem 0.64rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Builds
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 && (
                    <tr><td colSpan={3} style={{ padding: '1.7rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      {members.length === 0 ? 'No members tracked yet. Use "+ Add Member" to get started.' : 'No members match filters'}
                    </td></tr>
                  )}
                  {filteredMembers.map((member, idx) => {
                    const isOdd = idx % 2 === 1;
                    const missingBuilds = buildDefinitions.filter(d => !member.builds.includes(d.key));

                    return (
                      <tr
                        key={member.uuid}
                        className="builds-row"
                        onContextMenu={e => handleContextMenu(e, member.uuid)}
                        style={{
                          borderBottom: '1px solid var(--border-card)',
                          background: isOdd ? 'rgba(255, 255, 255, 0.025)' : 'transparent',
                          transition: 'background 0.1s',
                        }}
                      >
                        {/* Rank */}
                        <td style={{ padding: '0.425rem 0.64rem', whiteSpace: 'nowrap' }}>
                          {member.discordRank && (
                            <span style={{
                              display: 'inline-block',
                              padding: '0.12rem 0.425rem',
                              borderRadius: '0.21rem',
                              fontSize: '0.64rem',
                              fontWeight: '700',
                              color: '#fff',
                              background: getRankColor(member.discordRank),
                            }}>
                              {member.discordRank}
                            </span>
                          )}
                        </td>

                        {/* IGN — color indicates flag */}
                        <td style={{ padding: '0.425rem 0.64rem', fontSize: '0.72rem' }}>
                          <MemberName ign={member.ign} flags={member.flags} />
                        </td>

                        {/* Builds */}
                        <td style={{ padding: '0.425rem 0.64rem' }}>
                          <div style={{ display: 'flex', gap: '0.32rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            {member.builds.map(buildKey => {
                              const def = buildDefMap[buildKey];
                              if (!def) return null;
                              return (
                                <span
                                  key={buildKey}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.21rem',
                                    padding: '0.15rem 0.425rem',
                                    borderRadius: '9999px',
                                    fontSize: '0.68rem',
                                    fontWeight: '600',
                                    color: def.color,
                                    background: `${def.color}1a`,
                                  }}
                                >
                                  {def.name}
                                  <span
                                    onClick={() => removeBuild(member.uuid, buildKey)}
                                    style={{
                                      fontSize: '0.62rem',
                                      opacity: 0.5,
                                      marginLeft: '0.1rem',
                                      cursor: 'pointer',
                                      lineHeight: 1,
                                    }}
                                    title={`Remove ${def.name}`}
                                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                                  >
                                    &times;
                                  </span>
                                </span>
                              );
                            })}

                            {/* Add build button */}
                            {missingBuilds.length > 0 && (
                              <div style={{ position: 'relative' }}>
                                <button
                                  onClick={() => setAddDropdownUuid(addDropdownUuid === member.uuid ? null : member.uuid)}
                                  style={{
                                    ...btnStyle,
                                    padding: '0.1rem 0.34rem',
                                    fontSize: '0.68rem',
                                    background: 'var(--bg-primary)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-card)',
                                    lineHeight: 1,
                                  }}
                                  title="Add build"
                                >
                                  +
                                </button>

                                {addDropdownUuid === member.uuid && (
                                  <div
                                    ref={dropdownRef}
                                    style={{
                                      position: 'absolute',
                                      top: '100%',
                                      left: 0,
                                      marginTop: '0.21rem',
                                      background: 'var(--bg-card-solid)',
                                      border: '1px solid var(--border-card)',
                                      borderRadius: '0.425rem',
                                      padding: '0.32rem',
                                      zIndex: 10,
                                      minWidth: '120px',
                                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                                    }}
                                  >
                                    {missingBuilds.map(def => (
                                      <button
                                        key={def.key}
                                        onClick={() => {
                                          assignBuild(member.uuid, def.key);
                                          setAddDropdownUuid(null);
                                        }}
                                        style={{
                                          display: 'block',
                                          width: '100%',
                                          textAlign: 'left',
                                          padding: '0.32rem 0.425rem',
                                          borderRadius: '0.21rem',
                                          border: 'none',
                                          background: 'transparent',
                                          color: def.color,
                                          fontSize: '0.68rem',
                                          fontWeight: '600',
                                          cursor: 'pointer',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = `${def.color}1a`)}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                      >
                                        {def.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Right sidebar: HQ Builds ── */}
        <div className="themed-scrollbar" style={{ flex: '1.5 1 0', minWidth: '220px', position: 'sticky', top: '2rem', alignSelf: 'flex-start', maxHeight: 'calc(100vh - 11.9rem)', overflowY: 'auto' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '0.64rem', border: '1px solid var(--border-card)', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{
                fontSize: '1rem',
                fontWeight: '800',
                color: 'var(--text-primary)',
                margin: 0,
                padding: '0.32rem 0.64rem',
                background: 'rgba(34, 197, 94, 0.12)',
                borderRadius: '0.32rem',
              }}>
                HQ Builds:
              </h2>
              <button
                onClick={() => { setShowAddBuild(!showAddBuild); setEditingBuild(null); setDefError(null); }}
                style={{ ...btnStyle, background: '#22c55e', color: '#fff', fontSize: '0.62rem' }}
                title="Add new build"
              >
                + New
              </button>
            </div>

            {defError && (
              <div style={{ fontSize: '0.64rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.32rem 0.425rem', borderRadius: '0.21rem', marginBottom: '0.64rem' }}>
                {defError}
              </div>
            )}

            {/* Add build form */}
            {showAddBuild && (
              <div style={{ marginBottom: '1rem', padding: '0.64rem', background: 'var(--bg-primary)', borderRadius: '0.425rem', border: '1px solid var(--border-card)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.425rem' }}>New Build</div>
                <BuildDefForm
                  onSubmit={handleCreateBuild}
                  onCancel={() => { setShowAddBuild(false); setDefError(null); }}
                  submitLabel="Create Build"
                />
              </div>
            )}

            {/* Build definitions grouped by role */}
            {BUILD_ROLE_OPTIONS.map(role => {
              const defs = defsByRole[role];
              if (!defs || defs.length === 0) return null;
              return (
                <div key={role} style={{ marginBottom: '1.28rem' }}>
                  {/* Role header */}
                  <div style={{
                    fontSize: '0.78rem',
                    fontWeight: '800',
                    color: ROLE_COLORS[role],
                    textTransform: 'uppercase',
                    borderLeft: `3px solid ${ROLE_COLORS[role]}`,
                    paddingLeft: '0.53rem',
                    marginBottom: '0.53rem',
                  }}>
                    {role}
                  </div>

                  {defs.map(def => (
                    <div key={def.key} style={{ paddingLeft: '0.85rem', marginBottom: '0.64rem' }}>
                      {editingBuild?.key === def.key ? (
                        /* Edit form inline */
                        <div style={{ padding: '0.53rem', background: 'var(--bg-primary)', borderRadius: '0.425rem', border: '1px solid var(--border-card)' }}>
                          <BuildDefForm
                            initial={def}
                            onSubmit={handleUpdateBuild}
                            onCancel={() => { setEditingBuild(null); setDefError(null); }}
                            submitLabel="Save"
                          />
                        </div>
                      ) : deletingBuild === def.key ? (
                        /* Delete confirmation */
                        <div style={{ padding: '0.53rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '0.425rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                          <div style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: '600', marginBottom: '0.32rem' }}>
                            Delete &quot;{def.name}&quot;?
                          </div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginBottom: '0.425rem' }}>
                            This will remove this build from all members. This cannot be undone.
                          </div>
                          <div style={{ display: 'flex', gap: '0.32rem' }}>
                            <button
                              onClick={() => handleDeleteBuild(def.key)}
                              style={{ ...btnStyle, background: '#ef4444', color: '#fff', fontSize: '0.62rem' }}
                            >
                              Yes, Delete
                            </button>
                            <button
                              onClick={() => { setDeletingBuild(null); setDefError(null); }}
                              style={{ ...btnStyle, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)', fontSize: '0.62rem' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Normal display */
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.32rem' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                              {def.name}
                            </div>
                            <div style={{ display: 'flex', gap: '0.21rem' }}>
                              <button
                                onClick={() => { setEditingBuild(def); setDeletingBuild(null); setShowAddBuild(false); setDefError(null); }}
                                title="Edit"
                                style={{ ...btnStyle, padding: '0.1rem 0.32rem', fontSize: '0.58rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-ocean-400)' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => { setDeletingBuild(def.key); setEditingBuild(null); setShowAddBuild(false); setDefError(null); }}
                                title="Delete"
                                style={{ ...btnStyle, padding: '0.1rem 0.32rem', fontSize: '0.58rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                              >
                                Del
                              </button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.425rem' }}>
                            <a
                              href={def.connsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                ...btnStyle,
                                padding: '0.21rem 0.53rem',
                                fontSize: '0.64rem',
                                color: 'var(--color-ocean-400)',
                                background: 'rgba(59, 130, 246, 0.1)',
                                textDecoration: 'none',
                              }}
                            >
                              Conns
                            </a>
                            <a
                              href={def.hqUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                ...btnStyle,
                                padding: '0.21rem 0.53rem',
                                fontSize: '0.64rem',
                                color: 'var(--color-ocean-400)',
                                background: 'rgba(59, 130, 246, 0.1)',
                                textDecoration: 'none',
                              }}
                            >
                              HQ
                            </a>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '0.64rem',
            border: '1px solid var(--border-card)',
            padding: '0.85rem',
            marginTop: '0.64rem',
          }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '0.32rem' }}>
              <span style={{ color: FLAG_COLORS.frequent_sniper, fontWeight: '600' }}>&#9632; Amber</span> = Frequent sniper
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '0.32rem' }}>
              <span style={{ color: FLAG_COLORS.alt, fontWeight: '600' }}>&#9632; Purple</span> = Alt
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: '600' }}>
                <span style={{ color: FLAG_COLORS.frequent_sniper }}>&#9632;</span>
                <span style={{ color: FLAG_COLORS.alt }}>&#9632;</span>
              </span> Split = Both
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: '0.425rem', borderTop: '1px solid var(--border-card)', paddingTop: '0.425rem' }}>
              Right-click a member to toggle flags
            </div>
          </div>

          {lastUpdated && (
            <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: '0.53rem', textAlign: 'center' }}>
              Builds Last Updated {new Date(lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </div>
          )}
        </div>
      </div>

      {/* Context menu for flags */}
      {contextMenu && (() => {
        const member = members.find(m => m.uuid === contextMenu.uuid);
        if (!member) return null;
        const hasSniper = member.flags.includes('frequent_sniper');
        const hasAlt = member.flags.includes('alt');

        return (
          <div
            ref={contextMenuRef}
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              background: 'var(--bg-card-solid)',
              border: '1px solid var(--border-card)',
              borderRadius: '0.425rem',
              padding: '0.32rem',
              zIndex: 1000,
              minWidth: '160px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{ fontSize: '0.64rem', color: 'var(--text-secondary)', padding: '0.21rem 0.425rem', marginBottom: '0.21rem' }}>
              {member.ign}
            </div>
            <button
              onClick={() => {
                toggleFlag(member.uuid, 'frequent_sniper', hasSniper ? 'remove' : 'add');
                setContextMenu(null);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.32rem 0.425rem',
                borderRadius: '0.21rem',
                border: 'none',
                background: 'transparent',
                color: hasSniper ? FLAG_COLORS.frequent_sniper : 'var(--text-primary)',
                fontSize: '0.68rem',
                cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {hasSniper ? '\u2713 ' : ''}Frequent Sniper
            </button>
            <button
              onClick={() => {
                toggleFlag(member.uuid, 'alt', hasAlt ? 'remove' : 'add');
                setContextMenu(null);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.32rem 0.425rem',
                borderRadius: '0.21rem',
                border: 'none',
                background: 'transparent',
                color: hasAlt ? FLAG_COLORS.alt : 'var(--text-primary)',
                fontSize: '0.68rem',
                cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {hasAlt ? '\u2713 ' : ''}Alt
            </button>
          </div>
        );
      })()}
    </div>
  );
}
