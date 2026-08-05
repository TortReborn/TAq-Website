-- Auto-populated storage locations (prefix + page, e.g. "B1", "D2"). bank_page is now
-- also written by the upload handler (lib/inventory-upload.ts) for items seen in a scan;
-- manual edits still work and persist until the next scan touches that item.
-- reserve_bank_page is the same, for reserve stock (Bonus Consu sources).

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS reserve_bank_page TEXT;

ALTER TABLE inventory_scan_profiles ADD COLUMN IF NOT EXISTS location_prefix TEXT NOT NULL DEFAULT '';

UPDATE inventory_scan_profiles SET location_prefix = CASE nickname
  WHEN 'dry consu' THEN 'D'
  WHEN 'bonus consu 1' THEN 'BA'
  WHEN 'bonus consu 2' THEN 'BB'
  WHEN 'bonus consu 3' THEN 'BC'
  WHEN 'ingredients' THEN 'IA'
  WHEN 'ingredients ii' THEN 'IB'
  WHEN 'materials' THEN 'M'
  ELSE location_prefix
END;
