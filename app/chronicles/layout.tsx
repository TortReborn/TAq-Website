/**
 * Chronicles layout: long-form reading needs a calm, near-opaque surface —
 * the site's decorative background art stays as a faint tint only.
 */
export default function ChroniclesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'color-mix(in srgb, var(--bg-primary, #0b0f17) 96%, transparent)',
        backdropFilter: 'saturate(0.85)',
      }}
    >
      {children}
    </div>
  );
}
