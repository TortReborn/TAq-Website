# Chronicles Wiki — design plan

A Wikipedia-style guild-history system for the-aquarium.com: a new public
**Chronicles** tab covering the history of Wynncraft's guild scene — guilds,
alliances, players, wars, game updates, eras — cross-linked like a wiki,
admin-driven with community suggestions, with image support and full markdown.

Status: PLAN (nothing implemented). Decisions marked ⚖ need sign-off.

---

## 1. Principles

1. **Admin-driven, community-assisted.** Execs author and approve; any linked
   guild account can suggest edits or new pages through the same
   submission-queue pattern the map chronicle already uses (`chronicle_submissions`
   is the proven template — queue doubles as audit log).
2. **The wiki wraps the data, not the other way around.** We already hold
   machine-readable history: 22 alliances / 228 membership stints / 36 events,
   3.2M+ territory exchanges, pre-2018 snapshots, and a sourced research corpus.
   Wiki pages should EMBED this live data (membership tables, war charts, map
   deep links) rather than duplicate it as prose that rots.
3. **Everything is a page; pages are typed.** One rendering system; the type
   drives the infobox and category placement, nothing else.
4. **Revisions are sacred.** Every published change is a stored revision with
   author + note; diffs and rollback come free. Same philosophy as the map
   chronicle's approve-queue-as-audit-log.

## 2. Content model

### Page types

| type | examples | infobox fields (JSONB, type-specific) |
|---|---|---|
| `guild` | The Aquarium, HackForums | prefix/tag, created date, status (active/disbanded/renamed→link), successor/predecessor, notable leaders (player links), linked chronicle alliance memberships (AUTO) |
| `alliance` | The Federation, smtn elf | kind (war/community), span, member list (AUTO from chronicle_alliances via `allianceRef`), successor/predecessor |
| `player` | Drew1011, Salted | known IGNs, guilds led/founded, active era |
| `war` | Idiot Co–Aquarium war | belligerents, dates, outcome, linked chronicle event (AUTO chart embed) |
| `update` | Rekindled World, Gavel | release date, version, guild-relevant changes |
| `era` | The Federation Era (2018) | date range, defining powers, timeline section anchor |
| `general` | Guild Seasons, FFA territories, the Timeline article | freeform |

### Tables (all lazy-migrated like `ensureChronicleTables`)

```sql
chronicle_pages (
  id            SERIAL PRIMARY KEY,
  slug          VARCHAR(80) UNIQUE NOT NULL,   -- kebab-case, flat namespace
  title         VARCHAR(120) NOT NULL,
  page_type     VARCHAR(16) NOT NULL,          -- guild|alliance|player|war|update|era|general
  summary       VARCHAR(500) NOT NULL DEFAULT '',   -- the lede, shown in search/hover cards
  infobox       JSONB NOT NULL DEFAULT '{}',
  body          TEXT NOT NULL DEFAULT '',      -- markdown (current approved revision, denormalized)
  status        VARCHAR(12) NOT NULL DEFAULT 'published',  -- published|draft|archived
  search_tsv    tsvector GENERATED ALWAYS AS (...) STORED, -- title+summary+body full-text
  created_by    VARCHAR(30) NOT NULL,
  created_at / updated_at TIMESTAMPTZ
)

chronicle_page_revisions (
  id, page_id FK CASCADE, rev_number INT,
  title, summary, infobox, body,               -- full snapshot per revision
  author_id VARCHAR(30), author_name VARCHAR(60),
  note VARCHAR(300),                            -- edit summary, wiki-style
  created_at TIMESTAMPTZ
)

chronicle_page_submissions (                    -- mirrors chronicle_submissions exactly
  id, target_page_id NULL,                      -- NULL = new-page proposal
  payload JSONB NOT NULL,                       -- {slug,title,page_type,summary,infobox,body}
  note, status pending|approved|rejected,
  submitted_by/name/at, reviewed_by/note/at
)

chronicle_page_links (from_page_id FK, to_slug VARCHAR(80))
  -- recomputed on every save: powers backlinks ("What links here") and
  -- red-link detection (links to nonexistent slugs render red = create prompt)

chronicle_images (
  id, url TEXT, filename, mime, bytes, width, height,
  caption VARCHAR(300), uploaded_by, created_at,
  status VARCHAR(12) DEFAULT 'active'           -- active|orphaned|removed
)

chronicle_redirects (from_slug UNIQUE, to_page_id FK)  -- renames never 404
```

## 3. Markdown dialect

Base: **GitHub-flavored markdown** via `react-markdown` + `remark-gfm`,
`rehype-sanitize` (no raw HTML — suggestions are untrusted input).

Extensions (one small custom remark plugin):

- `[[The Federation]]` / `[[the-federation|the Fed]]` — wiki links. Resolved
  against slugs + redirects; unresolved links render red and (for execs) link
  to the create-page form pre-filled.
- `![caption](img:123)` — site-hosted image by id (also plain URLs allowed for
  execs only). Rendered with caption, click-to-lightbox, `sharp`-generated
  responsive sizes.
- Data directives (server-rendered embeds — the wiki's superpower):
  - `{{alliance:Goose}}` → live membership table + colored timeline band from
    chronicle_alliances (single source of truth; edits there update every page)
  - `{{war-chart:Aequitas:Avicia:2025-11-03:2025-12-21}}` → weekly exchange
    chart from territory_exchanges (the same quiet/hot analysis used in research)
  - `{{map:2019-07-17}}` → thumbnail + deep link to /map/history/chronicle at
    that instant (the scrubber-jump infra already exists)
  - `{{timeline:2018}}` → an inline slice of the master timeline
  - `{{infobox}}` is NOT a directive — infobox is structured data on the page row
- Footnote-style citations (`[^1]`) via remark-gfm footnotes; the research
  corpus gives us real sources to cite from day one.

## 4. Public UI — `/chronicles`

- **`/chronicles`** (landing): hero search bar; featured article (exec-pinned);
  "On the timeline" strip (nearest events to today's date in history); category
  index (Guilds / Alliances / Players / Wars / Updates / Eras); recent changes
  feed (from revisions).
- **`/chronicles/[slug]`** (article): Wikipedia-familiar layout —
  title + summary lede; right-rail infobox (type-driven); auto-generated TOC
  from headings; body; footer with categories, "What links here", last-edited
  attribution, and **Suggest an edit** / **View history** buttons.
  Flat namespace ⚖ (like Wikipedia) — `the-federation`, `drew1011`,
  `rekindled-world`; disambiguate in the slug when needed (`terra-alliance`).
- **`/chronicles/[slug]/history`**: revision list with authors + edit notes;
  side-by-side diff of any two revisions; exec-only rollback button.
- **`/chronicles/timeline`**: the master timeline — a vertical, year-grouped,
  era-sectioned scroll built from THREE merged streams: chronicle_events (map
  layer), alliance spans, and dated wiki pages (wars/updates/eras). Every entry
  links to its article; era headers link to era pages; each year links to the
  map at that moment. This page IS the "general timeline" requirement.
- **Search**: header search box → Postgres full-text (`search_tsv`) + prefix
  match on titles; grouped results by page type.
- Nav: new top-level **Chronicles** tab between Map and Lootpools.

## 5. Editing & moderation flows

**Execs** (role `exec`, existing auth):
- Direct create/edit with live split-pane preview (textarea + rendered pane —
  no heavyweight editor dependency ⚖). Every save = revision + self-approved
  submission row (identical convention to the map chronicle's direct edits).
- Rename = slug change + auto-redirect row. Archive instead of delete
  (revisions retained); hard delete exec-only with audit snapshot.
- Image library: upload (drag/drop), browse, caption, see usage, remove.

**Linked guild accounts** (existing `requireGuildSession`):
- "Suggest an edit" opens the same editor seeded with current content; submit
  goes to the pending queue (cap: 5 pending per user, same as map chronicle).
- "Suggest a page" for red links / new topics.
- Suggested images: uploadable at suggest time but quarantined (`status` on
  chronicle_images) until the submission is approved.

**Review queue** (new "Wiki" tab on `/exec/chronicle`, alongside the map-data queue):
- Pending list → click-through to a **rendered diff** (current vs proposed,
  side-by-side + inline word diff) → approve (materializes revision) / reject
  with note. Approve-with-tweaks = exec edits the payload inline first.

## 6. Images

- ⚖ **Storage: Vercel Blob** (recommended — we deploy on Vercel; no new vendor,
  token-based, CDN-served). Alternative: Cloudflare R2 (cheaper at scale, more
  setup). DB-stored bytes: rejected (Neon size/cost).
- Upload endpoint: exec direct + suggester-quarantined. Server-side `sharp`
  pipeline (already a dependency): strip EXIF, cap at 1920px, emit webp +
  original, record dimensions. Limits: 5 MB/file, png/jpg/webp/gif.
- Every image gets a stable `img:id` reference so pages survive URL churn.
- Day-one library seeds: the 2016 territory-map screenshots, the community
  timeline image, war screenshots from Discord.

## 7. Integration with existing systems

- Map chronicle events gain an optional `page_slug` — timeline pills and panel
  entries link "Read more →" into the wiki; wiki war pages link back to the
  map at their start date. Alliances likewise (band tooltip → article).
- Guild infoboxes pull live prefix/created/level via the existing Wynncraft
  API caching patterns; alliance infoboxes pull from chronicle_alliances.
- Seeding: the research corpus (chronicle-research-notes, the draft JSONs with
  provenance, Federation Tribute, Cameron's testimony, pre-2018 snapshots)
  converts into ~30 well-cited starter articles + the era structure
  (2015-2017 Ancients / 2018 Federation / 2019 Luna-Terra / 2020 Goose-Artemis /
  2021 Valhalla-Khaos / 2022-23 Cucumber-smtn elf / 2024+ Modern).

## 8. Phasing

- **Phase 1 — the wiki core**: schema + lazy migration; article rendering
  (GFM + wikilinks + infobox + TOC); `/chronicles` landing, article page,
  master timeline v1 (events+alliances+pages merged); exec direct create/edit
  with revisions + history/diff view; full-text search; nav tab.
- **Phase 2 — community + media**: suggestion queue with rendered diffs on the
  exec Wiki tab; image upload/library (storage decision applied); quarantine
  flow; red links; backlinks; redirects.
- **Phase 3 — the data embeds**: `{{alliance}}` / `{{war-chart}}` / `{{map}}`
  directives; map↔wiki cross-links; featured-article rotation; category pages;
  recent-changes RSS if desired.
- **Content phase** (parallel from Phase 1): seed the starter articles from the
  research corpus, migrate alliance notes into cited article prose.

## 9. Decisions (locked 2026-09-02)

1. **Image storage: Vercel Blob.** ✔
2. **URL namespace: flat `/chronicles/[slug]`.** ✔ Typed listings come from
   `page_type` category pages, not the URL.
3. **Editor: bespoke split-pane** (textarea + toolbar + live preview). ✔
4. Player pages in v1: **yes**, public game identities only (default; flag if
   objection).
5. Suggestion permission: **linked guild account required** (matches the map
   chronicle; default).
