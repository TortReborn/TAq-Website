-- TAQ-29: War build archive.
-- Archiving works at two grains: a whole build (build_definitions) or a
-- single version of one (build_versions). An assignment is "effectively
-- archived" when either flag on its (build_key, major, minor) chain is set.
-- member_builds is deliberately untouched: assignments to archived builds
-- persist as the record of who had them, and feed the upgrade table on the
-- Builds tab. The Discord role sync (Tort-Reborn/Tasks/sync_war_builds.py)
-- skips archived assignments, which is what actually retires the role.
--
-- Ships archiving nothing — what to archive is exec work done in the UI.

ALTER TABLE build_definitions
  ADD COLUMN IF NOT EXISTS archived    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by TEXT;

ALTER TABLE build_versions
  ADD COLUMN IF NOT EXISTS archived    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by TEXT;
