# Chronicles Wiki — seeding style guide

You are drafting articles for the "Chronicles" wiki of a Wynncraft guild website
(The Aquarium / TAq). Subject: the history of Wynncraft guild warfare, 2014-2026.

## The source archive — check it BEFORE any web call

`TAq-Website/data/sources/` holds primary sources already fetched (forum
threads with per-post attribution, Wayback captures, newsletters). Search it
first; only hit the network for something genuinely missing, and archive
whatever you fetch so it is there next time:

```bash
node scripts/source-archive.mjs search "Valkyrie"     # grep every archived source
node scripts/source-archive.mjs list                   # what we already hold
node scripts/source-archive.mjs show thread-237070     # read one
node scripts/source-archive.mjs add <url> [--wayback YYYYMMDD] --note "why"
node scripts/source-archive.mjs thread 278112          # all pages of a thread
```

Quoting from the archive is preferred over paraphrasing from memory: the text is
verbatim and the post number, author and date are right there in the heading.

## Source files (read these; they are the factual record)

- `<SCRATCHPAD>/chronicle-dump.json` — the vetted database: 22 alliances (name,
  tag, war/community kind, description, full membership stints with dates) and 36
  events (type, title, description, dates, guilds, alliances). **This is the
  ground truth.** Article claims must not contradict it.
- `TAq-Website/data/chronicle-research-notes-2020-2026.md` — sourced research
  dossier with forum-thread numbers, Titan Times volumes, provenance standards.
- `TAq-Website/data/chronicle-events-draft-2018-2021.json` and
  `chronicle-alliances-draft-2018-2021.json` and
  `chronicle-draft-2020-2026-additions.json` and `chronicle-draft-2018-era.json`
  — earlier drafts with extra narrative detail and provenance tags
  ([attested]/[api]/[tt]=Titan Times/[testimony]/[map]/[image]).
- `TAq-Website/data/pre2018-territory-snapshots.json` — recovered 2016/2018
  leaderboard captures with per-guild territory counts.

## Output format

Write ONE JSON file at the path given in your task: an array of page objects:

```json
[
  {
    "slug": "kebab-case-slug",
    "title": "Display Title",
    "pageType": "guild" | "alliance" | "player" | "war" | "update" | "era" | "general",
    "summary": "1-2 sentence lede, plain text, max 500 chars.",
    "infobox": [ { "label": "Founded", "value": "2 Jun 2015" }, ... ],
    "body": "Markdown body..."
  }
]
```

Limits: title ≤ 120 chars, summary ≤ 500, body ≤ 100 000, infobox ≤ 24 rows,
infobox label ≤ 40 chars / value ≤ 300 (values may contain [[wiki links]]).

## Voice and rigor

- Wikipedia register: neutral, third person, past tense for past events. No
  first person, no editorializing, no hype.
- **Every dated claim must trace to the corpus.** Where the record is inference
  rather than attestation, say so in prose ("map-data analysis places the war's
  start near..."; "the roster was never published"). Do not invent names, dates,
  rosters, or causes. Uncertainty is content: state what is unknown.
- End every article with a `## Sources` section: bulleted list, e.g.
  `- Wynncraft forums thread 278112 ("the megalist"), posts of 2 Dec 2020 and 26 Jun 2022`
  `- Titan Times vol. 6 (12 Oct 2022)`
  `- territory_exchanges map-data analysis (weekly capture volumes)`
  Cite what the corpus cites; do not fabricate citations.
- If you use WebSearch/WebFetch to fill a gap, only add claims you actually
  verified, and cite the URL/thread. Prefer the corpus when they conflict —
  or note the conflict.

## Wiki dialect

- Internal links: `[[Page Title]]` or `[[slug|label]]`. The link target is
  slugified automatically ([[Kingdom Foxes]] → kingdom-foxes). Link liberally:
  first mention of any guild, alliance, player, war, era, or update that has a
  page in the master slug list below. Links to pages outside the list are
  allowed ("red links") but keep them purposeful.
- Headings: `## Section` / `### Subsection` (these build the table of contents).
- Live-data embeds (each on its own line, exact syntax):
  - `{{alliance:Name}}` — renders the alliance's live card (color, dates,
    member history) from the chronicle DB. Put one near the end of every
    alliance article, in a `## Membership` section. Name must exactly match the
    chronicle alliance name.
  - `{{war-chart:Guild A|Guild B|YYYY-MM-DD|YYYY-MM-DD}}` — weekly capture
    chart between two guilds. Use on war articles where the two principal
    guilds and window are known. Guild names must be the FULL in-game names as
    they appear in chronicle-dump.json guild lists (e.g. "The Aquarium",
    "Idiot Co", "Kingdom Foxes"). Pad the window a week or two on both sides.
    Only for wars from 2018-01 onward (no earlier data exists).
  - `{{map:YYYY-MM-DD|label}}` — link card into the history map at that date.
    Good on era and war articles ("The map when X began").
- No raw HTML. GitHub-flavored markdown tables are fine.

## Page-type conventions

- **alliance**: infobox rows: Tag, Kind (War alliance / Community alliance),
  Active (e.g. "Feb 2018 – Nov 2018"), Peak size. Sections: lede paragraph(s),
  ## History, ## Membership (with the {{alliance:...}} embed), ## Legacy,
  ## Sources. The slug MUST be the slugified alliance name exactly
  (e.g. "council-of-canyon-kingdoms", "smtn-elf").
- **war**: infobox: Dates, Belligerents (with [[links]]), Outcome (only if
  recorded). Sections: ## Background, ## Course of the war, ## Aftermath,
  ## Sources. Include a war-chart embed when possible and a {{map:...}} of the
  start date. Slug must match the slugified chronicle event title when the war
  is a chronicle event (list below) so the map/timeline auto-link.
- **guild**: infobox: Tag, Founded (if known), Status (Active/Disbanded/Renamed
  if known). Sections: ## History (chronological, organized by era/alliance),
  ## Alliances (bulleted list of alliance memberships with dates, linked),
  ## Sources. Do not guess founding dates.
- **player**: ONLY well-attested public in-game/forum figures. Facts strictly
  limited to their public guild-history record (roles, foundings, forum posts).
  No real-world information whatsoever. Keep short.
- **era**: a survey of a period. Open with a {{map:...}} embed of a
  representative date. Sections free-form; end with ## Sources.
- **update**: a Wynncraft game update/system relevant to warring. Verify names
  and dates by web research before writing; if a date can't be verified, write
  what is known and say so.
- **general**: reference topics (the megalist, Titan Times, territory warfare
  mechanics).

## Master slug list (link targets that will exist)

Alliances: coalition, valkyrie, the-federation (title "The Federation"; NOTE:
special case — link it as [[the-federation|Federation]] or [[The Federation]]),
alliance-alliance, aesir-pact, sol, luna, terra, council-of-canyon-kingdoms,
artemis, horologium, hestia, empire-of-nemract, goose, niflheim, khaos,
valhalla, vanir, cucumber-company, adonis, smtn-elf, avocado-aquarium.

Wars/events: coalition-civil-war, the-wipe-of-hackforums, the-federation-dies,
goose-artemis-war, the-great-collapse, valhalla-khaos-war, the-avocado-split,
avicia-sequoia-war, idiot-co-aquarium-war, the-long-raid, aequitas-avicia-war,
aequitas-sequoia-war, first-machine-recorded-alliances.

Guilds: the-aquarium, avicia, kingdom-foxes, imperial, hackforums, titans-valor,
aequitas, sequoia, idiot-co, profession-heaven, paladins-united, fantasy,
diamonddeities, the-simple-ones, emorians, shadowfall, libertas.

Eras: early-guild-era, federation-era, the-alliance-wars-of-2019,
artemis-goose-era, the-realignment-era, private-diplomacy-era.

Updates: the-guild-update, the-economy-update, guild-seasons,
the-diplomacy-update.

Players: drew1011, gazthecat, nitrogen2oxygen.

General: history-of-wynncraft-guild-warfare (the hub page), the-forum-megalist,
titan-times, territory-warfare.

## Length guidance

Alliance/era/war articles: 300-700 words of body. Guild articles: 150-400.
Player/update/general: 100-300. Depth must follow the sources — a thin record
means a short, honest article, never padding.
