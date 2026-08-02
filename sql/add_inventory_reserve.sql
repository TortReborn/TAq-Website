-- Separate operational stock from consumables stored on Bonus Consu classes.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS reserve_quantity INT NOT NULL DEFAULT 0
  CHECK (reserve_quantity >= 0);

WITH reserve_seed(seed_key, category_slug, name, aliases, texture_path, sort_order) AS (
  VALUES
)
INSERT INTO inventory_items (
  seed_key, kind, category_id, name, scan_key, aliases, quantity, reserve_quantity,
  desired_quantity, storage_bucket, notes, texture_path, sort_order
)
SELECT
  seed.seed_key, 'consumable', category.id, seed.name, seed.name, seed.aliases,
  0, 0, NULL, 'character_bank', 'Reserve stock from Bonus Consu scans.',
  seed.texture_path, seed.sort_order
FROM reserve_seed seed
JOIN inventory_categories category
  ON category.kind = 'consumable' AND category.slug = seed.category_slug
ON CONFLICT (seed_key) DO NOTHING;

UPDATE inventory_items
SET quantity = 0, reserve_quantity = 0
WHERE archived = TRUE;
