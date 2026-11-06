-- Separate operational stock from consumables stored on Bonus Consu classes.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS reserve_quantity INT NOT NULL DEFAULT 0
  CHECK (reserve_quantity >= 0);

UPDATE inventory_items
SET quantity = 0, reserve_quantity = 0
WHERE archived = TRUE;
