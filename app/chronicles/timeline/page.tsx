import Link from 'next/link';
import type { Metadata } from 'next';
import { getPool } from '@/lib/db';
import { loadChronicleData } from '@/lib/chronicle-db';
import { chronicleEventColor, allianceTimelineSpans } from '@/lib/chronicle';
import { resolveWikiSlugs } from '@/lib/wiki-db';
import { slugify } from '@/lib/wiki';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Timeline — Chronicle',
  description: 'The master timeline of Wynncraft guild history.',
};

/**
 * The master timeline: chronicle events + alliance foundings/dissolutions
 * merged into one year-grouped stream. Entries auto-link to wiki articles
 * whose slug matches the event title or alliance name; everything links to
 * the history map at its moment.
 */

interface TimelineEntry {
  ms: number;
  dateLabel: string;
  title: string;
  kind: string;      // event type, or 'alliance'
  color: string;
  description?: string;
  wikiSlug?: string; // set when a matching wiki page exists
  mapDate: string;   // YYYY-MM-DD for the history-map deep link
  ongoing?: boolean;
}

const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default async function ChroniclesTimeline() {
  const pool = getPool();
  const { alliances, events } = await loadChronicleData(pool);

  const entries: TimelineEntry[] = [];

  for (const e of events) {
    const ms = Date.parse(e.startsAt);
    entries.push({
      ms,
      dateLabel: DATE_FMT.format(new Date(ms)),
      title: e.title,
      kind: e.eventType,
      color: chronicleEventColor(e.eventType),
      description: e.description,
      mapDate: e.startsAt.slice(0, 10),
      ongoing: e.endsAt === null && e.eventType === 'war',
    });
  }

  for (const span of allianceTimelineSpans(alliances)) {
    entries.push({
      ms: span.startMs,
      dateLabel: DATE_FMT.format(new Date(span.startMs)),
      title: `${span.name} ${span.kind === 'community' ? 'community alliance' : 'alliance'} active`,
      kind: 'alliance',
      color: span.color,
      description: span.endMs === null
        ? 'Active to the present day.'
        : `Active until ${DATE_FMT.format(new Date(span.endMs))}, ${new Date(span.endMs).getUTCFullYear()}.`,
      wikiSlug: slugify(span.name),
      mapDate: new Date(span.startMs).toISOString().slice(0, 10),
    });
  }

  entries.sort((a, b) => a.ms - b.ms);

  // Resolve which candidate wiki slugs actually exist
  const candidates = new Set<string>();
  for (const e of entries) {
    candidates.add(e.wikiSlug ?? slugify(e.title));
  }
  const existing = await resolveWikiSlugs(pool, [...candidates]);
  for (const e of entries) {
    const candidate = e.wikiSlug ?? slugify(e.title);
    e.wikiSlug = existing.has(candidate) ? candidate : undefined;
  }

  // Group by year
  const byYear = new Map<number, TimelineEntry[]>();
  for (const e of entries) {
    const y = new Date(e.ms).getUTCFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(e);
  }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '2rem 1rem 3rem' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
        <Link href="/chronicles" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Chronicle</Link>
        {' › Timeline'}
      </div>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.4rem' }}>
        The Guild History Timeline
      </h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.6rem 0 1.5rem' }}>
        Every recorded alliance and event, 2018 to today. Dates link to the{' '}
        <Link href="/map/history/chronicle" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>history map</Link>{' '}
        at that moment; titles link to their Chronicle article where one exists.
      </p>

      {[...byYear.entries()].map(([year, list]) => (
        <section key={year} style={{ marginBottom: '1.5rem' }}>
          <h2 style={{
            fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)',
            borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginBottom: '0.6rem',
            position: 'sticky', top: '4rem', background: 'var(--bg-primary, var(--bg-card))', zIndex: 2,
          }}>
            {year}
          </h2>
          <div style={{ borderLeft: '2px solid var(--border-color)', paddingLeft: '1rem', marginLeft: '0.3rem' }}>
            {list.map((e, i) => (
              <div key={i} style={{ position: 'relative', marginBottom: '0.8rem' }}>
                <span style={{
                  position: 'absolute', left: 'calc(-1rem - 7px)', top: '0.3rem',
                  width: '10px', height: '10px', borderRadius: e.kind === 'alliance' ? '3px' : '50%',
                  background: e.color, border: '2px solid var(--bg-card-solid, var(--bg-card))',
                }} />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Link
                    href={`/map/history/chronicle?t=${e.mapDate}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textDecoration: 'none', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                    title="Open the history map at this date in a new tab"
                  >
                    {e.dateLabel}
                  </Link>
                  {e.wikiSlug ? (
                    <Link href={`/chronicles/${e.wikiSlug}`} style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-primary)', textDecoration: 'none' }}>
                      {e.title}
                    </Link>
                  ) : (
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{e.title}</span>
                  )}
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {e.kind}{e.ongoing ? ' · ongoing' : ''}
                  </span>
                </div>
                {e.description && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem', lineHeight: 1.5 }}>
                    {e.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
