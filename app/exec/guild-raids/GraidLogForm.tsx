"use client";

import { useState, useMemo } from 'react';
import { useExecGraidLogMutations } from '@/hooks/useExecGraidLogs';
import { RAID_TYPE_COLORS } from '@/lib/graid-log-constants';

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
  { value: 'TWP', label: 'The Wartorn Palace (TWP)' },
];

const UNKNOWN_TYPE = { value: 'Unknown', label: 'Unknown raid type' };

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

type Mode = 'group' | 'individual';

export default function GraidLogForm({ meta, onLogged }: Props) {
  const [mode, setMode] = useState<Mode>('group');
  const [raidType, setRaidType] = useState('');
  const [groupPlayers, setGroupPlayers] = useState(['', '', '', '']);
  const [individualPlayer, setIndividualPlayer] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { createLog } = useExecGraidLogMutations();

  const memberSet = useMemo(() => new Set(meta.guildMembers.map(m => m.toLowerCase())), [meta.guildMembers]);

  const setGroupPlayer = (idx: number, value: string) => {
    setGroupPlayers(prev => { const next = [...prev]; next[idx] = value; return next; });
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSuccess(null);
    if (next === 'group' && raidType === 'Unknown') setRaidType('');
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (mode === 'group') {
      if (!raidType || raidType === 'Unknown') { setError('Select a raid type.'); return; }
      const trimmed = groupPlayers.map(p => p.trim());
      const empty = trimmed.filter(p => !p);
      if (empty.length > 0) { setError('All 4 participants are required.'); return; }
      const nonMembers = trimmed.filter(p => !memberSet.has(p.toLowerCase()));
      if (nonMembers.length > 0) { setError(`Not current guild members: ${nonMembers.join(', ')}`); return; }
      const unique = new Set(trimmed.map(p => p.toLowerCase()));
      if (unique.size < 4) { setError('All 4 participants must be different.'); return; }

      setSaving(true);
      try {
        const result = await createLog(raidType, trimmed, 'group');
        setSuccess(`Logged ${raidType} raid (#${result.id})${result.warning ? ` — ${result.warning}` : ''}`);
        setRaidType('');
        setGroupPlayers(['', '', '', '']);
        onLogged();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    } else {
      // Individual mode
      const player = individualPlayer.trim();
      if (!player) { setError('Player is required.'); return; }
      if (!memberSet.has(player.toLowerCase())) { setError(`Not a current guild member: ${player}`); return; }
      const typeToSend = raidType || 'Unknown';

      setSaving(true);
      try {
        const result = await createLog(typeToSend, [player], 'individual');
        setSuccess(`Logged individual ${typeToSend} raid (#${result.id}) for ${player}`);
        setRaidType('');
        setIndividualPlayer('');
        onLogged();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    }
  };

  const raidOptions = mode === 'individual' ? [...RAID_TYPES, UNKNOWN_TYPE] : RAID_TYPES;

  return (
    <div style={{ background: 'var(--bg-card-solid)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', padding: '1.25rem', maxWidth: '500px' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 1rem 0' }}>Log Guild Raid</h3>

      <div style={{
        display: 'flex', gap: '0.25rem', marginBottom: '1rem',
        background: 'var(--bg-primary)', borderRadius: '0.5rem', padding: '0.25rem',
        border: '1px solid var(--border-card)',
      }}>
        {(['group', 'individual'] as Mode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: mode === m ? '700' : '500',
              background: mode === m ? 'var(--color-ocean-400)' : 'transparent',
              color: mode === m ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}
          >
            {m === 'group' ? 'Full Group (4)' : 'Individual'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Raid Type{mode === 'individual' && ' (or Unknown)'}</label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: mode === 'individual' ? 'repeat(6, 1fr)' : 'repeat(5, 1fr)',
            gap: '0.5rem',
          }}>
            {raidOptions.map(t => {
              const selected = raidType === t.value || (mode === 'individual' && t.value === 'Unknown' && !raidType);
              const color = RAID_TYPE_COLORS[t.value] || '#6b7280';
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setRaidType(selected && t.value !== 'Unknown' ? '' : t.value)}
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
                  {t.value}
                </button>
              );
            })}
          </div>
        </div>

        {mode === 'group' ? (
          [0, 1, 2, 3].map(i => (
            <div key={i}>
              <label style={labelStyle}>Player {i + 1}</label>
              <MemberInput
                value={groupPlayers[i]}
                onChange={v => setGroupPlayer(i, v)}
                guildMembers={meta.guildMembers}
                placeholder="Search guild member..."
                id={`player-${i}`}
              />
            </div>
          ))
        ) : (
          <div>
            <label style={labelStyle}>Player</label>
            <MemberInput
              value={individualPlayer}
              onChange={setIndividualPlayer}
              guildMembers={meta.guildMembers}
              placeholder="Search guild member..."
              id="player-individual"
            />
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.4rem 0 0 0' }}>
              Adds a single raid completion to this player only. Use this for fixing missing/desynced raids. Not posted to Discord.
            </p>
          </div>
        )}

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
          {saving ? 'Logging...' : mode === 'group' ? 'Log Raid' : 'Log Individual Raid'}
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block',
};
