import { SYSTEM_LABELS } from './constants';

export default function SystemIcon({ system, size = 14 }: { system: string; size?: number }) {
  const label = SYSTEM_LABELS[system] || system;
  const color = 'var(--text-secondary)';

  if (system === 'discord_bot') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <title>{label}</title>
        <path
          d="M6.5 3C4.5 3 3 4.5 3 6v2.5c0 1.5 1 2.5 2.5 2.5h.5l1.5 2v-2h1c2 0 3.5-1 3.5-2.5V6c0-1.5-1.5-3-3.5-3h-2z"
          stroke={color} strokeWidth="1.3" strokeLinejoin="round"
        />
        <circle cx="6" cy="7.5" r="0.8" fill={color} />
        <circle cx="10" cy="7.5" r="0.8" fill={color} />
      </svg>
    );
  }

  if (system === 'minecraft_mod') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <title>{label}</title>
        <rect x="3" y="3" width="10" height="10" rx="1" stroke={color} strokeWidth="1.3" />
        <rect x="5" y="5" width="2" height="2" fill={color} />
        <rect x="9" y="5" width="2" height="2" fill={color} />
        <rect x="6" y="9" width="4" height="2" fill={color} />
      </svg>
    );
  }

  // website — globe
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <title>{label}</title>
      <circle cx="8" cy="8" r="5.5" stroke={color} strokeWidth="1.3" />
      <ellipse cx="8" cy="8" rx="2.5" ry="5.5" stroke={color} strokeWidth="1.3" />
      <line x1="2.5" y1="8" x2="13.5" y2="8" stroke={color} strokeWidth="1.3" />
    </svg>
  );
}
