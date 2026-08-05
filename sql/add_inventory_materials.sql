-- Adds a third inventory_items kind, 'material'. Scope: level 100/105/115 brackets only
-- (4 professions x 2 kinds x 3 tiers = 72 rows). Woodcutting's raw item is "Plank", not
-- "Wood" (that's the refined name). Tier (T1/T2/T3) is invisible in the display name, so
-- the mod encodes it into the reported name itself (e.g. "Dernic Gem T1").

ALTER TABLE inventory_categories DROP CONSTRAINT inventory_categories_kind_check;
ALTER TABLE inventory_categories ADD CONSTRAINT inventory_categories_kind_check
  CHECK (kind IN ('ingredient', 'consumable', 'material'));

ALTER TABLE inventory_items DROP CONSTRAINT inventory_items_kind_check;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_kind_check
  CHECK (kind IN ('ingredient', 'consumable', 'material'));

ALTER TABLE inventory_items DROP CONSTRAINT inventory_items_storage_bucket_check;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_storage_bucket_check
  CHECK (storage_bucket IN ('misc_bucket', 'account_bank', 'character_bank', 'materials_bucket'));

ALTER TABLE inventory_scans DROP CONSTRAINT inventory_scans_scan_type_check;
ALTER TABLE inventory_scans ADD CONSTRAINT inventory_scans_scan_type_check
  CHECK (scan_type IN ('misc_bucket', 'account_bank', 'character_bank', 'materials_bucket'));

ALTER TABLE inventory_scan_sources DROP CONSTRAINT inventory_scan_sources_storage_bucket_check;
ALTER TABLE inventory_scan_sources ADD CONSTRAINT inventory_scan_sources_storage_bucket_check
  CHECK (storage_bucket IN ('misc_bucket', 'account_bank', 'character_bank', 'materials_bucket'));

-- "Materials" turned out to be a character-bank nickname (like "Bonus Consu 1/2/3"),
-- not a separate physical bucket - so it's a scan profile, same as Ingredients/Ingredients II.
ALTER TABLE inventory_scan_profiles DROP CONSTRAINT inventory_scan_profiles_content_type_check;
ALTER TABLE inventory_scan_profiles ADD CONSTRAINT inventory_scan_profiles_content_type_check
  CHECK (content_type IN ('consumables', 'ingredients', 'materials'));

INSERT INTO inventory_scan_profiles
  (nickname, content_type, source_key, display_name, start_page, total_pages, sort_order)
VALUES
  ('materials', 'materials', 'character_bank:materials', 'Materials', 1, 12, 70)
ON CONFLICT (nickname) DO NOTHING;

INSERT INTO inventory_categories (kind, name, slug, sort_order)
VALUES
  ('material', 'Mining', 'mining', 10),
  ('material', 'Woodcutting', 'woodcutting', 20),
  ('material', 'Farming', 'farming', 30),
  ('material', 'Fishing', 'fishing', 40)
ON CONFLICT (kind, slug) DO UPDATE
SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

WITH seed(seed_key, category_slug, name, gather_level, sort_order) AS (
  VALUES
    ('material:voidstone-gem-t1', 'mining', 'Voidstone Gem T1', 100, 10),
    ('material:voidstone-gem-t2', 'mining', 'Voidstone Gem T2', 100, 20),
    ('material:voidstone-gem-t3', 'mining', 'Voidstone Gem T3', 100, 30),
    ('material:voidstone-ingot-t1', 'mining', 'Voidstone Ingot T1', 100, 40),
    ('material:voidstone-ingot-t2', 'mining', 'Voidstone Ingot T2', 100, 50),
    ('material:voidstone-ingot-t3', 'mining', 'Voidstone Ingot T3', 100, 60),
    ('material:dernic-gem-t1', 'mining', 'Dernic Gem T1', 105, 70),
    ('material:dernic-gem-t2', 'mining', 'Dernic Gem T2', 105, 80),
    ('material:dernic-gem-t3', 'mining', 'Dernic Gem T3', 105, 90),
    ('material:dernic-ingot-t1', 'mining', 'Dernic Ingot T1', 105, 100),
    ('material:dernic-ingot-t2', 'mining', 'Dernic Ingot T2', 105, 110),
    ('material:dernic-ingot-t3', 'mining', 'Dernic Ingot T3', 105, 120),
    ('material:cinnabar-gem-t1', 'mining', 'Cinnabar Gem T1', 115, 130),
    ('material:cinnabar-gem-t2', 'mining', 'Cinnabar Gem T2', 115, 140),
    ('material:cinnabar-gem-t3', 'mining', 'Cinnabar Gem T3', 115, 150),
    ('material:cinnabar-ingot-t1', 'mining', 'Cinnabar Ingot T1', 115, 160),
    ('material:cinnabar-ingot-t2', 'mining', 'Cinnabar Ingot T2', 115, 170),
    ('material:cinnabar-ingot-t3', 'mining', 'Cinnabar Ingot T3', 115, 180),
    ('material:sky-plank-t1', 'woodcutting', 'Sky Plank T1', 100, 190),
    ('material:sky-plank-t2', 'woodcutting', 'Sky Plank T2', 100, 200),
    ('material:sky-plank-t3', 'woodcutting', 'Sky Plank T3', 100, 210),
    ('material:sky-paper-t1', 'woodcutting', 'Sky Paper T1', 100, 220),
    ('material:sky-paper-t2', 'woodcutting', 'Sky Paper T2', 100, 230),
    ('material:sky-paper-t3', 'woodcutting', 'Sky Paper T3', 100, 240),
    ('material:dernic-plank-t1', 'woodcutting', 'Dernic Plank T1', 105, 250),
    ('material:dernic-plank-t2', 'woodcutting', 'Dernic Plank T2', 105, 260),
    ('material:dernic-plank-t3', 'woodcutting', 'Dernic Plank T3', 105, 270),
    ('material:dernic-paper-t1', 'woodcutting', 'Dernic Paper T1', 105, 280),
    ('material:dernic-paper-t2', 'woodcutting', 'Dernic Paper T2', 105, 290),
    ('material:dernic-paper-t3', 'woodcutting', 'Dernic Paper T3', 105, 300),
    ('material:redwood-plank-t1', 'woodcutting', 'Redwood Plank T1', 115, 310),
    ('material:redwood-plank-t2', 'woodcutting', 'Redwood Plank T2', 115, 320),
    ('material:redwood-plank-t3', 'woodcutting', 'Redwood Plank T3', 115, 330),
    ('material:redwood-paper-t1', 'woodcutting', 'Redwood Paper T1', 115, 340),
    ('material:redwood-paper-t2', 'woodcutting', 'Redwood Paper T2', 115, 350),
    ('material:redwood-paper-t3', 'woodcutting', 'Redwood Paper T3', 115, 360),
    ('material:hemp-grains-t1', 'farming', 'Hemp Grains T1', 100, 370),
    ('material:hemp-grains-t2', 'farming', 'Hemp Grains T2', 100, 380),
    ('material:hemp-grains-t3', 'farming', 'Hemp Grains T3', 100, 390),
    ('material:hemp-string-t1', 'farming', 'Hemp String T1', 100, 400),
    ('material:hemp-string-t2', 'farming', 'Hemp String T2', 100, 410),
    ('material:hemp-string-t3', 'farming', 'Hemp String T3', 100, 420),
    ('material:dernic-grains-t1', 'farming', 'Dernic Grains T1', 105, 430),
    ('material:dernic-grains-t2', 'farming', 'Dernic Grains T2', 105, 440),
    ('material:dernic-grains-t3', 'farming', 'Dernic Grains T3', 105, 450),
    ('material:dernic-string-t1', 'farming', 'Dernic String T1', 105, 460),
    ('material:dernic-string-t2', 'farming', 'Dernic String T2', 105, 470),
    ('material:dernic-string-t3', 'farming', 'Dernic String T3', 105, 480),
    ('material:heather-grains-t1', 'farming', 'Heather Grains T1', 115, 490),
    ('material:heather-grains-t2', 'farming', 'Heather Grains T2', 115, 500),
    ('material:heather-grains-t3', 'farming', 'Heather Grains T3', 115, 510),
    ('material:heather-string-t1', 'farming', 'Heather String T1', 115, 520),
    ('material:heather-string-t2', 'farming', 'Heather String T2', 115, 530),
    ('material:heather-string-t3', 'farming', 'Heather String T3', 115, 540),
    ('material:starfish-meat-t1', 'fishing', 'Starfish Meat T1', 100, 550),
    ('material:starfish-meat-t2', 'fishing', 'Starfish Meat T2', 100, 560),
    ('material:starfish-meat-t3', 'fishing', 'Starfish Meat T3', 100, 570),
    ('material:starfish-oil-t1', 'fishing', 'Starfish Oil T1', 100, 580),
    ('material:starfish-oil-t2', 'fishing', 'Starfish Oil T2', 100, 590),
    ('material:starfish-oil-t3', 'fishing', 'Starfish Oil T3', 100, 600),
    ('material:dernic-meat-t1', 'fishing', 'Dernic Meat T1', 105, 610),
    ('material:dernic-meat-t2', 'fishing', 'Dernic Meat T2', 105, 620),
    ('material:dernic-meat-t3', 'fishing', 'Dernic Meat T3', 105, 630),
    ('material:dernic-oil-t1', 'fishing', 'Dernic Oil T1', 105, 640),
    ('material:dernic-oil-t2', 'fishing', 'Dernic Oil T2', 105, 650),
    ('material:dernic-oil-t3', 'fishing', 'Dernic Oil T3', 105, 660),
    ('material:mahseer-meat-t1', 'fishing', 'Mahseer Meat T1', 115, 670),
    ('material:mahseer-meat-t2', 'fishing', 'Mahseer Meat T2', 115, 680),
    ('material:mahseer-meat-t3', 'fishing', 'Mahseer Meat T3', 115, 690),
    ('material:mahseer-oil-t1', 'fishing', 'Mahseer Oil T1', 115, 700),
    ('material:mahseer-oil-t2', 'fishing', 'Mahseer Oil T2', 115, 710),
    ('material:mahseer-oil-t3', 'fishing', 'Mahseer Oil T3', 115, 720)
)
INSERT INTO inventory_items (
  seed_key, kind, category_id, name, scan_key, quantity, storage_bucket, notes, sort_order
)
SELECT
  seed.seed_key, 'material', category.id, seed.name, seed.name, 0, 'materials_bucket',
  'Gather level ' || seed.gather_level, seed.sort_order
FROM seed
JOIN inventory_categories category
  ON category.kind = 'material' AND category.slug = seed.category_slug
ON CONFLICT (seed_key) DO NOTHING;
