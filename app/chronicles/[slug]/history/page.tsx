import { notFound } from 'next/navigation';
import { getPool } from '@/lib/db';
import { getWikiPage, listWikiRevisions } from '@/lib/wiki-db';
import WikiHistoryView from '@/components/WikiHistoryView';

export const dynamic = 'force-dynamic';

export default async function WikiHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pool = getPool();
  const found = await getWikiPage(pool, slug);
  if (!found) notFound();
  const revisions = await listWikiRevisions(pool, found.page.id);
  return <WikiHistoryView page={found.page} revisions={revisions} />;
}
