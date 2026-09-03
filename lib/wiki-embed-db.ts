import { Pool } from 'pg';
import { loadChronicleData } from './chronicle-db';
import { resolveWikiSlugs } from './wiki-db';
import { slugify } from './wiki';
import {
  AllianceEmbedData,
  WarChartEmbedData,
  WikiEmbedData,
  WikiEmbedMap,
  WIKI_EMBED_DATE_RE,
  WAR_CHART_MAX_WEEKS,
  extractWikiEmbeds,
} from './wiki-embeds';

/**
 * Server-side resolution of wiki embed directives against the chronicle and
 * territory_exchanges tables. Bad directives resolve to {kind:'error'} so the
 * article still renders with an inline notice instead of failing the page.
 */

const WEEK_MS = 7 * 24 * 3600 * 1000;

type ChronicleLoad = ReturnType<typeof loadChronicleData>;

async function resolveAllianceEmbed(pool: Pool, chronicle: ChronicleLoad, name: string): Promise<WikiEmbedData> {
  const { alliances } = await chronicle;
  const needle = name.toLowerCase();
  const alliance =
    alliances.find(a => a.name.toLowerCase() === needle) ??
    alliances.find(a => a.tag.toLowerCase() === needle);
  if (!alliance) return { kind: 'error', message: `No chronicle alliance named “${name}”` };

  let startsAt = '';
  let endsAt: string | null = '';
  for (const m of alliance.memberships) {
    if (!startsAt || m.joinedAt < startsAt) startsAt = m.joinedAt;
    if (endsAt !== null) {
      if (m.leftAt === null) endsAt = null;
      else if (m.leftAt > endsAt) endsAt = m.leftAt;
    }
  }
  const slug = slugify(alliance.name);
  const existing = await resolveWikiSlugs(pool, [slug]);

  const data: AllianceEmbedData = {
    kind: 'alliance',
    name: alliance.name,
    tag: alliance.tag,
    color: alliance.color,
    allianceKind: alliance.kind,
    description: alliance.description,
    startsAt,
    endsAt: endsAt === '' ? null : endsAt,
    members: alliance.memberships.map(m => ({ guild: m.guild, joinedAt: m.joinedAt, leftAt: m.leftAt })),
    wikiSlug: existing.has(slug) ? slug : null,
  };
  return data;
}

async function resolveWarChartEmbed(pool: Pool, args: string[]): Promise<WikiEmbedData> {
  const [guildA, guildB, start, end] = args;
  if (!guildA || !guildB || !start || !end) {
    return { kind: 'error', message: 'war-chart needs: Guild A|Guild B|start date|end date' };
  }
  if (!WIKI_EMBED_DATE_RE.test(start) || !WIKI_EMBED_DATE_RE.test(end)) {
    return { kind: 'error', message: 'war-chart dates must be YYYY-MM-DD' };
  }
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!(endMs > startMs)) return { kind: 'error', message: 'war-chart end date must be after start' };
  if (endMs - startMs > WAR_CHART_MAX_WEEKS * WEEK_MS) {
    return { kind: 'error', message: `war-chart window is capped at ${WAR_CHART_MAX_WEEKS} weeks` };
  }

  const result = await pool.query(
    `SELECT floor(extract(epoch FROM exchange_time - $3::timestamptz) / 604800)::int AS wk,
            COUNT(*) FILTER (WHERE attacker_name = $1) AS a_takes,
            COUNT(*) FILTER (WHERE attacker_name = $2) AS b_takes
     FROM territory_exchanges
     WHERE exchange_time >= $3::timestamptz AND exchange_time < $4::timestamptz
       AND ((attacker_name = $1 AND defender_name = $2)
         OR (attacker_name = $2 AND defender_name = $1))
     GROUP BY 1 ORDER BY 1`,
    [guildA, guildB, `${start}T00:00:00Z`, `${end}T00:00:00Z`],
  );

  const byWeek = new Map<number, { a: number; b: number }>();
  for (const row of result.rows) byWeek.set(row.wk, { a: Number(row.a_takes), b: Number(row.b_takes) });

  const weekCount = Math.ceil((endMs - startMs) / WEEK_MS);
  const weeks: WarChartEmbedData['weeks'] = [];
  let totalA = 0;
  let totalB = 0;
  for (let i = 0; i < weekCount; i++) {
    const bucket = byWeek.get(i) ?? { a: 0, b: 0 };
    totalA += bucket.a;
    totalB += bucket.b;
    weeks.push({ week: new Date(startMs + i * WEEK_MS).toISOString().slice(0, 10), ...bucket });
  }
  if (totalA + totalB === 0) {
    return { kind: 'error', message: `No exchanges between “${guildA}” and “${guildB}” in that window — check the full guild names` };
  }
  return { kind: 'war-chart', guildA, guildB, start, end, weeks, totalA, totalB };
}

export async function resolveWikiEmbeds(pool: Pool, body: string): Promise<WikiEmbedMap> {
  const directives = extractWikiEmbeds(body);
  if (directives.length === 0) return {};

  // Lazy single load shared by all alliance directives on the page
  let chronicle: ChronicleLoad | null = null;
  const getChronicle = () => (chronicle ??= loadChronicleData(pool));

  const entries = await Promise.all(directives.map(async (d): Promise<[string, WikiEmbedData]> => {
    try {
      if (d.kind === 'alliance') return [d.raw, await resolveAllianceEmbed(pool, getChronicle(), d.args.join('|'))];
      if (d.kind === 'war-chart') return [d.raw, await resolveWarChartEmbed(pool, d.args)];
      // map: link card only — validate the date, no query
      const [date, label] = d.args;
      if (!WIKI_EMBED_DATE_RE.test(date ?? '')) {
        return [d.raw, { kind: 'error', message: 'map date must be YYYY-MM-DD' }];
      }
      return [d.raw, { kind: 'map', date, label: label || '' }];
    } catch (error) {
      console.error('[wiki-embed] resolution failed:', d.raw, error);
      return [d.raw, { kind: 'error', message: 'Embed failed to load' }];
    }
  }));
  return Object.fromEntries(entries);
}
