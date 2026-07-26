-- Management-only ingredient and consumable stock tracking.
-- Seed values were transcribed from TAq Data.xlsx on 2026-07-26.

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
  uploaded_by       TEXT        NOT NULL,
  client_timestamp  TIMESTAMPTZ,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reported_items    INT         NOT NULL DEFAULT 0,
  matched_items     INT         NOT NULL DEFAULT 0,
  unknown_items     JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_inventory_scans_received
  ON inventory_scans(received_at DESC);

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

WITH seed(
  seed_key, category_slug, name, scan_key, aliases, quantity, desired_quantity,
  texture_slug, sort_order
) AS (
  VALUES


)
INSERT INTO inventory_items (
  seed_key, kind, category_id, name, scan_key, aliases, quantity, desired_quantity,
  storage_bucket, texture_path, sort_order
)
SELECT
  seed.seed_key, 'ingredient', category.id, seed.name, seed.scan_key, seed.aliases,
  seed.quantity, seed.desired_quantity, 'misc_bucket',
  '/inventory/ingredients/' || seed.texture_slug || '.png', seed.sort_order
FROM seed
JOIN inventory_categories category
  ON category.kind = 'ingredient' AND category.slug = seed.category_slug
ON CONFLICT (seed_key) DO NOTHING;

WITH seed(
  seed_key, category_slug, name, aliases, quantity, desired_quantity, used_by,
  bank_page, charges, storage_bucket, texture_file, sort_order
) AS (
  VALUES


)
INSERT INTO inventory_items (
  seed_key, kind, category_id, name, scan_key, aliases, quantity, desired_quantity,
  used_by, bank_page, charges, recipe_url, storage_bucket, texture_path, sort_order
)
SELECT
  seed.seed_key, 'consumable', category.id, seed.name, seed.name, seed.aliases,
  seed.quantity, seed.desired_quantity, seed.used_by, seed.bank_page, seed.charges,
  CASE
    WHEN seed.seed_key = 'consumable:current:twisted-food'
      THEN 'https://hppeng-wynn.github.io/crafter/'
    ELSE 'https://wynnbuilder.github.io/crafter/'
  END,
  seed.storage_bucket,
  '/inventory/consumables/' || seed.texture_file, seed.sort_order
FROM seed
JOIN inventory_categories category
  ON category.kind = 'consumable' AND category.slug = seed.category_slug
ON CONFLICT (seed_key) DO NOTHING;

WITH seed(seed_key, category_slug, name, notes, texture_file, sort_order) AS (
  VALUES
)
INSERT INTO inventory_items (
  seed_key, kind, category_id, name, scan_key, quantity, recipe_url, storage_bucket,
  notes, texture_path, sort_order, archived, archived_at
)
SELECT
  seed.seed_key, 'consumable', category.id, seed.name, seed.name, 0,
  'https://wynnbuilder.github.io/crafter/', 'character_bank', seed.notes,
  '/inventory/consumables/' || seed.texture_file, seed.sort_order, TRUE, NOW()
FROM seed
JOIN inventory_categories category
  ON category.kind = 'consumable' AND category.slug = seed.category_slug
ON CONFLICT (seed_key) DO NOTHING;

COMMENT ON COLUMN inventory_items.charges IS
  'Number of consumable uses per crafted item; this is not currency.';
COMMENT ON COLUMN inventory_items.bank_page IS
  'Woealer account-bank page number or character-bank marker such as D4.';
