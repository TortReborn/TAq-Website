# Source archive

Primary sources for the Chronicle wiki, fetched once and kept here so that
writing and fact-checking read from disk instead of the network.

Wynncraft's guild history lives on pages that keep disappearing: forum threads
get edited or deleted (the megalist's alliance section was wiped in July 2022),
guild sites go down, and Wayback is slow and frequently blocked from tooling.
Anything we cite should still be readable years from now, and a research agent
should never have to re-fetch what a previous one already read.

## Layout

| Path | What it is |
|---|---|
| `index.json` | Manifest: id → url, kind, title, capture date, checksum. Managed by the script — don't hand-edit. |
| `docs/<id>.md` | Extracted text with frontmatter. This is what you read and grep. |
| `raw/<id>.html.gz` | The original HTML, gzipped, so a better extractor can re-run without re-fetching. |

Ids are readable and stable: forum threads become `thread-237070`, later pages
`thread-278112-p07`, everything else `host-path-slug`.

## Using it

```bash
node scripts/source-archive.mjs add <url> [--kind K] [--note "why this matters"]
node scripts/source-archive.mjs add <url> --wayback 20211128   # nearest capture
node scripts/source-archive.mjs thread 278112                  # every page of a thread
node scripts/source-archive.mjs search "Valkyrie, and Hestia"  # grep the archive
node scripts/source-archive.mjs list --kind forum-thread
node scripts/source-archive.mjs show thread-237070
node scripts/source-archive.mjs verify                         # index ↔ files agree
```

`--wayback` resolves the nearest capture through the availability API, falling
back to a CDX lookup; bare thread numbers are resolved to their canonical slug
URL first, because that is the string the archive indexes.

## Working rule

**Search the archive before reaching for the web.** If a source isn't here, fetch
it with `add` so the next person doesn't have to. Add a `--note` saying what the
source establishes — that is what makes the manifest browsable later.

Forum-thread extraction preserves per-post attribution:

```
### post #45 — Slayne — Nov 14, 2018 at 2:07 AM
```

which is the unit our articles cite ("thread 237070 p3 #45"). Extraction is
best-effort; when a page looks mangled, the gzipped original is right there.

### Caveats when citing

- **Post dates on edited posts are the LAST-EDIT date, not the original.** XenForo
  shows one timestamp, and for a post edited in place (guild recruitment OPs are
  edited for years) that is the edit date. Verified on several threads: an OP
  opened in April 2019 can carry a December 2021 stamp. So date a claim by the
  thread's own context or by the Wayback capture, and when an OP's state matters,
  cite a dated capture (`--wayback`) rather than the live page.
- **Some evidence lives in the HTML, not the text.** Forum guild badges and user
  titles under an author's name are markup, so they do not appear in the extracted
  text. The gzipped original in `raw/` still has them.
- A capture and the live page are separate entries; cite the one you actually read.

## Source tiers

Each entry carries a `tier`, shown on its reference page and beside citations so
a reader can weigh a claim without opening the source:

| tier | meaning |
|---|---|
| `primary` | Made at the time by the people involved — era forum posts, Discord exports, API captures, the territory log. |
| `retrospective` | First-person but recalled later — memoirs, oral testimony. |
| `secondary` | Compiled or curated by others afterwards — community timelines, the game wiki. |
| `derived` | Our own records, datasets and analysis. |

The tier follows from the source's kind, with a short list of deliberate
exceptions — a first-person account written years after the events is
retrospective even though its author was present. Prefer primary evidence; where
a retrospective or derived source is the only one, the article must say so.

## Scope

Public pages only, stored for citation and preservation of a game community's
own history. Fetches are sequential and rate-limited.
