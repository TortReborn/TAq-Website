-- Management-only ingredient and consumable stock tracking.
-- Item rows are kept in the database, not in this file.

CREATE TABLE IF NOT EXISTS inventory_categories (
  id         BIGSERIAL   PRIMARY KEY,
  kind       TEXT        NOT NULL CHECK (kind IN ('ingredient', 'consumable')),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL,
  sort_order INT         NOT NULL DEFAULT 0,
  archived   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, slug)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id               BIGSERIAL   PRIMARY KEY,
  seed_key         TEXT        UNIQUE,
  kind             TEXT        NOT NULL CHECK (kind IN ('ingredient', 'consumable')),
  category_id      BIGINT      NOT NULL REFERENCES inventory_categories(id),
  name             TEXT        NOT NULL,
  scan_key         TEXT        NOT NULL,
  aliases          TEXT[]      NOT NULL DEFAULT '{}',
  quantity         INT         NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserve_quantity INT         NOT NULL DEFAULT 0 CHECK (reserve_quantity >= 0),
  desired_quantity INT         CHECK (desired_quantity IS NULL OR desired_quantity >= 0),
  used_by          TEXT,
  bank_page        TEXT,
  charges          INT         CHECK (charges IS NULL OR charges >= 0),
  recipe_url       TEXT,
  storage_bucket   TEXT        NOT NULL DEFAULT 'misc_bucket'
                               CHECK (storage_bucket IN ('misc_bucket', 'account_bank', 'character_bank')),
  notes            TEXT,
  texture_path     TEXT,
  sort_order       INT         NOT NULL DEFAULT 0,
  archived         BOOLEAN     NOT NULL DEFAULT FALSE,
  archived_at      TIMESTAMPTZ,
  updated_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_active
  ON inventory_items(kind, category_id, sort_order) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_inventory_items_bucket
  ON inventory_items(storage_bucket) WHERE archived = FALSE;

CREATE TABLE IF NOT EXISTS inventory_scans (
  id                BIGSERIAL   PRIMARY KEY,
  scan_type         TEXT        NOT NULL
                                CHECK (scan_type IN ('misc_bucket', 'account_bank', 'character_bank')),
  source_key        TEXT,
  source_name       TEXT,
  uploaded_by       TEXT        NOT NULL,
  client_timestamp  TIMESTAMPTZ,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reported_items    INT         NOT NULL DEFAULT 0,
  matched_items     INT         NOT NULL DEFAULT 0,
  unknown_items     JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_inventory_scans_received
  ON inventory_scans(received_at DESC);

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

INSERT INTO inventory_categories (kind, name, slug, sort_order)
VALUES
  ('ingredient', 'Potion', 'potion', 10),
  ('ingredient', 'Scroll', 'scroll', 20),
  ('ingredient', 'Food', 'food', 30),
  ('consumable', 'Potions', 'potions', 10),
  ('consumable', 'Scrolls', 'scrolls', 20),
  ('consumable', 'Food', 'food', 30)
ON CONFLICT (kind, slug) DO UPDATE
SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

UPDATE inventory_items
SET quantity = 0, reserve_quantity = 0
WHERE archived = TRUE;

COMMENT ON COLUMN inventory_items.charges IS
  'Number of consumable uses per crafted item; this is not currency.';
COMMENT ON COLUMN inventory_items.bank_page IS
  'Woealer account-bank page number or character-bank marker such as D4.';
