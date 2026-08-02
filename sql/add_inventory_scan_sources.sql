-- Add independent inventory source snapshots so multiple character banks can be
-- summed without one absolute scan erasing quantities stored on another class.

ALTER TABLE inventory_scans
  ADD COLUMN IF NOT EXISTS source_key TEXT;

ALTER TABLE inventory_scans
  ADD COLUMN IF NOT EXISTS source_name TEXT;

CREATE TABLE IF NOT EXISTS inventory_scan_sources (
  storage_bucket    TEXT        NOT NULL
                                CHECK (storage_bucket IN ('misc_bucket', 'account_bank', 'character_bank')),
  source_key        TEXT        NOT NULL,
  source_name       TEXT        NOT NULL,
  item_counts       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  unknown_items     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by       TEXT        NOT NULL,
  client_timestamp  TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (storage_bucket, source_key)
);

CREATE INDEX IF NOT EXISTS idx_inventory_scan_sources_updated
  ON inventory_scan_sources(storage_bucket, updated_at DESC);
