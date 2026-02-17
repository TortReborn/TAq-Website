"use client";

export default function ApplyPage() {
  return (
    <div style={{
      maxWidth: '600px',
      margin: '3rem auto',
      padding: '0 1rem',
      textAlign: 'center',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-card)',
        borderRadius: '1rem',
        padding: '3rem 2rem',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
        <h1 style={{
          fontSize: 'clamp(1.75rem, 4vw, 2.25rem)',
          fontWeight: '800',
          background: 'linear-gradient(135deg, var(--color-ocean-400), var(--color-ocean-600))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: '1rem',
          letterSpacing: '-0.02em',
        }}>
          Apply to The Aquarium
        </h1>
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '1.05rem',
          lineHeight: '1.7',
          marginBottom: '2rem',
        }}>
          To apply, join our Discord server and head to the <strong style={{ color: 'var(--text-primary)' }}>#applications</strong> channel.
          Click the application button there to get started!
        </p>
        <a
          href="https://discord.gg/njRpZwKVaa"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            padding: '14px 28px',
            background: 'linear-gradient(135deg, #5865f2 0%, #4752c4 100%)',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '10px',
            fontWeight: '700',
            fontSize: '1.05rem',
            transition: 'all 0.3s ease',
            boxShadow: '0 2px 8px rgba(88, 101, 242, 0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(88, 101, 242, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(88, 101, 242, 0.3)';
          }}
        >
          Join Our Discord
        </a>
      </div>
    </div>
  );
}
