# Chronicles Wiki — seeding style guide

You are drafting articles for the "Chronicles" wiki of a Wynncraft guild website
(The Aquarium / TAq). Subject: the history of Wynncraft guild warfare, 2014-2026.

## The source archive — check it BEFORE any web call

`TAq-Website/data/wiki/sources/` holds primary sources already fetched (forum
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
- `TAq-Website/data/chronicle/research-notes-2020-2026.md` — sourced research
  dossier with forum-thread numbers, Titan Times volumes, provenance standards.
- `TAq-Website/data/chronicle/drafts/events-2018-2021.json` and
  `chronicle-alliances-draft-2018-2021.json` and
  `chronicle-draft-2020-2026-additions.json` and `chronicle-draft-2018-era.json`
  — earlier drafts with extra narrative detail and provenance tags
  ([attested]/[api]/[tt]=Titan Times/[testimony]/[map]/[image]).
- `TAq-Website/data/chronicle/pre2018-territory-snapshots.json` — recovered 2016/2018
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

## Voice — emulate Wikipedia

Write as if for Wikipedia. Concretely:

- **Neutral point of view.** Describe what happened and who said what; never take a
  side, never praise or condemn. "Gang of Fools left the alliance mid-season" —
  not "Gang of Fools infamously betrayed the alliance."
- **Third person, past tense**, for past events. No "we", "our guild", "you".
  The Aquarium is described exactly like every other guild.
- **No peacock words** (legendary, iconic, dominant-beyond-question, greatest)
  and **no weasel words** (some say, many believe, it is widely regarded).
  If a superlative is in a source, attribute it: `Titan Times called it
  "unquestionably the greatest super-alliance of 2023"`.
- **Attribute contested claims** rather than asserting them. "Slayne later
  claimed the alliance was founded as a rival project" beats "the alliance was
  founded as a rival project."
- **Lede first.** Open with a sentence that defines the subject and places it in
  time: "The Federation was the dominant Wynncraft war alliance of 2018."
- **No narrative flourish**: no rhetorical questions, no scene-setting, no
  "little did they know". Dates and facts carry the drama on their own.
- **Plain, specific language.** Prefer "held the entire map for 8 months and 25
  days" to "enjoyed a long period of supremacy."

## Rigor — every claim is sourced, nothing is invented

This is the hard rule of the project: **do not make anything up.** No plausible
dates, rosters, causes, outcomes or motivations. Readers cannot tell an invented
detail from a real one, which is what makes it damaging.

- Every factual claim traces to a source, and carries an inline citation.
- **Uncertainty is content.** Write "the roster was never published", "which side
  prevailed is not recorded", "the cause is undocumented" — these sentences are
  valuable, not filler.
- **Label non-attested material in the prose itself**, every time:
  - map inference → "map-data analysis places the war's start near…"
  - recollection → "in a 2019 memoir, Arkada recalled…"
  - testimony → "according to a veteran's recollection, not corroborated in writing…"
  - single-source → "attested only by a single forum post"
- **State contradictions** instead of silently picking a side: "the community
  timeline places the merger on 24 December; participants recall a Christmas Day
  wipe followed by a February merger."
- If you cannot source it, leave it out and say the record is silent.

## Domain caveat — the in-game "ally" feature is not a political alliance

Wynncraft's in-game guild ally system (the Diplomacy menu, and the "X formed an
alliance with Y" chat broadcasts that Sequoia's mod began capturing in June 2026)
is **mainly a game-mechanical convenience: it lets guilds run guild raids
together.** It is *not* evidence of a political alliance. Guilds that are
in-game allies may be rivals, and may have recently fought each other.

These records are seductive because they are dated, verbatim and machine-made,
arriving exactly when the written record goes quiet — which makes them easy to
over-read. So:

- Never present an in-game ally record as a bloc, a pact, a reconciliation, or a
  side in a war.
- Whenever such a record is cited, say what it is in the same breath: "an in-game
  ally registration, a relationship used chiefly to permit joint guild raids".
- Keep them clearly separate from the chronicle's war and community alliances,
  which are a far stronger class of evidence.

## Citations — inline superscripts, Wikipedia style

Cite inline with `{{cite:...}}`, which renders a numbered superscript linking to
a numbered reference list at the foot of the article:

    Federation wiped HackForums' 111 territories in under 12 hours{{cite:thread-237070|post #1, 13 Nov 2018}}.

Forms, in order of preference:

1. **An archived source id** — `{{cite:thread-237070|post #1, 13 Nov 2018}}`.
   Resolves automatically to the real title, URL and capture date from
   `data/wiki/sources/index.json`, and the quoted text is on disk. **Always prefer this.**
   Find ids with `node scripts/source-archive.mjs list` or `search`.
2. **A URL** we have not archived — `{{cite:https://example.com/x|Page title}}`.
   Better: archive it first with `source-archive.mjs add`, then cite the id.
3. **Free text** for unlinkable evidence — `{{cite:territory_exchanges map-data analysis}}`.

Rules:
- The **locator** (after `|`) points at the exact place: `p3 #45`, `post #12`,
  `vol. 6, 12 Oct 2022`. Include it whenever the source is longer than a page.
- Identical citations share a number automatically, as on Wikipedia. A different
  locator counts as a different reference.
- **Cite at the claim**, not in a lump at the end of a paragraph — put the marker
  immediately after the sentence or clause it supports.
- Every paragraph making factual claims should carry at least one citation.
- Do **not** hand-write a `## Sources` or `## References` section: the reference
  list is generated. (Older articles still carry a manual `## Sources` list —
  when you revise one, convert those entries into inline citations and delete
  the section.)


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
