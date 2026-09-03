import fs from 'fs';
import path from 'path';
import {
  WikiCitation,
  WikiCitationMap,
  extractCitations,
  fallbackCitationTitle,
  isCitationUrl,
} from './wiki-citations';

/**
 * Server-side resolution of wiki citations against the local source archive
 * (data/wiki/sources/index.json — see data/wiki/sources/README.md).
 *
 * The manifest is a build-time artifact, so it is read once and cached for the
 * life of the process. A citation whose ref isn't an archived id still renders;
 * it just carries no title or capture metadata.
 */

interface ArchivedSource {
  url: string;
  kind?: string;
  title?: string;
  waybackCapture?: string;
  note?: string;
  tier?: string;
}

let manifest: Record<string, ArchivedSource> | null = null;

function loadManifest(): Record<string, ArchivedSource> {
  if (manifest) return manifest;
  try {
    const file = path.join(process.cwd(), 'data', 'wiki', 'sources', 'index.json');
    manifest = JSON.parse(fs.readFileSync(file, 'utf8')).sources ?? {};
  } catch (error) {
    console.error('[wiki-sources] source manifest unavailable:', error);
    manifest = {};
  }
  return manifest!;
}

/** Titles come back long ("… | Wynncraft Forums"); trim the site furniture. */
function tidyTitle(title: string): string {
  return title
    .replace(/\s*\|\s*Wynncraft Forums\s*$/i, '')
    .replace(/\s*\|\s*Page \d+\s*$/i, '')
    .trim();
}

export function resolveWikiCitations(body: string): WikiCitationMap {
  const sources = loadManifest();
  const out: WikiCitationMap = {};

  for (const ref of extractCitations(body)) {
    const archived = sources[ref.ref];
    let citation: WikiCitation;

    if (archived) {
      citation = {
        ...ref,
        title: archived.title ? tidyTitle(archived.title) : ref.ref,
        url: archived.url,
        kind: archived.kind,
        waybackCapture: archived.waybackCapture,
        archived: true,
        tier: archived.tier,
        referencePath: `/chronicles/references/${ref.ref}`,
        waybackUrl: archived.waybackCapture && /^https?:///.test(archived.url)
          ? `https://web.archive.org/web/${archived.waybackCapture}/${archived.url}`
          : undefined,
      };
    } else {
      citation = {
        ...ref,
        title: fallbackCitationTitle(ref.ref),
        url: isCitationUrl(ref.ref) ? ref.ref : undefined,
        archived: false,
      };
    }
    out[ref.raw] = citation;
  }
  return out;
}

/** Archived source ids, for the editor's citation picker. */
export function listArchivedSources(): { id: string; title: string; kind: string; note?: string }[] {
  return Object.entries(loadManifest())
    .map(([id, s]) => ({ id, title: s.title ? tidyTitle(s.title) : id, kind: s.kind ?? 'web', note: s.note }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
