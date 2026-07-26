-- Follow-up migration for management inventory/accounting revisions.
-- Safe to re-run: the schema operations are guarded and recipe URLs are
-- corrected by stable seed keys.

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

WITH recipe_urls(seed_key, recipe_url) AS (
  VALUES
)
UPDATE inventory_items AS item
SET recipe_url = recipe_urls.recipe_url,
    updated_at = NOW()
FROM recipe_urls
WHERE item.seed_key = recipe_urls.seed_key;

UPDATE inventory_items
SET recipe_url = NULL,
    updated_at = NOW()
WHERE seed_key IN (
  'consumable:current:bat-ws-cancel',
  'consumable:current:twisted-mr-cancel',
  'consumable:current:healer-neg-tier-food'
);
