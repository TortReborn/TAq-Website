# TAQ-59: Woealer storage pages

Status: **implemented** 2026-08-08. Schema applied to the TortReborn Neon DB (tables ship empty — exec populates through the UI). Open questions resolved 2026-08-08 (see §11).

Shipped in:
- [sql/create_woealer_pages.sql](../../sql/create_woealer_pages.sql) — schema
- [lib/woealer.ts](../../lib/woealer.ts) — shared loader + types
- [app/api/exec/woealer/route.ts](../../app/api/exec/woealer/route.ts), [pages/[id]](../../app/api/exec/woealer/pages/%5Bid%5D/route.ts), [slots/[id]](../../app/api/exec/woealer/slots/%5Bid%5D/route.ts) — API
- [app/exec/inventory/WoealerPanel.tsx](../../app/exec/inventory/WoealerPanel.tsx) — UI
- [app/exec/inventory/WynnIcon.tsx](../../app/exec/inventory/WynnIcon.tsx) — masked Wynncraft button textures
- [app/exec/inventory/page.tsx](../../app/exec/inventory/page.tsx) — tab wiring + "stock" → "inventory" copy fix
- [lib/woealer.test.ts](../../lib/woealer.test.ts) — reorder + slug unit tests

Deviations from the spec below, agreed during implementation:
- The tab sits **after** Recipe archive, not between Materials and it.
- Slot and page reordering is **drag-and-drop inside an "Edit slots" mode**, with up/down buttons kept as the keyboard and touch fallback. Outside edit mode the table is read-only, so the default view stays clean.
- Close and reorder controls use Wynncraft button textures (`cancel`, `arrow-up`, `arrow-down`) applied as CSS masks so they inherit `currentColor`; the inventory page's own close buttons were switched over too, so the two don't clash.
- The page body sits on a translucent glass surface for readability over the ocean background.
Ticket: TAQ-59 (`tracker_tickets.id = 59`), type `feature`, system `website`, priority `medium`, status `in_progress`.
Submitted by Discord id `589025838578663434`, assigned to Discord id `500332699928494100`.

## 1. Ticket, verbatim

> rename "stock" to inventory (both in sidebar and header) (already done)
> add another page thats just Woealer (current pages are Ingredients, Consu, archive).
> Like the shit in taq data sheet but on the website so i can finally retire this fucking sheet.
> ^ make so that ppl can search items/ings/etc. and be able to find where it is on woealer (so like. Exactly like the sheet. What the sheet does)
> doesnt need to be auto updatable since that sounds like a lot of work. it can even just be a literal sheet slapped onto the website. tyvm <3

**The rename is already shipped** in the sidebar, header, and route (`/exec/inventory` — see [lib/exec-nav.ts:57](../../lib/exec-nav.ts#L57) and [app/exec/inventory/page.tsx](../../app/exec/inventory/page.tsx)). Two incidental leftovers still say "stock" — the search placeholder ([page.tsx:959](../../app/exec/inventory/page.tsx#L959)) and a form field label ([page.tsx:1316](../../app/exec/inventory/page.tsx#L1316)). Confirmed with the requester: fold that one-line cleanup into this PR.

Everything below is the "add a Woealer page" half of the ticket, which is the actual remaining work.

## 2. Domain glossary

- **Woealer**: a Minecraft alt account the guild uses purely as shared storage (`sql/create_externals_and_alliances.sql:45`: *"Consumable and ingredient storage account."*). Its account-wide bank (21 pages) holds the "current" consumables; its character slots each hold an overflow category.
- **"Class"**: a Wynncraft character slot on the Woealer account. Each class has its own separate small bank, independent of the account-wide bank — the guild uses each slot as a themed extra storage bucket rather than as an actual character build. `bank_page` values like `D4` on existing inventory items already point at these (see the column comment on `inventory_items.bank_page` in [sql/create_management_inventory.sql:300-301](../../sql/create_management_inventory.sql#L300-L301), and the existing "Bonus Consu class" reference at line 288).
- **The sheet**: the `Woealer` tab in `TAq Data.xlsx` (screenshot the ticket references). It's one big reference table: one column per class (plus one for the shared account bank), each column a numbered list of "what's stored in slot N of this class."

## 3. What the sheet contains, and what's in scope

Transcribed from `TAq Data.xlsx`, sheet `Woealer`, `A1:Z26`. Two column groups, matching the sheet's own banner cells (`B4: "Accessible by whole account"`, `G4: "Character Banks"`). Kept here as historical reference only — per §11.3 this does **not** get seeded, exec repopulates by hand through the new UI.

**Account** (shared, account-wide bank — 21 numbered pages):
1. scrolls, money, etc. · 2. Fairy Pot · 3. Mr Pot · 4. Serpent Pot · 5. Str Pot · 6. RGB Pot · 7. WD Pot · 8. Plant Pot · 9. Str Scroll · 10. Int Scroll · 11. Def Scroll · 12. Agi Scroll · 13. Mr Scroll · 14. RGB Scroll · 15. Pris Scroll · 16. Dual Food · 17. SD Food · 18. Str Int Food · 19. Str Food · 20. JH Food · 21. HP Food

**Misc Bucket** (1 slot): 1. Ingredients

**Equipment** (12 slots): 1. War mythics · 2. Other mythics · 3. Armor mythics · 4. ??? mythics · 5. Rare unid · 6. Other unid · 7. Unid Delirium · 8. Fabled · 9. Crafted named · 10. Crafted unnamed + xp · 11. Leg + set · 12. Rare + unique

**Misc stuff** (7 slots): 1. raid rewards · 2. powders, tokens, etc. · 3. prof tools · 4. quest/festival items · 5. obsolete · 6. tp scrolls · 7. notg ing bags

**Dry consu** (7 slots): 1. Farcor + HE Pot · 2. Collo Pot · 3. Bat Pot · 4. HE Food · 5. Mr Food + Ms Pot · 6. Twisted Food · 7. -tier Food

**Bonus consu 1** (12 slots): 1. other consu · 2. str scroll 1 · 3–4. *(empty)* · 5. dmg + xp scroll · 6. catmr + thorns · 7. wisdom · 8. hp fire 1 · 9. hp fire 2 · 10. spd + wdef · 11. hp fire 3 · 12. wisdom + xp pot

**Bonus consu 2** (12 slots): 1. def scroll 1 · 2. def scroll 2 · 3. def scroll 3 · 4. def scroll 4 · 5. def scroll 5 · 6. def scroll 6 · 7. def scroll 7 · 8. *(empty)* · 9. dex scroll 1 · 10. Ms sc, food (mana steal scroll + mana steal food) · 11. RGB Food · 12. RHB pot

**Bonus consu 3** (3 slots): 1. agi scroll 1 · 2. agi scroll 2 · 3. agi scroll 3

Plus the yellow instruction banner at the top of the sheet: *"To find an ingredient, ctrl+F and search for the exact item name. All currently used consus are in the account bank."* — this is exactly the kind of thing the "notes / page documentation" field in the ask is for.

**Out of scope, confirmed dropped**: the sheet also has `Ingredients I`, `Ingredients II`, and `Materials` columns. These are **not** becoming Woealer sub-pages — the live Inventory page already has real Ingredients and Materials tabs sitting right next to where Woealer lives, and a second, unscanned, manually-kept copy of near-identical categories would just be confusing. Woealer ships with **8 pages**: Account, Misc Bucket, Equipment, Misc stuff, Dry Consu, Bonus Consu 1, Bonus Consu 2, Bonus Consu 3.

## 4. Goals

- Reimplement the sheet's Woealer tab as a page on the site, so exec can stop maintaining the Google Sheet.
- Content is **manually authored**, not derived from `inventory_items` / scans. No reconciliation, no live counts. It's a hand-kept map of "what's in slot N of class X," same as the sheet.
- The set of pages is **not hardcoded to the 8 above** — exec can add, rename, reorder, and remove pages as the guild's storage layout changes, the same way they already manage inventory categories and scan profiles today.
- Search across all pages by item/ingredient name, replicating the sheet's "ctrl+F" instruction — the actual feature the ticket cares about, not just a static display.
- Per-page freeform notes for anything that doesn't fit the numbered-slot model (the instruction banner, caveats, etc.), not auto-updated, purely manual documentation.

## 5. Non-goals

- No linkage to `inventory_items`, `inventory_scans`, or the scan-profile pipeline. This is intentionally the "unscanned, manually kept" counterpart to the rest of the Inventory page.
- No validation that slot contents match reality — it's a reference sheet, same trust model as the spreadsheet it replaces.
- No per-item structured data (quantities, textures, links). A slot is just a label + a text blob, like a spreadsheet cell.
- No `Materials` / `Ingredients I` / `Ingredients II` pages — dropped, see §3.

## 6. Placement

Add a fifth top-level tab to the existing Inventory page tab bar ([page.tsx:937-954](../../app/exec/inventory/page.tsx#L937-L954)):

`Ingredients | Consumables | Materials | Woealer | Recipe archive (N)`

Reasoning: the ticket explicitly frames it as "another page" alongside "Ingredients, Consu, archive" — i.e. a new `View` value inside the same `/exec/inventory` route, not a new sidebar entry. Keeps the rest of the page chrome (header, stats bar, scan strip) as-is; those don't really apply to Woealer and can be conditionally hidden when `view === 'woealer'`.

## 7. UX

Within `view === 'woealer'`:

- **Sub-tab strip**, one chip per page, grouped into two clusters matching the sheet's two banner cells: "Account-wide" and "Character banks" (a `shared` boolean on the page drives which cluster it renders in). `+ Add page` at the end of the strip, visible to Narwhal+ only (§10).
- **Notes panel** above the slot table: the current page's freeform text (rendered, not auto-formatted — plain text/line breaks is enough, no need for markdown). Empty by default; an "Edit notes" button (Narwhal+ only) opens a textarea. This is where the "ctrl+F" banner text or any per-page caveat lives.
- **Slot table**: `Bank page` (label) · `Contents`. Read-only by default; Narwhal+ get an "Edit slots" toggle that reveals a drag handle, up/down buttons, Edit, and Delete per row. Labels are free text (not auto-incrementing ints) so `D1`–`D9`-style markers still work.
- **Search box**, scoped to the Woealer tab, searching `contents` (and `label`) across *all* pages, not just the active one — this is the actual "find where it is on Woealer" feature the ticket asks for. Results show `Page name — slot label: contents…`; clicking a result switches to that page's sub-tab and scrolls/highlights the row. Reuse the existing `search` state if it's cleanly separable per-view, otherwise a dedicated `woealerSearch` state — either is fine, just don't let it silently filter across the other four tabs too.
- Manage-pages affordance (add/rename/reorder/archive/delete, Narwhal+ only) as its own small modal, mirroring "Manage categories" ([page.tsx:866-927](../../app/exec/inventory/page.tsx#L866-L927)).
- Non-Narwhal+ exec members get read-only view + search, same "You can add inventory items…" style note as the rest of this page ([page.tsx:1071-1073](../../app/exec/inventory/page.tsx#L1071-L1073)) adjusted to say they can't edit Woealer at all.

## 8. Data model

New tables, `sql/create_woealer_pages.sql`. No seed `INSERT`s — ships empty, per §11.3.

```sql
-- Manually maintained "Woealer" storage reference pages — reimplements the old
-- Google Sheet's "Woealer" tab (TAq Data.xlsx). Not linked to inventory_items;
-- nobody scans this, exec just keeps it honest by hand. See TAQ-59.

CREATE TABLE IF NOT EXISTS woealer_pages (
  id         BIGSERIAL   PRIMARY KEY,
  name       TEXT        NOT NULL,            -- e.g. "Dry Consu", "Bonus Consu 1", "Account"
  slug       TEXT        NOT NULL UNIQUE,
  shared     BOOLEAN     NOT NULL DEFAULT FALSE, -- true = account-wide bank, false = a character-slot class
  notes      TEXT        NOT NULL DEFAULT '',  -- freeform page documentation
  sort_order INT         NOT NULL DEFAULT 0,
  archived   BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS woealer_slots (
  id         BIGSERIAL   PRIMARY KEY,
  page_id    BIGINT      NOT NULL REFERENCES woealer_pages(id) ON DELETE CASCADE,
  label      TEXT        NOT NULL,             -- "1", "12", "D4" — free text, not an int
  contents   TEXT        NOT NULL DEFAULT '',
  sort_order INT         NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_woealer_slots_page ON woealer_slots(page_id, sort_order);
```

No search index beyond a plain `ILIKE` — total row count will stay in the low hundreds, same order of magnitude as `inventory_items` today.

## 9. API

Mirror the existing `/api/exec/inventory` conventions ([app/api/exec/inventory/route.ts](../../app/api/exec/inventory/route.ts), `requireExecSession` + `isNarwhalRank` from `lib/exec-auth.ts`, `getPool` from `lib/db.ts`). Unlike `/api/exec/inventory` (where any signed-in exec member can add items), **every mutating endpoint below requires Narwhal+** — see §10.

- `GET /api/exec/woealer` → `{ pages: [...], slots: [...] }` — any exec session.
- `POST /api/exec/woealer` → action-based body, matching the pattern already used by `/api/exec/inventory` (`reorder`, `createCategory`, etc.):
  - `createPage { name, shared }`
  - `reorder { entity: 'page' | 'slot', ids }`
  - `createSlot { pageId, label, contents }`
- `PATCH /api/exec/woealer/pages/[id]` → `{ name, notes, shared }`
- `DELETE /api/exec/woealer/pages/[id]` → hard delete (slots cascade); no archive-vs-delete distinction needed since there's no dependent data to orphan, unlike inventory categories which gate deletion behind a replacement category.
- `PATCH /api/exec/woealer/slots/[id]` → `{ label, contents }`
- `DELETE /api/exec/woealer/slots/[id]`

## 10. Permissions

**Narwhal+ gated for everything that writes** (`NARWHAL_RANKS` = Narwhal / Hydra / Hydra-Leader) — both page structure (add/rename/reorder/delete pages) and slot content edits (add/edit/delete/reorder slots, edit notes) use the same gate as "Manage categories" already uses today. Any other signed-in exec member gets read-only access: view all pages, use search. Confirmed with the requester — this diverges from the rest of `/exec/inventory`, where any exec member can add items.

## 11. Decisions (confirmed 2026-08-08)

1. **Bonus Consu 2 slots 8–12 confirmed real** (not a stray table): slot 9 `dex scroll 1`, slot 10 `Ms sc, food` (mana steal scroll + mana steal food), slot 11 `RGB Food`, slot 12 `RHB pot`. Folded into §3.
2. **Permissions**: Narwhal+ gated for both page structure and slot-content edits — §10.
3. **No seed migration.** Ships with an empty `woealer_pages`/`woealer_slots` — exec creates the 8 pages and populates slots by hand through the UI once it's live. §3's transcription is kept as reference only, not loaded as data.
4. **`Materials`, `Ingredients I`, `Ingredients II` dropped** from the Woealer feature — redundant next to the live Inventory tabs of (almost) the same name. Woealer ships with 8 pages.
5. **Leftover "stock" copy** (search placeholder, form label) gets renamed to "inventory" as part of this PR.
