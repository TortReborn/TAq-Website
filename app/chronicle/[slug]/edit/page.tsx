import { notFound } from 'next/navigation';
import { getPool } from '@/lib/db';
import { getWikiPage } from '@/lib/wiki-db';
import WikiEditorGate from '@/components/WikiEditorGate';

export const dynamic = 'force-dynamic';

export default async function WikiEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getWikiPage(getPool(), slug);
  if (!found) notFound();
  const { page } = found;
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
