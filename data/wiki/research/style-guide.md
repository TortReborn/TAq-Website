# Chronicle wiki — seeding task sheet

> **The house style now lives in the `chronicle-article` skill**
> (`.claude/skills/chronicle-article/`). Read `SKILL.md` and its `references/`
> before writing or revising anything. This file covers only what is specific to
> a bulk seeding task: where the inputs are and what shape the output takes.
>
> The voice, structure, citation and sourcing rules that used to live here have
> been superseded. In particular, the old instruction to label every
> non-attested claim in the prose itself has been **withdrawn** — provenance
> belongs in the footnote and its tier badge, not in the sentence.

## Inputs

- **`<SCRATCHPAD>/chronicle-dump.json`** — the vetted database: alliances (name,
  tag, war/community kind, description, membership stints with dates) and events
  (type, title, description, dates, guilds, alliances). **Ground truth.** Article
  claims must not contradict it.
- **`data/wiki/sources/`** — the source archive. Search it before any web call,
  and archive whatever you fetch so it is there next time:
  ```bash
  node scripts/source-archive.mjs search "Valkyrie"
  node scripts/source-archive.mjs list
  node scripts/source-archive.mjs show thread-237070
  node scripts/source-archive.mjs add <url> [--wayback YYYYMMDD] --note "why"
  node scripts/source-archive.mjs thread 278112
  ```
  Quoting from the archive beats paraphrasing from memory: the text is verbatim
  and the post number, author and date are in the heading.
- **`data/chronicle/research-notes-2020-2026.md`** — sourced dossier with forum
  thread numbers, Titan Times volumes, provenance standards.
- **`data/chronicle/drafts/*.json`** — earlier drafts with extra narrative detail
  and provenance tags ([attested]/[api]/[tt]/[testimony]/[map]/[image]).
- **`data/chronicle/pre2018-territory-snapshots.json`** — recovered 2016/2018
  leaderboard captures with per-guild territory counts.
- **`data/wiki/research/dossiers/`** and **`analyses/`** — period dossiers and
  investigation write-ups, including refuted hypotheses. Check `analyses/` before
  proposing a correction; it records what has already been disproved.

## Output

One JSON file at the path given in the task: an array of page objects.

```json
[
  {
    "slug": "kebab-case-slug",
    "title": "Display Title",
    "pageType": "guild | alliance | player | war | update | era | general",
    "summary": "The lede. 1-3 sentences, plain text, max 500 chars.",
    "infobox": [ { "label": "Founded", "value": "2 Jun 2015" } ],
    "body": "Markdown body..."
  }
]
```

Limits: title ≤ 120 chars, summary ≤ 500, body ≤ 100,000, infobox ≤ 24 rows,
infobox label ≤ 40 chars and value ≤ 300 (values may contain `[[wiki links]]`).

Section skeletons, word budgets and infobox rows per page type are in the skill's
`references/structure.md`.

## Live-data embeds

Each on its own line, exact syntax:

- `{{alliance:Name}}` — the alliance's live card (colour, dates, member history)
  from the chronicle DB. One near the end of every alliance article, in
  `## Membership`. The name must match the chronicle alliance name exactly.
- `{{war-chart:Guild A|Guild B|YYYY-MM-DD|YYYY-MM-DD}}` — weekly capture chart
  between two guilds. Guild names must be full in-game names as they appear in
  `chronicle-dump.json` (e.g. "The Aquarium", "Idiot Co", "Kingdom Foxes"). Pad
  the window a week or two either side. Only for wars from 2018-01 onward — no
  earlier exchange data exists.
- `{{map:YYYY-MM-DD|label}}` — link card into the history map at that date. Good
  on era and war articles.

## Master slug list (link targets that exist)

**Alliances**: coalition, valkyrie, the-federation (title "The Federation"; link
as `[[the-federation|Federation]]` or `[[The Federation]]`), alliance-alliance,
aesir-pact, sol, luna, terra, council-of-canyon-kingdoms, artemis, horologium,
hestia, empire-of-nemract, goose, niflheim, khaos, valhalla, vanir,
cucumber-company, adonis, smtn-elf, avocado-aquarium.

**Wars/events**: coalition-civil-war, the-wipe-of-hackforums, the-federation-dies,
goose-artemis-war, the-great-collapse, valhalla-khaos-war, the-avocado-split,
avicia-sequoia-war, idiot-co-aquarium-war, the-long-raid, aequitas-avicia-war,
aequitas-sequoia-war, first-machine-recorded-alliances.

**Guilds**: the-aquarium, avicia, kingdom-foxes, imperial, hackforums,
titans-valor, aequitas, sequoia, idiot-co, profession-heaven, paladins-united,
fantasy, diamonddeities, the-simple-ones, emorians, shadowfall, libertas.

**Eras**: early-guild-era, federation-era, the-alliance-wars-of-2019,
artemis-goose-era, the-realignment-era, private-diplomacy-era.

**Updates**: the-guild-update, the-economy-update, guild-seasons,
the-diplomacy-update.

**Players**: drew1011, gazthecat, nitrogen2oxygen.

**General**: history-of-wynncraft-guild-warfare (hub), the-forum-megalist,
titan-times, territory-warfare.

Slugs for alliances must be the slugified alliance name exactly
(`council-of-canyon-kingdoms`, `smtn-elf`). War slugs must match the slugified
chronicle event title so the map and timeline auto-link.

## Before finishing

```bash
node scripts/check-article-style.mjs --strict
node scripts/check-citations.mjs --strict
```
