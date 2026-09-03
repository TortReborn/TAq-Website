# Source archive

Primary sources for the Chronicles wiki, fetched once and kept here so that
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

## Scope

Public pages only, stored for citation and preservation of a game community's
own history. Fetches are sequential and rate-limited.
