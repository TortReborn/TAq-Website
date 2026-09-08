import { notFound } from 'next/navigation';
import { getPool } from '@/lib/db';
import { getWikiPage } from '@/lib/wiki-db';
import { resolveWikiPrincipalFromCookies } from '@/lib/wiki-auth';
import { canSeeRedacted, pageNeedsReviewerToEdit } from '@/lib/wiki-redaction';
import WikiEditorGate from '@/components/WikiEditorGate';

export const dynamic = 'force-dynamic';

export default async function WikiEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getWikiPage(getPool(), slug);
  if (!found) notFound();
  const { page } = found;

  // A page carrying a redacted name can only be edited by someone allowed to
  // read it unredacted. Handing a contributor the aliased body and taking their
  // save would write the alias into the record — turning a view into the stored
  // text and destroying the thing the archivists are keeping.
  if (pageNeedsReviewerToEdit(page)) {
    const principal = await resolveWikiPrincipalFromCookies().catch(() => null);
    if (!canSeeRedacted(principal)) notFound();
  }

  return (
    <WikiEditorGate
      targetId={page.id}
      initial={{
        slug: page.slug,
        title: page.title,
        pageType: page.pageType,
        summary: page.summary,
        infobox: page.infobox,
        body: page.body,
      }}
    />
  );
}
