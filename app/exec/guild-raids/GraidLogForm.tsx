"use client";

import { useState, useMemo } from 'react';
import { useExecGraidLogMutations } from '@/hooks/useExecGraidLogs';
import { RAID_TYPE_COLORS } from '@/lib/graid-log-constants';
import { MAX_RAIDS_PER_SUBMISSION } from '@/lib/graid-log-validation';

interface Props {
  meta: { guildMembers: string[] };
  onLogged: () => void;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.5rem 0.75rem',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', width: '100%',
};

const RAID_TYPES = [
  { value: 'NOTG', label: 'Nest of the Grootslangs (NOTG)' },
  { value: 'TCC', label: 'The Canyon Colossus (TCC)' },
  { value: 'TNA', label: 'The Nameless Anomaly (TNA)' },
  { value: 'NOL', label: "Orphion's Nexus of Light (NOL)" },
  { value: 'WTP', label: 'The Wartorn Palace (WTP)' },
  { value: 'Unknown', label: 'Unknown raid type' },
];

function MemberInput({ value, onChange, guildMembers, placeholder, id }: {
  value: string; onChange: (v: string) => void; guildMembers: string[]; placeholder: string; id: string;
}) {
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = useMemo(() => {
    if (!value) return [];
    const lower = value.toLowerCase();
    return guildMembers.filter(m => m.toLowerCase().includes(lower)).slice(0, 15);
  }, [value, guildMembers]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        style={inputStyle}
        value={value}
        onChange={e => { onChange(e.target.value); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        placeholder={placeholder}
        id={id}
      />
      {showDropdown && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
          background: 'var(--bg-card-solid)', border: '1px solid var(--border-card)', borderRadius: '0.375rem',
          maxHeight: '180px', overflowY: 'auto', marginTop: '2px',
        }}>
          {filtered.map(name => (
            <div
              key={name}
              style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}
              onMouseDown={() => { onChange(name); setShowDropdown(false); }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-primary)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GraidLogForm({ meta, onLogged }: Props) {
  const [raidType, setRaidType] = useState('');
  const [groupPlayers, setGroupPlayers] = useState(['', '', '', '']);
  const [raidCount, setRaidCount] = useState('1');
  const [announce, setAnnounce] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { createLogs } = useExecGraidLogMutations();

  const memberSet = useMemo(() => new Set(meta.guildMembers.map(m => m.toLowerCase())), [meta.guildMembers]);

  const setGroupPlayer = (idx: number, value: string) => {
    setGroupPlayers(prev => { const next = [...prev]; next[idx] = value; return next; });
  };

  // Unknown raids are never posted by the bot, so the toggle is forced off.
  const canAnnounce = raidType !== 'Unknown';
  const effectiveAnnounce = canAnnounce && announce;

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (!raidType) { setError('Select a raid type.'); return; }
    // Empty slots are allowed: cross-guild parties only log our own members.
    const filled = groupPlayers.map(p => p.trim()).filter(Boolean);
    if (filled.length === 0) { setError('At least 1 participant is required.'); return; }
    const nonMembers = filled.filter(p => !memberSet.has(p.toLowerCase()));
    if (nonMembers.length > 0) { setError(`Not current guild members: ${nonMembers.join(', ')}`); return; }
    const unique = new Set(filled.map(p => p.toLowerCase()));
    if (unique.size < filled.length) { setError('All participants must be different.'); return; }
    const count = parseInt(raidCount, 10);
    if (!Number.isInteger(count) || count < 1 || count > MAX_RAIDS_PER_SUBMISSION) {
      setError(`Number of raids must be between 1 and ${MAX_RAIDS_PER_SUBMISSION}.`);
      return;
    }

    const raids = Array.from({ length: count }, () => ({
      raidType,
      participants: filled,
      announce: effectiveAnnounce,
    }));

    setSaving(true);
    try {
      const result = await createLogs(raids);
      const n = result.count ?? count;
      const base = effectiveAnnounce
        ? `Queued ${n} raid${n === 1 ? '' : 's'} — the bot will post them to Discord on its next tick (within ~3 min).`
        : `Queued ${n} raid${n === 1 ? '' : 's'} silently — added to totals on the next bot tick (within ~3 min), not posted to Discord.`;
      const unlinked: string[] = result.unlinked ?? [];
      setSuccess(
        unlinked.length > 0
          ? `${base} Note: ${unlinked.join(', ')} ${unlinked.length === 1 ? 'is' : 'are'} not linked to Discord yet — the raid still counts, but double-check the spelling.`
          : base
      );
      setRaidType('');
      setGroupPlayers(['', '', '', '']);
      setRaidCount('1');
      setAnnounce(true);
      onLogged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--bg-card-solid)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1.25rem', maxWidth: '500px' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 1rem 0' }}>Log Guild Raids</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Raid Type</label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: '0.5rem',
          }}>
            {RAID_TYPES.map(t => {
              const selected = raidType === t.value;
              const color = RAID_TYPE_COLORS[t.value] || '#6b7280';
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setRaidType(selected ? '' : t.value)}
                  title={t.label}
                  aria-label={t.label}
                  aria-pressed={selected}
                  style={{
                    padding: '0.5rem 0.25rem',
                    borderRadius: '0.375rem',
                    border: selected ? `2px solid ${color}` : '2px solid var(--border-card)',
                    background: selected ? `${color}20` : 'var(--bg-primary)',
                    color: selected ? color : 'var(--text-secondary)',
                    fontWeight: selected ? '700' : '500',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {t.value === 'Unknown' ? '?' : t.value}
                </button>
              );
            })}
          </div>
          {raidType === 'Unknown' && (
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.4rem 0 0 0' }}>
              Unknown raids are added to player totals but never posted to Discord — use for fixing missing/desynced raids.
            </p>
          )}
        </div>

        {[0, 1, 2, 3].map(i => (
          <div key={i}>
            <label style={labelStyle}>Player {i + 1}{i > 0 && ' (optional)'}</label>
            <MemberInput
              value={groupPlayers[i]}
              onChange={v => setGroupPlayer(i, v)}
              guildMembers={meta.guildMembers}
              placeholder="Search guild member..."
              id={`player-${i}`}
            />
          </div>
        ))}
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '-0.35rem 0 0 0' }}>
          Raided with players from another guild? Only list our members and leave the rest empty.
        </p>

        <div>
          <label style={labelStyle} htmlFor="raid-count">Number of Raids</label>
          <input
            id="raid-count"
            type="number"
            min={1}
            max={MAX_RAIDS_PER_SUBMISSION}
            value={raidCount}
            onChange={e => setRaidCount(e.target.value)}
            style={{ ...inputStyle, width: '6rem' }}
          />
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.4rem 0 0 0' }}>
            Logs this same group and raid type multiple times.
          </p>
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canAnnounce ? 'pointer' : 'not-allowed',
          fontSize: '0.85rem', color: canAnnounce ? 'var(--text-primary)' : 'var(--text-muted)',
          userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={effectiveAnnounce}
            disabled={!canAnnounce || saving}
            onChange={e => setAnnounce(e.target.checked)}
            style={{ width: '1rem', height: '1rem', accentColor: 'var(--color-ocean-400)' }}
          />
          Post to the Discord raid channel
          {!canAnnounce && ' (unavailable for Unknown raids)'}
        </label>

        {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}
        {success && <div style={{ color: '#22c55e', fontSize: '0.85rem' }}>{success}</div>}

        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            background: 'var(--color-ocean-400)', border: 'none', borderRadius: '0.375rem',
            padding: '0.6rem', color: '#fff', fontSize: '0.875rem', fontWeight: '700',
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Logging...' : `Log Raid${parseInt(raidCount, 10) > 1 ? `s (×${parseInt(raidCount, 10)})` : ''}`}
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block',
};
