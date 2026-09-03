# data/

Reference data that ships with the repo, as opposed to anything in Postgres.

```
data/
  guild-prefix-overrides.json   guild-name → prefix corrections, written by
                                scripts/resolve-guild-prefixes.cjs

  chronicle/                    source material for the map's Chronicle layer
                                (the alliances and events overlaid on the
                                territory timeline)
    drafts/                     the researched change sets that were reviewed
                                and applied to the chronicle tables; kept as a
                                record of what was proposed and why
    pre2018-territory-snapshots.json
                                recovered guild-leaderboard captures with
                                per-guild territory counts (Sep 2016, Apr 2018
                                and others) — the only pre-2018 territory data
                                that exists anywhere
    research-notes-2020-2026.md  the sourced dossier behind the 2020-2026
                                chronicle entries

  wiki/                         everything behind the Chronicles wiki
    seed-articles.json          every published article, exported from the
                                database. Re-seed or reproduce the whole wiki
                                with scripts/seed-wiki-articles.mjs
    sources/                    the primary-source archive — see its README
    research/
      style-guide.md            voice, rigor and citation rules. Read this
                                before writing or revising any article, and
                                hand it to every drafting subagent
      dossiers/                 research write-ups by period and by source
      analyses/                 investigations that settled a specific question
```

## Conventions

- **The wiki's own content lives in Postgres**; `wiki/seed-articles.json` is an
  export of it, refreshed when articles change and used to rebuild the wiki
  from scratch. Treat the database as authoritative and the file as the backup.
- **`wiki/sources/` is evidence.** Archived pages are never edited by hand —
  they are what our citations point at. Add to it with
  `scripts/source-archive.mjs` and `scripts/media-archive.mjs`.
- **Dossiers record what was found, including dead ends.** A proven negative
  ("no such thread was ever posted") is a result worth keeping, and saves the
  next pass from repeating the search.
- **Analyses record how a question was settled**, with the method and the
  numbers, so a later reader can check the reasoning rather than trusting it.
