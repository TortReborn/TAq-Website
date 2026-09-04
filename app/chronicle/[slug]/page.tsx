import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPool } from '@/lib/db';
import { getWikiPage, wikiBacklinks, resolveWikiSlugs, listWikiRevisions, getPageVerification } from '@/lib/wiki-db';
import { resolveWikiEmbeds } from '@/lib/wiki-embed-db';
import { resolveWikiCitations } from '@/lib/wiki-sources';
import { extractWikiLinks } from '@/lib/wiki';
import WikiArticleView from '@/components/WikiArticleView';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await getWikiPage(getPool(), slug).catch(() => null);
  if (!found) return { title: 'Chronicle' };
  return {
    title: `${found.page.title} — Chronicle`,
    description: found.page.summary || undefined,
  };
}

export default async function WikiArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pool = getPool();
  const found = await getWikiPage(pool, slug);
  if (!found) notFound();
  const { page, redirectedFrom } = found;

  const linkTargets = [
    ...extractWikiLinks(page.body),
    ...page.infobox.flatMap(row => extractWikiLinks(row.value)),
  ];
  const [backlinks, existing, revisions, embeds, verification] = await Promise.all([
    wikiBacklinks(pool, page.slug),
    resolveWikiSlugs(pool, linkTargets),
    listWikiRevisions(pool, page.id),
    resolveWikiEmbeds(pool, page.body),
    getPageVerification(pool, page.id),
  ]);
  const last = revisions[0] ?? null;
  // Citations resolve against the local source archive (no DB, no network)
  const citations = resolveWikiCitations(page.body);

  return (
    <WikiArticleView
      page={page}
      backlinks={backlinks}
      existingSlugs={[...existing]}
      embeds={embeds}
      citations={citations}
      redirectedFrom={redirectedFrom}
      verification={verification}
      lastEditor={last ? { name: last.authorName, note: last.note, kind: last.authorKind } : null}
    />
  );
}
