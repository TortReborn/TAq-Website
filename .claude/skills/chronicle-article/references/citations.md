# Citations

Every factual claim traces to a source and carries an inline citation. The
citation carries the provenance so the prose never has to — that division of
labour is the whole system.

## Syntax

`{{cite:...}}` renders a numbered superscript linking to a generated reference
list at the foot of the article:

    Federation wiped HackForums' 111 territories in under 12 hours{{cite:thread-237070|post #1, 13 Nov 2018}}.

Forms, in order of preference:

1. **An archived source id** — `{{cite:thread-237070|post #1, 13 Nov 2018}}`.
   Resolves to the real title, URL and capture date from
   `data/wiki/sources/index.json`, and the quoted text is on disk. Always
   prefer this. Find ids with `node scripts/source-archive.mjs list` / `search`.
2. **A URL** we have not archived — `{{cite:https://example.com/x|Page title}}`.
   Better: archive it first with `source-archive.mjs add`, then cite the id.
3. **Free text** only for evidence that cannot be linked at all. These render as
   dead text in the reference list; treat one as a TODO to archive.

Rules:

- The **locator** (after `|`) points at the exact place: `p3 #45`, `post #12`,
  `vol. 6, 12 Oct 2022`. Include it whenever the source is longer than a page.
- Identical citations share a number automatically. A different locator counts
  as a different reference.
- **Cite at the claim** — the marker goes immediately after the sentence or
  clause it supports, not in a lump at the paragraph's end.
- Every paragraph making factual claims carries at least one citation.
- Never hand-write a `## Sources` or `## References` section: the list is
  generated. If you meet one in an old article, convert its entries into inline
  citations and delete it.
- `node scripts/check-citations.mjs --strict` verifies every citation resolves.

## Source tiers — weigh evidence, then cite it silently

Every archived source carries a tier, shown on its reference page and beside the
citation number:

- **primary** — a record made at the time by the people involved: forum posts
  from the era, Discord exports, API captures, the territory log, images.
- **retrospective** — first-person but recalled later: memoirs, oral testimony.
  Often the only witness for a period; memory reorders and rationalises.
- **secondary** — compiled by others afterwards: the community timeline, wikis.
- **derived** — our own datasets and analysis: the chronicle, the map-data
  method.

The tier governs **what you assert**, not what you write about the source:

- Prefer a primary source where one exists. Where a retrospective and a
  contemporaneous record disagree, that disagreement is one of the four cases
  that earns in-text attribution — state both, then move on.
- A claim resting on weak evidence gets a **hedged claim**, not a sourcing
  essay: "the bloc appears to have dissolved in November{{cite:...}}", never
  "map-data analysis suggests the bloc dissolved in November". Hedge the fact,
  not the file. One hedge per claim.
- The reader who wants to know *how* we know clicks the number. The tier label,
  the capture date and the method note are all on the reference page.

## What earns in-text attribution

The four cases, from SKILL.md: opinion or characterisation; genuine source
disagreement; an interested party on their own conduct; direct quotation.
Everything else is stated flatly and footnoted. When a whole article hangs on
one contested account, quarantine that fact in a short `## The record` section
instead of dosing every paragraph.

## In-game "ally" records

The in-game ally system (Diplomacy menu; the machine-captured "X formed an
alliance with Y" broadcasts from June 2026) mainly exists to let guilds run
guild raids together. It is not evidence of a political alliance; in-game
allies may be rivals. Never present an ally record as a bloc, pact,
reconciliation, or side in a war. Where an article uses these records, say what
they are **once** — a sentence or a link to [[first-machine-recorded-alliances]]
— not beside every citation.

## Banned coinages

Internal methodology jargon stays out of articles:

- **"quiet-territory exchanges" / "quiet territories"** — write "territory
  exchanges". The FFA-noise exclusion is explained once, in
  [[territory-warfare]]. Give one number per figure, the FFA-filtered one; do
  not print filtered and unfiltered pairs like "15,710 (21,526 total)".
- "FFA-cluster", "exchange data", "capture log", "the chronicle", "the corpus",
  "the archive" — all research-layer vocabulary. If a sentence needs one of
  these to be true, it is a sentence about our research, and it goes in the
  footnote, the reference page, or nowhere.
