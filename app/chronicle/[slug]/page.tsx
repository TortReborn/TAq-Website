import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPool } from '@/lib/db';
import { getWikiPage, wikiBacklinks, resolveWikiSlugs, listWikiRevisions, getPageVerification } from '@/lib/wiki-db';
import { resolveWikiEmbeds } from '@/lib/wiki-embed-db';
import { resolveWikiCitations } from '@/lib/wiki-sources';
import { extractWikiLinks } from '@/lib/wiki';
import { resolveWikiPrincipalFromCookies } from '@/lib/wiki-auth';
import {
  canSeeRedacted,
  isRedactedSlug,
  redactCitations,
  redactLinkRows,
  redactPage,
  redactSlugSet,
} from '@/lib/wiki-redaction';
import WikiArticleView from '@/components/WikiArticleView';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  // The tab title and meta description are a second way out of the building,
  // independent of the body render — a restricted page must not name its
  // subject here either.
  const principal = await resolveWikiPrincipalFromCookies().catch(() => null);
  if (isRedactedSlug(slug) && !canSeeRedacted(principal)) return { title: 'Chronicle' };
  const found = await getWikiPage(getPool(), slug).catch(() => null);
  if (!found) return { title: 'Chronicle' };
  const page = canSeeRedacted(principal) ? found.page : redactPage(found.page);
  return {
    title: `${page.title} — Chronicle`,
    description: page.summary || undefined,
  };
}

export default async function WikiArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pool = getPool();

  const principal = await resolveWikiPrincipalFromCookies().catch(() => null);
  const unredacted = canSeeRedacted(principal);

  // A restricted page is not "hidden", it is absent: the same 404 an unknown
  // slug gets, so the response cannot be used to confirm the page exists.
  if (isRedactedSlug(slug) && !unredacted) notFound();

  const found = await getWikiPage(pool, slug);
  if (!found) notFound();
  // A redirect could land on a restricted page from an innocent-looking slug.
  if (isRedactedSlug(found.page.slug) && !unredacted) notFound();

  const { redirectedFrom } = found;
  const page = unredacted ? found.page : redactPage(found.page);

  // Everything downstream reads the redacted body, so a redacted name never
  // reaches link extraction, citation resolution or the embed resolver — and
  // the citation map keys keep matching the markers in the text that renders.
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
      backlinks={unredacted ? backlinks : redactLinkRows(backlinks)}
      existingSlugs={unredacted ? [...existing] : redactSlugSet(existing)}
      embeds={embeds}
      citations={unredacted ? citations : redactCitations(citations)}
      redirectedFrom={redirectedFrom}
      verification={verification}
      lastEditor={last ? { name: last.authorName, note: last.note, kind: last.authorKind } : null}
    />
  );
}
