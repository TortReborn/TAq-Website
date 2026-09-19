import { notFound } from 'next/navigation';
import { resolveWikiPrincipalFromCookies } from '@/lib/wiki-auth';
import { canEnterChronicle } from '@/lib/chronicle-gate';

/**
 * Chronicle layout.
 *
 * While the Chronicle is under construction (TAQ-90) this is where the whole
 * section is gated: anyone who is not a chronicler or exec gets the site's
 * 404 for every route beneath /chronicle, the same as if it didn't exist.
 * The API routes under /api/wiki apply the same check independently, so a
 * direct fetch cannot see what the pages hide. See lib/chronicle-gate.ts.
 *
 * Long-form reading needs a calm, near-opaque surface, but that surface is
 * painted by `.site-bg-reading` in the root layout rather than here. Inside
 * this layout it would be a child of PageTransition's animated wrapper, so
 * the wrapper's opacity fade-in would run over the darkening itself and the
 * undarkened background photo would flash through on every navigation
 * between Chronicle pages.
 */
export default async function ChroniclesLayout({ children }: { children: React.ReactNode }) {
  const principal = await resolveWikiPrincipalFromCookies().catch(() => null);
  if (!canEnterChronicle(principal)) notFound();

  return <div style={{ minHeight: '100vh' }}>{children}</div>;
}
