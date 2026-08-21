# TAQ-29: War build archive

Status: **implemented** 2026-08-20 on `feat/taq-29-build-archive` (both repos); migration not yet applied to prod. Prod state read 2026-08-20 (§3). Design revised same day per Thundderr: archiving works at **both** the version and the definition grain, archived assignments stay in `member_builds` as the record, and a second members table surfaces archived holders for easy upgrades.

Ticket: TAQ-29 (`tracker_tickets.id = 29`), type `feature`, system `website`, priority `medium`, status `in_progress`, due 2026-08-12.
Submitted by igasingularity (`589025838578663434`), assigned to Thundderr (`170719819715313665`). Four comments (`tracker_comments.id` 25–28); the description is one line and the comments carry the whole feature.

## 1. Ticket, verbatim

Title: **[war] build archive**

> divzer is dead

Comments, in order:

1. (#25) *in a similar way to how the archive was done in the stocks page, it'd make sense i think to have a way to archive old builds we're not using anymore. This way I also don't have to constantly be getting rid of old dps roles/tech whenever we get a new one and the old one becomes obsolete.*
2. (#26) — byte-identical duplicate of #25 ("oops it duped").
3. (#27) *oops it duped. I also think it'd make sense if it also stores who had the old builds that _got_ archived*
4. (#28) *basically the idea is since this thing in the website automatically assigns roles in taqcord, itd make sense the only _active_ roles are the ones that are still usable in snipes. Like old guard is still usable. Old divzer is definitely not.*

The one attachment (`tracker_attachments.id = 9`) is a screenshot of the Inventory page's tab bar — `Ingredients · Consumables · Recipe archive (24)` — i.e. the pattern being pointed at: a segmented control whose archive entry carries a live count.

"Stocks page" is the old name for [/exec/inventory](../../app/exec/inventory/page.tsx) (renamed in TAQ-59); its archive is `inventory_items.archived` + `archived_at`, toggled through `PATCH /api/exec/inventory/[id]` with `{ action: 'archive' | 'restore' }`. This spec reuses that shape.

Assignee's direction (2026-08-20), which this spec implements:

> we want to be able to archive old versions of a build and old builds altogether, where archive means its no longer valid to be used and anyone with that version should not have the respective tank/dps/healer role. should have another ui table for members with archived builds so we can upgrade them to the newer versions more easily, can be on the war builds page as well under the main table.

Three consequences worth spelling out:

- **Two grains.** A single obsolete *version* can be archived while newer versions of the same build stay live; a whole *definition* can be archived when the build itself is dead (divzer).
- **Assignments survive archiving.** `member_builds` rows pointing at archived versions are kept, not deleted — they *are* the "who had it" record #27 asks for, and they feed the upgrade table.
- **Role removal is the effect, not row removal.** A member whose only DPS build is archived loses the `DPS` role in TAqCord; a member who also holds an active DPS build keeps it.

## 2. What exists today

`build_definitions` (key, name, role, color, conns_url, hq_url, sort_order) → `build_versions` (build_key, major, minor, conns_url, hq_url, notes) → `member_builds` (uuid, build_key, version_major, version_minor, prev_version_*, assigned_by, created_at), one row per member per build, unique on `(uuid, build_key)`, FK `member_builds_version_fk` onto `build_versions`.

The only way to retire anything is deletion. `DELETE /api/exec/builds/definitions` deletes every `member_builds` row for the key and then the definition (cascading `build_versions`); `DELETE /api/exec/builds/versions` refuses while any member sits on the version. Name, links, history and roster all go — that is the "constantly getting rid of old dps roles/tech" cost in #25.

Roles come from [Tort-Reborn/Tasks/sync_war_builds.py](../../../Tort-Reborn/Tasks/sync_war_builds.py), a 60s reconcile loop: `member_builds ⋈ build_definitions → {uuid: {DPS|HEALER|TANK}}`, mapped through `discord_links` onto the Discord roles `DPS`/`Healer`/`Tank`. It is bidirectional — adding a war role in Discord calls `_get_default_build_key(role)`, which picks the **lowest `sort_order` build for that role with no regard for obsolescence**. That is exactly the failure #28 describes, and it is live (§3).

`build_definitions` / `member_builds` have no other consumers: three API routes under [app/api/exec/builds/](../../app/api/exec/builds/) and that one bot task.

Type gotcha for any SQL that joins to names: `discord_links.uuid` is Postgres `uuid`, `member_builds.uuid` is `varchar`. A bare join dies with *operator does not exist: uuid = character varying*; cast one side (`dl.uuid::text = mb.uuid::text`). This is why [route.ts](../../app/api/exec/builds/route.ts) indexes `discord_links` in JS instead of joining. Both sides store the dashed 36-char form, so the cast is safe.

## 3. Prod state, read 2026-08-20

Six definitions, 9 versions, 52 `member_builds` rows across 35 distinct members. All 52 rows resolve through `discord_links`. `assigned_by` spread: `igasingularity` 35, `sync_script` 9, `discord_sync` 8.

| key | name | role | sort | versions (members on each) |
| --- | ---- | ---- | ---- | -------------------------- |
| `divzer` | Divzer DPS | DPS | 1 | 1.0 "Pre-Fruma" (**0**) |
| `absolution` | Abso Heal | HEALER | 2 | 1.2 "Completely new tree" (6) · 1.1 "Fruma" (0) · 1.0 "Pre-Fruma" (0) |
| `guardian` | Guard | TANK | 3 | 2.0 "Post-Fruma" (15) · 1.0 "Pre-Fruma" (**17**) |
| `king_of_hearts` | King of Hearts Heal | HEALER | 4 | 1.0 "Post abso nerf" (6) |
| `rthunder` | Roaring Thunder DPS | DPS | 5 | 1.0 (**0**) |
| `catatrick` | Cata Trick DPS | DPS | 6 | 1.0 (8) |

What this tells us:

1. **The `_get_default_build_key` bug is live right now.** Lowest `sort_order` per role is `divzer` (DPS), `absolution` (HEALER), `guardian` (TANK) — so anyone handed a `DPS` role in Discord today gets auto-assigned **Divzer DPS**, the dead build. §6 is a production bug fix, not hardening.
2. **Divzer's roster is already gone** (0 members — stripped by hand, the manual work #25 complains about), and `rthunder` matches. Those two are the immediate definition-level archive candidates; the record-keeping only starts protecting rosters from the next retirement onward.
3. **Version-grain archiving is the grain prod actually needs.** `absolution` 1.0/1.1 are dead weight kept only because deletion is destructive, and `guardian` splits 17 on v1.0 vs 15 on v2.0. When v1.0 eventually stops being snipe-viable, archiving it should push those 17 into the upgrade table — while today #28 says old guard *is* still usable, so nothing guard-shaped gets archived yet.

## 4. Scope

| # | Change | Surface |
| - | ------ | ------- |
| A | `archived` on both `build_definitions` and `build_versions` | migration |
| B | Archive/restore endpoint covering both grains | new API route |
| C | Archived builds/versions stop producing Discord roles (#28) | bot task |
| D | Assignment guards: can't assign or default onto anything archived | builds API |
| E | Sidebar archive controls + `Archive (N)` view | Builds tab |
| F | "Archived builds" members table under the main table, with one-click upgrade | Builds tab |

Out of scope: everything else on the Builds tab (flags, undo, version numbering), and the rest of the Guild Wars page.

## 5. A — Schema

```sql
ALTER TABLE build_definitions
  ADD COLUMN IF NOT EXISTS archived    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by TEXT;

ALTER TABLE build_versions
  ADD COLUMN IF NOT EXISTS archived    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by TEXT;
```

`archived` + `archived_at` mirror `inventory_items`; `archived_by TEXT` holds `session.ign`, matching `build_versions.created_by`. The migration ships archiving nothing — execs archive divzer et al. through the UI.

**Effective archived** for an assignment is `bd.archived OR bv.archived`. The two flags stay independent: archiving a definition does not rewrite its versions' flags, so restoring the definition restores exactly the per-version state it had. No `member_builds` change — rows persist untouched, which is what makes them the #27 record.

Everything archived keeps its versions, Conns/HQ links and `sort_order`. The line #28 draws is *assignability and role production*, not reference: archived things are still readable, they just can't be handed out and don't count.

## 6. C — Role sync

[sync_war_builds.py](../../../Tort-Reborn/Tasks/sync_war_builds.py), all four DB helpers:

| Function | Change | Why |
| -------- | ------ | --- |
| `_get_desired_roles` | Join `build_versions` on the pinned tuple; `WHERE NOT bd.archived AND NOT bv.archived` | **The core of the feature.** A member whose only DPS assignment is archived drops out of the desired set; the 60s reconcile then removes the Discord role. A member with another active DPS build keeps it, for free, because roles are computed as a distinct set. |
| `_get_default_build_key` | Lowest `sort_order` where `NOT bd.archived` **and** at least one non-archived version exists | **Live prod bug** (§3): today a Discord-granted `DPS` role auto-assigns divzer. |
| `_add_member_build` | Latest version filtered to `NOT archived` | Never pins a new assignment to a retired version. |
| `_get_member_roles_for_uuid` | Same join + filter as `_get_desired_roles` | A member holding only archived-DPS who gains the `DPS` role in Discord reads as "has no DPS build" and gets the default active one — the row for the archived build is untouched (unique on `(uuid, build_key)` only collides if it's the *same* build; then the upsert-free `DO NOTHING` insert path needs the same-build case to update the version instead — see §8 guard). |
| `_remove_member_builds_by_role` | Subselect gains the not-archived filters | Removing a Discord role must not delete the archived-assignment *record*; it only clears active assignments. |

Net effect an exec sees: archive guardian v1.0 → within 60s, each of its 17 members loses `Tank` in TAqCord unless another active TANK build covers them — and all 17 appear in the new table (§9) with a one-click upgrade to v2.0, which restores the role on the next sweep.

## 7. B — Archive/restore API

One endpoint, both grains, action-shaped like the inventory archive:

`POST /api/exec/builds/archive`

```jsonc
{ "scope": "definition", "key": "divzer",  "action": "archive" }
{ "scope": "version", "key": "guardian", "major": 1, "minor": 0, "action": "restore" }
```

- Sets/clears `archived`, `archived_at = NOW()`, `archived_by = session.ign` on the one row. Idempotent (`WHERE archived = FALSE` / `TRUE`); repeat calls are 200 no-ops.
- Returns `affectedMembers` — count of `member_builds` rows whose effective state changed — so the UI confirmation can be concrete.
- No cascading writes. Role changes happen via the bot's next sweep; assignments are never touched.
- Restoring a *version* of a still-archived *definition* is allowed and inert (effective state stays archived until the definition is restored too). The UI communicates this rather than the API forbidding it.

## 8. D — Assignment guards

`POST /api/exec/builds` (assign/upgrade):

- Explicit `{major, minor}`: reject if the version or its definition is archived — 400 `"That version is archived"`.
- Omitted version ("latest"): resolve to the latest **non-archived** version of a **non-archived** definition; 400 `"Build is archived"` / `"Build has no active versions"` otherwise.
- The upsert path is what the upgrade table calls — a member on archived guardian v1.0 upgraded to v2.0 goes through the existing `ON CONFLICT (uuid, build_key)` update, `prev_version_*` snapshot included, so undo keeps working.

`POST /api/exec/builds/versions` (bump): next version number is computed from the overall max **including archived versions**, so numbers never collide; seed links still copy from the overall latest. Otherwise unchanged.

`DELETE` endpoints unchanged: version delete still refuses while members sit on it (now also protecting the archived record), definition delete remains the destructive escape hatch, worded like the Inventory page's — *unlike Archive, this cannot be undone*.

`GET /api/exec/builds` additions:

- Definitions carry `archived`, `archivedAt`, `archivedBy`; each version carries the same.
- `latestVersion` becomes the latest **active** version (null when none) — it feeds every assign affordance. The UI derives "has archived versions" from the versions array itself.
- Each member build ref carries `archived: boolean` (effective), so the client can split the two tables without recomputing the join.

## 9. E + F — UI

All on the Builds tab of [/exec/snipes](../../app/exec/snipes/page.tsx); the page's own tab bar is untouched.

**Sidebar** ([Builds.tsx](../../app/exec/snipes/Builds.tsx) right panel):

- Header becomes a segmented control shaped like the attachment: **`HQ Builds`** | **`Archive (N)`**, N = archived *definitions*. `+ New` stays on the HQ Builds side.
- Each active definition's `Edit · Del` row gains **`Archive`** (neutral styling; `Del` keeps red). Confirmation, inline where delete confirmation renders:
  > Archive "Guard"? 32 members keep their assignment but lose the Tank role in TAqCord unless another active tank build covers them. Restore any time.
- Each row in the versions list (older versions, and the latest) gains a per-version **`Archive`**/**`Restore`** toggle; archived versions render with a struck/`archived` badge and stay readable. Archiving the current latest just promotes the next active version to "latest" everywhere.
- Archive view: archived definitions in one flat list — name, latest version, `archived <date> by <ign>`, read-only versions with working links, member count still holding it — with **`Restore`** and **`Delete permanently`** (confirmation: *this also deletes every member's assignment record; unlike Archive it cannot be undone*).

**Archived-builds members table** — new, directly under the main member table, rendered only when non-empty:

| Rank | IGN | Archived build | Action |
| ---- | --- | -------------- | ------ |
| Sailfish | Somebody | `Guard v1.0` chip, greyed | **`↑ v2.0`** · `×` |

- Fed by the member build refs with `archived: true`. A member with both active and archived builds appears in both tables; the main table shows only their active chips.
- **`↑ vX.Y`** assigns the build's latest active version via the existing `assignBuild` — the row then leaves this table on refresh and the role comes back on the next bot sweep. When the definition is archived or has no active version, there is no upgrade target and only `×` (remove assignment — deliberate erasure of that record) is offered.
- Same rank-priority sort as the main table. The rank filter buttons apply to both tables.
- The table header carries the count — `Archived builds (17)` — echoing the attachment's pattern.

**Assignment affordances** (add-member buttons, per-row `+` dropdown, `missingBuilds`) all switch to an `activeDefinitions` memo (`!archived && latestVersion !== null`). `buildDefMap` keeps **all** definitions so archived chips render with name and color instead of vanishing through the `if (!def) return null` at [Builds.tsx:646](../../app/exec/snipes/Builds.tsx#L646).

## 10. Files

New:
- `sql/add_build_archive.sql`
- `app/api/exec/builds/archive/route.ts`

Changed:
- [app/api/exec/builds/route.ts](../../app/api/exec/builds/route.ts) — archived fields + per-ref `archived` in GET, assignment guards in POST
- [app/api/exec/builds/versions/route.ts](../../app/api/exec/builds/versions/route.ts) — bump numbering note (§8), archived fields in nothing else
- [hooks/useExecBuilds.ts](../../hooks/useExecBuilds.ts) — `setArchived(scope, key, versionRef?, action)`
- [lib/build-constants.ts](../../lib/build-constants.ts) — archived fields on `BuildDefinition`/`BuildVersion`, `archived` on the member ref type
- [app/exec/snipes/Builds.tsx](../../app/exec/snipes/Builds.tsx) — sidebar controls + archive view, archived-members table, `activeDefinitions` memo
- [Tort-Reborn/Tasks/sync_war_builds.py](../../../Tort-Reborn/Tasks/sync_war_builds.py) — five query changes (§6)

## 11. Non-goals

- No auto-archive on inactivity or age. Retirement is a judgement call — #28's whole point is that guardian v1.0 (17 members, older than v2.0) stays while divzer goes.
- No separate roster ledger table. Assignments-in-place *are* the record; the earlier draft's `member_build_archive` design is superseded.
- No archive visibility for non-execs, and nothing on member-facing pages.
- No change to Discord role names or the DPS/HEALER/TANK mapping.
- No backfill: builds already hard-deleted (and divzer's hand-stripped roster) are unrecoverable; the migration archives nothing on its own.

## 12. Decisions

All open questions resolved 2026-08-20 (Thundderr); no open questions remain.

- **Bulk upgrade: per-member only.** No `Upgrade all` button — each row upgrades individually via its `↑ vX.Y` button. Cheap to add later if the clicking gets old.
- **The archived table keeps the `×` remove button.** Rows for members who left or will never war again can be pruned; removing deliberately erases that member's "who had it" record, which is acceptable.
- **Nothing is archived by us.** Not in the migration, not during verification (§13) — choosing what to archive (divzer, rthunder, old absolution versions) is exec work done through the UI after deploy.
- **Discord-granted role while holding only an archived build of that role** — decided 2026-08-20 (Thundderr): works as intended. Granting the role in Discord assumes the member is getting a working build, so the bot assigns the default *active* build for the role (§6), even if it's a different build than their archived one.
- **From the earlier draft:** restore semantics (nothing to restore — assignments never leave), IGN snapshotting (rows persist and all 52 currently resolve via `discord_links`; join with the `::text` cast from §2).

## 13. Verification

- `npx tsc --noEmit`, `npm test`, `npm run build`.
- Archive/restore + guard behavior exercised against the local dev DB (`TEST_DB_*`) with a throwaway definition: archive version → assign rejected, latest recomputed; archive definition → default-key query skips it; restore → all reverts.
- Bot-side: the five rewritten queries verified against the dev DB (archive a throwaway build in a transaction, assert the desired-roles set shrinks and `_get_default_build_key` moves off it). Live Discord role flow needs the real bot against TAqCord post-deploy. **Nothing is ever archived by us** — not in the migration, not as a verification step, not as a "safe first archive". Deciding what to archive (divzer, rthunder, the old absolution versions) is exec work done through the UI; decided 2026-08-20 (Thundderr).
- Dataset is tiny (6 definitions / 9 versions / 52 rows): migration is instant.
