import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export default function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div style={{
      textAlign: 'center',
      marginBottom: '2rem'
    }}>
      <h1 style={{
        fontSize: 'clamp(2rem, 4vw, 3rem)',
        fontWeight: '800',
        background: 'linear-gradient(135deg, var(--color-ocean-400), var(--color-ocean-600))',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        marginBottom: subtitle ? '0.5rem' : '0',
        letterSpacing: '-0.02em'
      }}>
        {title}
      </h1>
      {subtitle && (
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '1.125rem',
          marginTop: '0.5rem'
        }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}