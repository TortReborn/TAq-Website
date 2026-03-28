"use client";

import { useState, useMemo, useRef, useEffect } from 'react';
import { useExecSnipeMutations, type SnipeParticipant } from '@/hooks/useExecSnipes';
import { SNIPE_ROLES, ROLE_COLORS, isDry, getDifficultyColor, getMaxConns } from '@/lib/snipe-constants';

interface Props {
  meta: {
    territories: string[];
    routeCounts: Record<string, number>;
    currentSeason: number;
    igns: string[];
    snipedHqs: string[];
    seasonsWithData: number[];
    guildMembers: string[];
  };
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-card-solid)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.5rem 0.75rem',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', width: '100%',
  colorScheme: 'dark',
};

const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none',
  cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', transition: 'opacity 0.15s',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block',
};

export default function SnipeLogForm({ meta }: Props) {
  const { createSnipe } = useExecSnipeMutations();

  const [hq, setHq] = useState('');
  const [hqSearch, setHqSearch] = useState('');
  const [showHqDropdown, setShowHqDropdown] = useState(false);
  const [difficulty, setDifficulty] = useState('');
  const [guildTag, setGuildTag] = useState('');
  const [conns, setConns] = useState('0');
  const [snipedAt, setSnipedAt] = useState('');
  const [season, setSeason] = useState(String(meta.currentSeason));
  const defaultSlots: SnipeParticipant[] = [
    { ign: '', role: 'Tank' },
    { ign: '', role: 'Tank' },
    { ign: '', role: 'DPS' },
    { ign: '', role: 'DPS' },
    { ign: '', role: 'Healer' },
  ];
  const [participants, setParticipants] = useState<SnipeParticipant[]>(defaultSlots);
  const [logToChannel, setLogToChannel] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const hqInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateHqDropdownPos = () => {
    if (hqInputRef.current) {
      const rect = hqInputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
    }
  };

  useEffect(() => {
    if (showHqDropdown) {
      updateHqDropdownPos();
      // Update position on scroll (the main content area scrolls)
      const onScroll = () => updateHqDropdownPos();
      window.addEventListener('scroll', onScroll, true);
      return () => window.removeEventListener('scroll', onScroll, true);
    }
  }, [showHqDropdown, hqSearch]);

  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview); };
  }, [imagePreview]);

  // Global paste handler: if logToChannel is on and no input/textarea/select is focused, treat image pastes as screenshot input
  useEffect(() => {
    if (!logToChannel) return;
    const handler = (e: ClipboardEvent) => {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            setImage(file);
            if (imagePreview) URL.revokeObjectURL(imagePreview);
            setImagePreview(URL.createObjectURL(file));
          }
          e.preventDefault();
          return;
        }
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [logToChannel, imagePreview]);

  const snipedHqSet = useMemo(() => new Set(meta.snipedHqs.map(h => h.toLowerCase())), [meta.snipedHqs]);

  // Only show territories with 4+ connections (HQ-worthy)
  const hqTerritories = useMemo(() =>
    meta.territories.filter(t => (meta.routeCounts[t] || 0) >= 4),
    [meta.territories, meta.routeCounts]
  );

  const filteredTerritories = useMemo(() => {
    const base = hqSearch
      ? hqTerritories.filter(t => t.toLowerCase().includes(hqSearch.toLowerCase()))
      : hqTerritories;
    // Sort: sniped HQs first, then alphabetical
    return base
      .sort((a, b) => {
        const aS = snipedHqSet.has(a.toLowerCase()) ? 0 : 1;
        const bS = snipedHqSet.has(b.toLowerCase()) ? 0 : 1;
        if (aS !== bS) return aS - bS;
        return a.localeCompare(b);
      })
      .slice(0, 25);
  }, [hqSearch, hqTerritories, snipedHqSet]);

  const maxConns = hq ? getMaxConns(hq) : null;
  const drySnipe = hq && conns ? isDry(hq, parseInt(conns, 10)) : false;

  const diffNum = parseInt(difficulty, 10);
  const diffColor = !isNaN(diffNum) && diffNum > 0 ? getDifficultyColor(diffNum) : undefined;

  const guildMemberSet = useMemo(() => new Set(meta.guildMembers.map(m => m.toLowerCase())), [meta.guildMembers]);
  const [ignDropdownIdx, setIgnDropdownIdx] = useState<number | null>(null);
  const ignInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [ignDropdownPos, setIgnDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const getIgnSuggestions = (search: string) => {
    if (!search) return [];
    const lower = search.toLowerCase();
    return meta.guildMembers.filter(m => m.toLowerCase().includes(lower)).slice(0, 10);
  };

  const openIgnDropdown = (idx: number) => {
    setIgnDropdownIdx(idx);
    const el = ignInputRefs.current[idx];
    if (el) {
      const rect = el.getBoundingClientRect();
      setIgnDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
    }
  };

  const updateParticipant = (idx: number, field: 'ign' | 'role', value: string) => {
    const updated = [...participants];
    updated[idx] = { ...updated[idx], [field]: value };
    setParticipants(updated);
    if (field === 'ign') openIgnDropdown(idx);
  };

  const selectIgn = (idx: number, ign: string) => {
    const updated = [...participants];
    updated[idx] = { ...updated[idx], ign };
    setParticipants(updated);
    setIgnDropdownIdx(null);
  };

  const filledParticipants = participants.filter(p => p.ign.trim());
  const filledCount = filledParticipants.length;
  const allFilledValid = filledParticipants.every(p => guildMemberSet.has(p.ign.trim().toLowerCase()));
  const isValid = hq && difficulty && parseInt(difficulty, 10) > 0 && guildTag.trim() && filledCount >= 1 && allFilledValid && (!logToChannel || image !== null);

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await createSnipe({
        hq,
        difficulty: parseInt(difficulty, 10),
        guildTag: guildTag.trim(),
        conns: parseInt(conns, 10),
        snipedAt: snipedAt ? new Date(snipedAt).toISOString() : undefined,
        season: parseInt(season, 10),
        participants: filledParticipants.map(p => ({ ign: p.ign.trim(), role: p.role })),
        logToChannel,
        notes: logToChannel ? notes.trim() || undefined : undefined,
      }, logToChannel ? image ?? undefined : undefined);
      let msg = `Snipe #${result.id} logged successfully!`;
      if (result.warning) msg += ` (${result.warning})`;
      setSuccess(msg);
      setShowConfirm(false);
      // Reset form
      setHq('');
      setHqSearch('');
      setDifficulty('');
      setGuildTag('');
      setConns('0');
      setSnipedAt('');
      setParticipants(defaultSlots.map(s => ({ ...s })));
      setLogToChannel(false);
      setImage(null);
      setImagePreview(null);
      setNotes('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: 0, marginBottom: '1.25rem' }}>Log a Snipe</h2>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '0.75rem', color: '#ef4444', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '0.5rem', padding: '0.75rem', color: '#22c55e', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {success}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {/* HQ */}
        <div>
          <label style={labelStyle}>HQ Territory</label>
          <input
            ref={hqInputRef}
            style={inputStyle}
            value={hq || hqSearch}
            onChange={e => { setHqSearch(e.target.value); setHq(''); setShowHqDropdown(true); }}
            onFocus={() => { setShowHqDropdown(true); updateHqDropdownPos(); }}
            onBlur={() => setTimeout(() => setShowHqDropdown(false), 200)}
            placeholder="Search territory..."
          />
          {showHqDropdown && filteredTerritories.length > 0 && !hq && dropdownPos && (
            <div style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              zIndex: 9999,
              background: 'var(--bg-card-solid)', border: '1px solid var(--border-card)', borderRadius: '0.375rem',
              maxHeight: '450px', overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}>
              {filteredTerritories.map(t => {
                const isSniped = snipedHqSet.has(t.toLowerCase());
                return (
                  <div
                    key={t}
                    style={{
                      padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
                      color: isSniped ? '#f59e0b' : 'var(--text-primary)',
                      fontWeight: isSniped ? '600' : '400',
                      background: 'var(--bg-card-solid)',
                    }}
                    onMouseDown={() => { setHq(t); setHqSearch(''); setShowHqDropdown(false); }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#273548')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card-solid)')}
                  >
                    {t} <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>({meta.routeCounts[t]} routes)</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Difficulty */}
        <div>
          <label style={labelStyle}>Difficulty (thousands)</label>
          <input
            style={{ ...inputStyle, ...(diffColor ? { borderColor: diffColor } : {}) }}
            type="number"
            min="1"
            value={difficulty}
            onChange={e => setDifficulty(e.target.value)}
            placeholder="e.g. 192"
          />
        </div>

        {/* Guild Tag */}
        <div>
          <label style={labelStyle}>Guild Tag</label>
          <input
            style={inputStyle}
            value={guildTag}
            onChange={e => setGuildTag(e.target.value)}
            placeholder="e.g. SEQ"
          />
        </div>

        {/* Connections */}
        <div>
          <label style={labelStyle}>
            Connections (0-6)
            {maxConns != null && <span style={{ color: 'var(--text-secondary)', fontWeight: '400' }}> — max {maxConns}</span>}
            {drySnipe && <span style={{ color: '#f59e0b', fontWeight: '400' }}> — DRY</span>}
          </label>
          <select
            style={inputStyle}
            value={conns}
            onChange={e => setConns(e.target.value)}
          >
            {[0, 1, 2, 3, 4, 5, 6].map(n => (
              <option key={n} value={n} style={{ background: 'var(--bg-card-solid)', color: 'var(--text-primary)' }}>{n}{n === 0 ? ' (zero conn)' : ''}</option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label style={labelStyle}>Date (optional, defaults to now)</label>
          <input
            style={inputStyle}
            type="datetime-local"
            value={snipedAt}
            onChange={e => setSnipedAt(e.target.value)}
          />
        </div>

        {/* Season */}
        <div>
          <label style={labelStyle}>Season</label>
          <input
            style={inputStyle}
            type="number"
            min="1"
            value={season}
            onChange={e => setSeason(e.target.value)}
          />
        </div>
      </div>

      {/* Participants + Review/Submit + Post to Channel side by side */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-end' }}>
        {/* Participants */}
        <div style={{ flex: 'none' }}>
          <label style={{ ...labelStyle, marginBottom: '0.5rem' }}>Participants ({filledCount}/5)</label>
          {participants.map((p, idx) => {
            const ignValid = !p.ign.trim() || guildMemberSet.has(p.ign.trim().toLowerCase());
            return (
            <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: idx < participants.length - 1 ? '0.5rem' : '0', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '14px', textAlign: 'right', flex: 'none' }}>{idx + 1}</span>
              <div style={{ width: '180px', position: 'relative', flex: 'none' }}>
                <input
                  ref={el => { ignInputRefs.current[idx] = el; }}
                  style={{ ...inputStyle, width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.8rem', borderColor: p.ign.trim() && !ignValid ? '#ef4444' : undefined }}
                  value={p.ign}
                  maxLength={16}
                  onChange={e => updateParticipant(idx, 'ign', e.target.value)}
                  onFocus={() => openIgnDropdown(idx)}
                  onBlur={() => setTimeout(() => setIgnDropdownIdx(null), 200)}
                  placeholder="IGN"
                />
                {p.ign.trim() && !ignValid && (
                  <span style={{ fontSize: '0.6rem', color: '#ef4444', position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)' }}>not in guild</span>
                )}
              </div>
              <select
                style={{ ...inputStyle, width: '90px', flex: 'none', padding: '0.4rem 0.4rem', fontSize: '0.8rem' }}
                value={p.role}
                onChange={e => updateParticipant(idx, 'role', e.target.value as any)}
              >
                {SNIPE_ROLES.map(r => (
                  <option key={r} value={r} style={{ background: 'var(--bg-card-solid)', color: 'var(--text-primary)' }}>{r}</option>
                ))}
              </select>
            </div>
            );
          })}
          {ignDropdownIdx !== null && ignDropdownPos && getIgnSuggestions(participants[ignDropdownIdx]?.ign || '').length > 0 && (
            <div style={{
              position: 'fixed',
              top: ignDropdownPos.top,
              left: ignDropdownPos.left,
              width: ignDropdownPos.width,
              zIndex: 9999,
              background: 'var(--bg-card-solid)', border: '1px solid var(--border-card)', borderRadius: '0.375rem',
              maxHeight: '200px', overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}>
              {getIgnSuggestions(participants[ignDropdownIdx]?.ign || '').map(m => (
                <div
                  key={m}
                  style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)', background: 'var(--bg-card-solid)' }}
                  onMouseDown={() => selectIgn(ignDropdownIdx, m)}
                  onMouseEnter={e => (e.currentTarget.style.background = '#273548')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card-solid)')}
                >
                  {m}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Review / Submit */}
        <div style={{ flex: 'none' }}>
          {!showConfirm ? (
            <div>
              <button
                style={{ ...btnStyle, background: isValid ? '#22c55e' : 'var(--border-card)', color: isValid ? '#fff' : 'var(--text-secondary)', cursor: isValid ? 'pointer' : 'not-allowed' }}
                onClick={() => isValid && setShowConfirm(true)}
                disabled={!isValid}
              >
                Review & Submit
              </button>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-primary)', borderRadius: '0.5rem', border: '1px solid var(--border-card)', padding: '0.75rem', width: 'fit-content' }}>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  <div><strong>HQ:</strong> {hq}</div>
                  <div><strong>Diff:</strong> <span style={{ color: diffColor }}>{difficulty}k</span></div>
                  <div><strong>Guild:</strong> [{guildTag.toUpperCase()}]</div>
                  <div><strong>Conns:</strong> {conns}{drySnipe ? ' (DRY)' : ''}</div>
                  <div><strong>Season:</strong> {season}</div>
                  <div><strong>Date:</strong> {snipedAt ? new Date(snipedAt).toLocaleDateString() : 'Now'}</div>
                  {logToChannel && (
                    <div style={{ color: '#f59e0b', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      Will post to snipe log channel{notes.trim() ? ' + notes' : ''}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', lineHeight: '1.5' }}>
                  <div style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Participants</div>
                  {filledParticipants.map((p, i) => (
                    <div key={i} style={{ color: ROLE_COLORS[p.role as keyof typeof ROLE_COLORS] || 'var(--text-primary)' }}>
                      {p.ign} ({p.role})
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  style={{ ...btnStyle, background: '#22c55e', color: '#fff', opacity: submitting ? 0.6 : 1 }}
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : 'Confirm'}
                </button>
                <button
                  style={{ ...btnStyle, background: 'var(--border-card)', color: 'var(--text-primary)' }}
                  onClick={() => setShowConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Post to Channel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          {logToChannel && (
            <div style={{ marginBottom: '0.5rem', padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: '0.5rem', border: '1px solid var(--border-card)', display: 'flex', gap: '0.75rem' }}>
              {/* Screenshot (left) */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={labelStyle}>Screenshot (required)</label>
                <div
                  tabIndex={0}
                  onPaste={e => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (const item of Array.from(items)) {
                      if (item.type.startsWith('image/')) {
                        const file = item.getAsFile();
                        if (file) {
                          setImage(file);
                          if (imagePreview) URL.revokeObjectURL(imagePreview);
                          setImagePreview(URL.createObjectURL(file));
                        }
                        e.preventDefault();
                        return;
                      }
                    }
                  }}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={e => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith('image/')) {
                      setImage(file);
                      if (imagePreview) URL.revokeObjectURL(imagePreview);
                      setImagePreview(URL.createObjectURL(file));
                    }
                  }}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/png,image/jpeg,image/webp';
                    input.onchange = () => {
                      const file = input.files?.[0] || null;
                      setImage(file);
                      if (imagePreview) URL.revokeObjectURL(imagePreview);
                      setImagePreview(file ? URL.createObjectURL(file) : null);
                    };
                    input.click();
                  }}
                  style={{
                    ...inputStyle,
                    height: '132px',
                    padding: '0.5rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    borderStyle: image ? 'solid' : 'dashed',
                    borderColor: image ? '#22c55e' : 'var(--border-card)',
                    outline: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {imagePreview ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={imagePreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '112px', borderRadius: '0.375rem', objectFit: 'contain' }} />
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setImage(null);
                          if (imagePreview) URL.revokeObjectURL(imagePreview);
                          setImagePreview(null);
                        }}
                        style={{
                          position: 'absolute', top: '4px', right: '4px',
                          background: 'rgba(239, 68, 68, 0.85)', color: '#fff',
                          border: 'none', borderRadius: '50%', width: '22px', height: '22px',
                          cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          lineHeight: 1,
                        }}
                        title="Remove screenshot"
                      >
                        X
                      </button>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      Paste, drop, or click to add screenshot
                    </span>
                  )}
                </div>
              </div>
              {/* Notes (right) */}
              <div style={{ width: '180px', flexShrink: 0 }}>
                <label style={labelStyle}>Notes (optional)</label>
                <textarea
                  style={{ ...inputStyle, height: 'calc(100% - 1.25rem)', resize: 'none', minHeight: '3rem' }}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Additional notes for the channel post"
                />
              </div>
            </div>
          )}

          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={logToChannel}
              onChange={e => {
                setLogToChannel(e.target.checked);
                if (e.target.checked) {
                  e.target.blur();
                } else {
                  setImage(null);
                  setImagePreview(null);
                  setNotes('');
                }
              }}
              style={{ accentColor: '#22c55e' }}
            />
            Post to snipe log channel
          </label>
        </div>
      </div>
    </div>
  );
}
