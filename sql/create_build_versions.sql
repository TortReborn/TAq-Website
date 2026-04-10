-- War build versioning: each build_definitions row gets one or more
-- (major, minor) versions in build_versions, and member_builds is pinned
-- to a specific (build_key, version_major, version_minor) tuple.

CREATE TABLE IF NOT EXISTS build_versions (
  build_key   TEXT     NOT NULL REFERENCES build_definitions(key) ON DELETE CASCADE,
  major       SMALLINT NOT NULL,
  minor       SMALLINT NOT NULL,
  conns_url   TEXT     NOT NULL DEFAULT '#',
  hq_url      TEXT     NOT NULL DEFAULT '#',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT,
  PRIMARY KEY (build_key, major, minor)
);

-- Add version columns to member_builds (nullable during backfill).
ALTER TABLE member_builds
  ADD COLUMN IF NOT EXISTS version_major SMALLINT,
  ADD COLUMN IF NOT EXISTS version_minor SMALLINT;

-- Seed v1.0 for every existing definition using its current conns_url/hq_url.
INSERT INTO build_versions (build_key, major, minor, conns_url, hq_url, created_by)
SELECT key, 1, 0, conns_url, hq_url, 'migration'
FROM build_definitions
ON CONFLICT DO NOTHING;

-- Pin every existing member_builds row to v1.0.
UPDATE member_builds SET version_major = 1, version_minor = 0
WHERE version_major IS NULL OR version_minor IS NULL;

-- Lock in NOT NULL + FK to build_versions now that backfill is done.
ALTER TABLE member_builds
  ALTER COLUMN version_major SET NOT NULL,
  ALTER COLUMN version_minor SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'member_builds_version_fk'
  ) THEN
    ALTER TABLE member_builds
      ADD CONSTRAINT member_builds_version_fk
      FOREIGN KEY (build_key, version_major, version_minor)
      REFERENCES build_versions (build_key, major, minor) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure (uuid, build_key) is unique so we can upsert version on assign.
-- The Python sync at Tort-Reborn/Tasks/sync_war_builds.py already relies on
-- ON CONFLICT (uuid, build_key), so this constraint should already exist.
-- We add it idempotently here just in case.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'member_builds_uuid_build_key_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'member_builds'
      AND indexdef ILIKE '%UNIQUE%uuid%build_key%'
  ) THEN
    ALTER TABLE member_builds
      ADD CONSTRAINT member_builds_uuid_build_key_key UNIQUE (uuid, build_key);
  END IF;
END $$;
