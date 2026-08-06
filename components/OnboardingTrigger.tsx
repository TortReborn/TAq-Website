"use client";

import Image from 'next/image';

export default function OnboardingTrigger({ onRestart }: { onRestart: () => void }) {
  return (
    <button
      onClick={onRestart}
      title="Replay onboarding tour"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.45rem 0.75rem',
        borderRadius: '0.5rem',
        background: 'transparent',
        border: 'none',
        fontSize: '0.875rem',
        fontWeight: '500',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        width: '100%',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
    >
      <Image src="/images/icons/exec/tour.png" alt="" width={18} height={18} style={{ imageRendering: 'pixelated', flexShrink: 0 }} />
      Tour
    </button>
  );
}
