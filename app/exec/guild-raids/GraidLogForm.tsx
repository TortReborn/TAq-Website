"use client";

import { useState, useMemo } from 'react';
import { useExecGraidLogMutations } from '@/hooks/useExecGraidLogs';

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
  const [players, setPlayers] = useState(['', '', '', '']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { createLog } = useExecGraidLogMutations();

  const memberSet = useMemo(() => new Set(meta.guildMembers.map(m => m.toLowerCase())), [meta.guildMembers]);

  const setPlayer = (idx: number, value: string) => {
    setPlayers(prev => { const next = [...prev]; next[idx] = value; return next; });
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (!raidType) { setError('Select a raid type.'); return; }

    const trimmed = players.map(p => p.trim());
    const empty = trimmed.filter(p => !p);
    if (empty.length > 0) { setError('All 4 participants are required.'); return; }

    const nonMembers = trimmed.filter(p => !memberSet.has(p.toLowerCase()));
    if (nonMembers.length > 0) { setError(`Not current guild members: ${nonMembers.join(', ')}`); return; }

    const unique = new Set(trimmed.map(p => p.toLowerCase()));
    if (unique.size < 4) { setError('All 4 participants must be different.'); return; }

    setSaving(true);
    try {
      const result = await createLog(raidType, trimmed);
      setSuccess(`Logged ${raidType} raid (#${result.id})${result.warning ? ` — ${result.warning}` : ''}`);
      setRaidType('');
      setPlayers(['', '', '', '']);
      onLogged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--bg-card-solid)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1.25rem', maxWidth: '500px' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 1rem 0' }}>Log Guild Raid</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Raid Type</label>
          <select style={inputStyle} value={raidType} onChange={e => setRaidType(e.target.value)}>
            <option value="">Select raid...</option>
            {RAID_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {[0, 1, 2, 3].map(i => (
          <div key={i}>
            <label style={labelStyle}>Player {i + 1}</label>
            <MemberInput
              value={players[i]}
              onChange={v => setPlayer(i, v)}
              guildMembers={meta.guildMembers}
              placeholder="Search guild member..."
              id={`player-${i}`}
            />
          </div>
        ))}

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
          {saving ? 'Logging...' : 'Log Raid'}
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block',
};
