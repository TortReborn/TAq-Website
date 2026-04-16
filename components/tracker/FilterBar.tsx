import type { ExecMember } from '@/hooks/useExecTracker';
import { PRIORITY_COLORS, ASSIGNEE_FILTER_IGNS } from './constants';

function FilterGroup({ options, value, onChange, colors }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  colors?: Record<string, string>;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {options.map((opt) => {
        const active = value === opt.value;
        const accentColor = colors?.[opt.value];
        return (
          <button
            key={opt.value}
            onClick={() => onChange(active ? '' : opt.value)}
            style={{
              fontSize: '0.72rem',
              fontWeight: '600',
              padding: '0.25rem 0.6rem',
              borderRadius: '999px',
              border: active
                ? `1px solid ${accentColor || 'var(--color-ocean-500)'}`
                : '1px solid var(--border-card)',
              background: active
                ? `${accentColor || 'var(--color-ocean-500)'}22`
                : 'transparent',
              color: active
                ? (accentColor || 'var(--color-ocean-500)')
                : 'var(--text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.12s ease',
              outline: 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const divider: React.CSSProperties = {
  width: '1px',
  height: '1.2rem',
  background: 'var(--border-card)',
};

export default function FilterBar({
  typeFilter,
  setTypeFilter,
  systemFilter,
  setSystemFilter,
  priorityFilter,
  setPriorityFilter,
  assigneeFilter,
  setAssigneeFilter,
  searchInput,
  setSearchInput,
  execMembers,
  ticketCount,
}: {
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  systemFilter: string;
  setSystemFilter: (v: string) => void;
  priorityFilter: string;
  setPriorityFilter: (v: string) => void;
  assigneeFilter: string;
  setAssigneeFilter: (v: string) => void;
  searchInput: string;
  setSearchInput: (v: string) => void;
  execMembers: ExecMember[];
  ticketCount: number;
}) {
  const filteredMembers = execMembers.filter(m => ASSIGNEE_FILTER_IGNS.includes(m.ign));

  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      flexWrap: 'wrap',
      marginBottom: '0.75rem',
      alignItems: 'center',
    }}>
      <FilterGroup
        options={[
          { value: 'bug', label: 'Bug' },
          { value: 'feature', label: 'Feature' },
        ]}
        value={typeFilter}
        onChange={setTypeFilter}
        colors={{ bug: '#ef4444', feature: '#8b5cf6' }}
      />

      <div style={divider} />

      <FilterGroup
        options={[
          { value: 'discord_bot', label: 'Discord Bot' },
          { value: 'minecraft_mod', label: 'Minecraft Mod' },
          { value: 'website', label: 'Website' },
        ]}
        value={systemFilter}
        onChange={setSystemFilter}
      />

      <div style={divider} />

      <FilterGroup
        options={[
          { value: 'critical', label: 'Critical' },
          { value: 'high', label: 'High' },
          { value: 'medium', label: 'Medium' },
          { value: 'low', label: 'Low' },
        ]}
        value={priorityFilter}
        onChange={setPriorityFilter}
        colors={PRIORITY_COLORS}
      />

      <div style={divider} />

      <FilterGroup
        options={filteredMembers.map(m => ({ value: m.discordId, label: m.ign }))}
        value={assigneeFilter}
        onChange={setAssigneeFilter}
      />

      <div style={{
        marginLeft: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}>
        <div style={{ position: 'relative' }}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            style={{
              position: 'absolute',
              left: '0.5rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10.5 10.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title or description..."
            style={{
              fontSize: '0.72rem',
              padding: '0.3rem 0.55rem 0.3rem 1.7rem',
              borderRadius: '999px',
              border: '1px solid var(--border-card)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              outline: 'none',
              width: '220px',
            }}
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              title="Clear search"
              style={{
                position: 'absolute',
                right: '0.35rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                lineHeight: 1,
                padding: '0 0.2rem',
              }}
            >
              ×
            </button>
          )}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {ticketCount} ticket{ticketCount !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}
