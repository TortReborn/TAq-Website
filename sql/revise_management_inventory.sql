-- Follow-up migration for management inventory/accounting revisions.
-- Safe to re-run: the schema operations are guarded.

ALTER TABLE le_balance_log
  ADD COLUMN IF NOT EXISTS author TEXT;

CREATE TABLE IF NOT EXISTS inventory_texture_assets (
  id          BIGSERIAL    PRIMARY KEY,
  name        TEXT         NOT NULL,
  s3_key      TEXT         NOT NULL UNIQUE,
  created_by  TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_texture_assets_created_at
  ON inventory_texture_assets(created_at DESC);
