# TAQ-62: Inventory sorting, editor grants & readability

Status: **implemented** 2026-08-08, uncommitted. `inventory_editors` applied to the TortReborn Neon DB (ships empty — narwhals grant through the UI).

Deviations from the spec below, decided during implementation:
- `POST /api/exec/inventory/textures` was already open to *any* exec session, not narwhal-only, so it stays as it is. Uploading a texture is part of the "add an item" flow that everyone with exec access already has.
- The **Scan profiles** button moved from `canEdit` to `canManageEditors` (narwhal). It always opened a narwhal-only modal; leaving it on `canEdit` would have shown grantees a panel whose every action 403s.

Ticket: TAQ-62 (`tracker_tickets.id = 62`), type `feature`, system `website`, priority `medium`, status `in_progress`.
Submitted by and assigned to Discord id `500332699928494100`. Six follow-up comments (`tracker_comments.id` 32–37) widen it well past the title.

## 1. Ticket, verbatim

Title: **Stock page**

> Idea for the stock page, being able to sort the table by inventory amount, would be a cool feature to be able to order the list by a few options

Comments, in order:

1. (#32) *Add functionality for narwhals to give people edit / add item access for inventory*
2. (#33) *reorder 2 of the columns, target and reserve, so inventory and target amount can be compared more easily*
3. (#34) *change reserve color to a more yellow ish color*
4. (#35) *Add colors for roles (healer, dps, tank etc, pull from Tort Reborn snipe logic stuff)*
5. (#36) *Add a darkened glass background to the whole inventory list because reading hard*
6. (#37) *reserve to grey not yellow\**

Note "stock page" is the old name for [/exec/inventory](../../app/exec/inventory/page.tsx) — renamed in TAQ-59. Comment #37 supersedes #34: the reserve column goes **grey**, not yellow. It is already yellow (`#fcd34d`) today, so #34 was a no-op and only #37 is actionable.

## 2. Scope

Six independent changes to the Inventory page. Five are small; the editor grant (#32) is the real feature.

| # | Change | Surface |
| - | ------ | ------- |
| A | Sort dropdown for the item list | client only |
| B | Per-user inventory editor grants | new table, new API, auth change |
| C | Column order: Inventory → Target → Reserve | client only |
| D | Reserve numbers grey | CSS |
| E | Role colors from the snipe palette | client + CSS |
| F | Darkened glass surface behind the list | CSS |

Out of scope: the Woealer tab's own layout (TAQ-59, shipped), sorting on the Woealer tab (it is a hand-ordered map — order *is* the data), and any change to the scan/upload pipeline.

## 3. A — Sorting

**Decision: a "Sort by" dropdown next to the search box**, not clickable headers. The list has a curated manual order (`inventory_items.sort_order`, reorderable with ↑/↓ by editors) that must stay the default and stay reachable, and two of the useful sorts ("furthest below target", "below target first") are composite and don't map to a single column.

Options:

| Value | Label | Comparator |
| ----- | ----- | ---------- |
| `manual` | Manual order | `sort_order` — the default, current behaviour |
| `quantity_desc` | Inventory (high → low) | `quantity` desc |
| `quantity_asc` | Inventory (low → high) | `quantity` asc |
| `deficit` | Furthest below target | `desired - quantity` desc; items with no target sort last |
| `target_desc` | Target (high → low) | `desired_quantity` desc, nulls last |
| `reserve_desc` | Reserve (high → low) | `reserve_quantity` desc — **consumables view only** |
| `name_asc` | Name (A → Z) | `name`, `localeCompare` |
| `name_desc` | Name (Z → A) | reverse of the above |
| `updated_desc` | Recently updated | `updated_at` desc |

Rules:

- Ties fall back to manual order, so the list never reshuffles arbitrarily.
- The dropdown sits in `.controlActions` next to Search, and is hidden on the Woealer tab (as Search already is).
- Sort state is **not** reset when switching tabs (unlike filters, which are view-specific). If the active option isn't valid for the new view (`reserve_desc` outside Consumables) it falls back to `manual`.
- **Materials** are displayed grouped by family (T1/T2/T3 in one row). Sorting is applied to the *groups*, using the group totals already computed for display: summed quantity, summed target, `min(updated_at)`→ actually latest `updated_at` across tiers, and `baseName` for name sorts. This means the grouping must happen before the sort, not after — today `visibleMaterialGroups` is built from the already-sorted list.
- The Recipe archive view keeps the sort dropdown; `quantity`/`target` sorts are meaningless there (archiving zeroes both) but harmless, and name/updated sorts are useful.
- Sorting is pure client-side over the already-loaded list. No API change, no pagination interaction (there is none).

## 4. B — Per-user editor grants

Today the page has exactly two tiers, both derived from rank:

- **Anyone with exec access** (Hammerhead+, `EXEC_RANKS`): can view and can **create** items (`canAddItems`, and the `createItem` escape hatch in the POST route).
- **Narwhal+** (`NARWHAL_RANKS`): everything else — edit, archive, delete, categories, reorder, scan profiles, all Woealer writes.

The ask is for narwhals to hand the second tier to a named individual without promoting them.

**Model: a per-user grant list.**

```sql
CREATE TABLE inventory_editors (
  discord_id     BIGINT      PRIMARY KEY,
  granted_by     BIGINT      NOT NULL,
  granted_by_ign TEXT        NOT NULL,
  note           TEXT        NOT NULL DEFAULT '',
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- Keyed on `discord_id` (stable across IGN changes); `ign` is joined from `discord_links` at read time so a rename can't stale the list.
- A grant is a single flag, not split add/edit. It means "treat this person as a narwhal **for the Inventory page**": items, categories, reorder, and the Woealer tab.
- It does **not** grant: scan profiles (they configure the mod's scan pipeline) or the editor list itself. Those stay narwhal-only, so a grantee can't escalate.
- The grant is meaningless for someone below Hammerhead — they can't reach `/exec` at all — so the grant UI only offers exec-rank members as candidates, and a stale grant on a demoted member is inert (the session check fails first).
- Revoking is a hard delete. Grants are cheap to re-add and the audit value is low; `granted_by_ign` covers "who let this person in".

Server:

- `lib/inventory-access.ts` — `canEditInventory(session)`: `isNarwhalRank(session.rank) || <row exists>`; `requireInventoryEditorSession(request)` mirroring `requireNarwhalSession`; `listInventoryEditors(pool)` joining `discord_links`.
- `GET /api/exec/inventory` gains `permissions: { canEdit, canManageEditors }` so the client stops deriving `canEdit` from the rank string it happens to hold. `canManageEditors` is `isNarwhalRank`.
- `POST /api/exec/inventory`: the `createItem` exemption stays; every other action requires `canEditInventory`, except the three `*ScanProfile` actions which keep requiring narwhal.
- `PATCH`/`DELETE /api/exec/inventory/[id]`: `requireNarwhalSession` → `requireInventoryEditorSession`.
- Woealer routes (`/api/exec/woealer`, `pages/[id]`, `slots/[id]`): same swap, so the Woealer tab's edit controls match what the page shows the grantee.
- New `app/api/exec/inventory/editors/route.ts`: `GET` (narwhal) → current editors + exec-rank candidates; `POST { discordId, note }` grant; `DELETE ?discordId=` revoke. All three narwhal-only.

Client:

- `canEdit` comes from `data.permissions.canEdit`; the local `NARWHAL_RANKS` copy in [page.tsx:165](../../app/exec/inventory/page.tsx#L165) is deleted.
- Header gains a **"Manage editors"** button next to "Scan profiles", visible when `canManageEditors`. It opens a modal: current editors (IGN, rank, granted by, granted at, Revoke) plus an add row (searchable select of exec members not already granted, optional note).
- The read-only footnote at [page.tsx:1081](../../app/exec/inventory/page.tsx#L1081) keeps its meaning but stops naming ranks only: "…Narwhal, Hydra, and Leader ranks — plus anyone a narwhal has granted inventory edit access — can edit…".

## 5. C — Column order

Non-material views: `Item · Type · Inventory · Reserve · Target · …` becomes `Item · Type · Inventory · Target · Reserve · …`, so the two numbers that get compared sit next to each other. `Reserve Location` stays where it is, after `Location`. Header cells and body cells move together; the Materials table already reads `Inventory · Target` and is untouched.

The edit form keeps its own order (`Inventory · Reserve · Enough at`) — reordering there would be churn for no gain, since it's a two-column grid, not a comparison. *(Open question 11.1.)*

## 6. D — Reserve color

`.reserveNumber` goes from `#fcd34d` to a neutral grey that still reads as "de-emphasised, not a status". Using a fixed `#9ca3af` rather than `var(--text-secondary)` keeps it distinguishable from ordinary cell text in both themes.

## 7. E — Role colors

Pull from [lib/snipe-constants.ts](../../lib/snipe-constants.ts) — the same palette the snipe system uses, ported from `Commands/snipe.py`:

| Role | Color |
| ---- | ----- |
| Healer | `#51D868` |
| Tank | `#00D2E6` |
| DPS | `#FF442F` |

`any` has no snipe equivalent; it gets the neutral `--text-secondary` treatment.

The Role column currently renders a plain comma-joined string. It becomes tinted chips reusing the existing `--chip-color` mechanism that Difficulty and Dry already use (`.difficultyBadge`). The role **filter chips** get the same tint, matching how the difficulty filter chips already work. Chip contrast is the tint-on-transparent style already in the file, not solid fills, so the colors stay legible in the light theme.

## 8. F — Darkened glass

The item table currently sits directly on the ocean background image with no surface of its own; the Woealer tab already got one in TAQ-59 (`.woealerSurface`). Generalise that into a shared `.listSurface` and wrap the table in it for every non-Woealer view, with a heavier background than Woealer's (`--bg-card-solid` at ~72% rather than `--bg-card` at 62%) since it sits behind dense numeric rows.

Because the site has both a light and a dark theme, "darkened" is implemented as *more opaque and higher contrast against the photo*, built on `--bg-card-solid` (`#1e293b` dark / `#ffffff` light), not a hardcoded black scrim which would wreck the light theme.

The empty and loading states get the same surface so the page doesn't flicker between framed and unframed.

## 9. Files

New:
- [sql/create_inventory_editors.sql](../../sql/create_inventory_editors.sql)
- [lib/inventory-access.ts](../../lib/inventory-access.ts)
- [lib/inventory-sort.ts](../../lib/inventory-sort.ts) + [lib/inventory-sort.test.ts](../../lib/inventory-sort.test.ts)
- [app/api/exec/inventory/editors/route.ts](../../app/api/exec/inventory/editors/route.ts)

Changed:
- [app/exec/inventory/page.tsx](../../app/exec/inventory/page.tsx) — sort dropdown, column order, role chips, permissions, editors modal
- [app/exec/inventory/inventory.module.css](../../app/exec/inventory/inventory.module.css) — `.listSurface`, `.reserveNumber`, `.roleBadge`, `.sortControl`, `.editorGrantRow`
- [app/api/exec/inventory/route.ts](../../app/api/exec/inventory/route.ts) — permissions payload + per-action gating
- [app/api/exec/inventory/[id]/route.ts](../../app/api/exec/inventory/%5Bid%5D/route.ts)
- [app/api/exec/woealer/route.ts](../../app/api/exec/woealer/route.ts), [pages/[id]](../../app/api/exec/woealer/pages/%5Bid%5D/route.ts), [slots/[id]](../../app/api/exec/woealer/slots/%5Bid%5D/route.ts)

## 10. Non-goals

- No server-side sorting or persistence of the chosen sort per user.
- No permission tiers beyond the single editor grant (no per-category, no read-only revocation, no expiry).
- No change to who can *reach* the page — that is still `EXEC_RANKS` via the session.
- No changes to the mod-facing catalog/upload endpoints, which authenticate with a bearer token, not a session.

## 11. Open questions

1. **Edit form field order** — should the modal also put Target ("Enough at") between Inventory and Reserve? Shipped as *no*; the form is a two-column grid, not a comparison. One-line change if wanted.
2. **Grant candidates** — shipped offering only Hammerhead+ members, since nobody below that can open `/exec`. If the intent is to pre-grant someone about to be promoted, this needs to widen to all linked members.

## 12. Verification

- `npx tsc --noEmit` clean, `npm test` 115 passing (8 files, incl. the 9 new sort tests), `npm run build` clean.
- Not exercised against a live session: the editors modal and the grant/revoke round-trip need a Discord-authenticated narwhal session. The SQL behind them (candidate list, editor join) was run directly against the TortReborn DB and returns as expected — 41 grantable exec members, 0 grants.
