# Citations and sources

## Why prose can stay clean without losing rigour

Every reference already displays its **tier badge** and links to the archived
copy, the original URL and the capture date. A reader who wants to know how good
a claim is can see it in one glance at the reference list. Repeating that inside
the sentence is duplication, and it is what made the corpus hard to read.

So: **the apparatus carries provenance; the prose carries history.** Rigour is
unchanged — every claim still traces to a source, and nothing is invented.

## Syntax

    Federation wiped HackForums' 111 territories in under 12 hours{{cite:thread-237070|post #1, 13 Nov 2018}}.

Forms, in order of preference:

1. **An archived source id** — `{{cite:thread-237070|post #1, 13 Nov 2018}}`.
   Resolves to the real title, URL and capture date from
   `data/wiki/sources/index.json`. **Always prefer this.**
2. **A URL** we have not archived — `{{cite:https://example.com/x|Page title}}`.
   Better: archive it first, then cite the id.
3. **Free text**, for unlinkable evidence — `{{cite:territory_exchanges map-data analysis}}`.

Rules:

- The **locator** after `|` points at the exact place: `p3 #45`, `post #12`,
  `vol. 6, 12 Oct 2022`. Include it whenever the source is longer than a page.
- **Cite at the claim**, immediately after the sentence or clause it supports —
  never lumped at the end of a paragraph.
- Identical citations share a number automatically. A different locator counts as
  a different reference.
- Every paragraph making factual claims carries at least one citation.

## Tiers

| Tier | What it is |
|---|---|
| **primary** | Made at the time by the people involved: era forum posts, Discord exports, API captures, the territory log, contemporaneous images. |
| **retrospective** | First-person but recalled later: memoirs, oral testimony, accounts written years afterwards. |
| **secondary** | Compiled by others afterwards: community timelines, fan wikis. |
| **derived** | Our own datasets and analysis: the chronicle, map-data method. |

**Prefer a primary source where one exists.** Where a retrospective account and a
contemporaneous record disagree, the contemporaneous one carries more weight —
but check it, because a dated record can be attached to the wrong event (see
`data/wiki/research/analyses/federation-map-control.md`).

When sources disagree and it matters, **that disagreement is content**: state
both, attributed. That is one of the four cases where prose attribution stays.

## Handling weak evidence

Weak evidence does not need a prose disclaimer on every sentence. It needs the
right verb and an honest scope.

Uncontested claim resting on a memoir — no disclaimer; the retrospective badge on
the reference says the rest:

    The guild was expelled in March.{{cite:drew1011-storytime|part 17}}

Contradicted by a contemporaneous record — both go in, and the conflict is the
content:

    Drew1011 recalled an expulsion vote on 30 March; the guild continued to trade
    territory with Federation members until November.

Map inference stays visible in prose, because it is our own reasoning rather than
a witness: "Map-data analysis places the collapse in early November."

## The in-game "ally" feature is not a political alliance

Wynncraft's Diplomacy menu, and the "X formed an alliance with Y" broadcasts
captured from June 2026, are **a game-mechanical convenience that lets guilds run
guild raids together**. Guilds that are in-game allies may be rivals, and may have
recently fought each other.

These records are seductive — dated, verbatim, machine-made, and arriving exactly
as the written record goes quiet. Therefore:

- Never present one as a bloc, pact, reconciliation, or a side in a war.
- Whenever one is cited, say what it is in the same breath: "an in-game ally
  registration, a relationship used chiefly to permit joint guild raids".
- Keep them clearly separate from the chronicle's war and community alliances,
  which are far stronger evidence.

This is the one place where a standing prose gloss is required, because the
record's plain wording actively misleads.

## Never publish

- Real-life photographs, personal contact details, Discord discriminators, or
  in-game names paired with contact information.
- Private-channel content about named individuals.
- Real-world political content.

Such material stays in the archive as evidence, marked `excluded` with a reason;
web derivatives are deleted. Player articles carry public in-game and forum facts
only.
