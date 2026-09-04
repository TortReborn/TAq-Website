/**
 * Chronicles layout: long-form reading needs a calm, near-opaque surface, but
 * that surface is painted by `.site-bg-reading` in the root layout rather than
 * here. Inside this layout it would be a child of PageTransition's animated
 * wrapper, so the wrapper's opacity fade-in would run over the darkening
 * itself and the undarkened background photo would flash through on every
 * navigation between Chronicles pages.
 */
export default function ChroniclesLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh' }}>{children}</div>;
}
