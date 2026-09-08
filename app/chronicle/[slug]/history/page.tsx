import { notFound } from 'next/navigation';
import { getPool } from '@/lib/db';
import { getWikiPage, listWikiRevisions } from '@/lib/wiki-db';
import { resolveWikiPrincipalFromCookies } from '@/lib/wiki-auth';
import {
  canSeeRedacted,
  isRedactedSlug,
  redactPage,
  redactRevisions,
} from '@/lib/wiki-redaction';
import WikiHistoryView from '@/components/WikiHistoryView';

export const dynamic = 'force-dynamic';

export default async function WikiHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pool = getPool();

  const principal = await resolveWikiPrincipalFromCookies().catch(() => null);
  const unredacted = canSeeRedacted(principal);
  if (isRedactedSlug(slug) && !unredacted) notFound();

  const found = await getWikiPage(pool, slug);
  if (!found) notFound();
  if (isRedactedSlug(found.page.slug) && !unredacted) notFound();

  const revisions = await listWikiRevisions(pool, found.page.id);
  // Every stored revision of a page carries the text as written at the time, so
  // history is the obvious way round a redaction applied only to the current
  // body. It gets the same treatment.
  return (
    <WikiHistoryView
      page={unredacted ? found.page : redactPage(found.page)}
      revisions={unredacted ? revisions : redactRevisions(revisions)}
    />
  );
}
