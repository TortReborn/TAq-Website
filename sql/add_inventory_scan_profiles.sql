-- Character-bank scan profiles for taq-management-utils.
-- Previously hardcoded as a Java switch statement in the mod (InventoryScanProfile.java),
-- which meant onboarding a new character bank (e.g. "Bonus Consu 4") required a mod
-- rebuild + redistribution. This table lets exec manage them from the website instead;
-- the mod fetches the active list from GET /api/inventory/catalog and falls back to its
-- built-in defaults if the fetch fails or the mod is running offline.

CREATE TABLE IF NOT EXISTS inventory_scan_profiles (
  id           BIGSERIAL   PRIMARY KEY,
  nickname     TEXT        NOT NULL,
  content_type TEXT        NOT NULL CHECK (content_type IN ('consumables', 'ingredients')),
  source_key   TEXT        NOT NULL UNIQUE,
  display_name TEXT        NOT NULL,
  start_page   INT         NOT NULL DEFAULT 1 CHECK (start_page >= 1),
  total_pages  INT         NOT NULL DEFAULT 12 CHECK (total_pages >= start_page),
  sort_order   INT         NOT NULL DEFAULT 0,
  archived     BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (nickname)
);

CREATE INDEX IF NOT EXISTS idx_inventory_scan_profiles_active
  ON inventory_scan_profiles(sort_order) WHERE archived = FALSE;

-- Seed with the profiles that were previously hardcoded in
-- InventoryScanProfile.forCharacterNickname().
INSERT INTO inventory_scan_profiles
  (nickname, content_type, source_key, display_name, start_page, total_pages, sort_order)
VALUES
  ('dry consu',      'consumables', 'character_bank:dry-consu',       'Dry Consu',      1, 12, 10),
  ('bonus consu 1',  'consumables', 'character_bank:bonus-consu-1',   'Bonus Consu 1',  1, 12, 20),
  ('bonus consu 2',  'consumables', 'character_bank:bonus-consu-2',   'Bonus Consu 2',  1, 12, 30),
  ('bonus consu 3',  'consumables', 'character_bank:bonus-consu-3',   'Bonus Consu 3',  1, 12, 40),
  ('ingredients',    'ingredients', 'character_bank:ingredients',     'Ingredients',    1, 12, 50),
  ('ingredients ii', 'ingredients', 'character_bank:ingredients-ii',  'Ingredients II', 1, 12, 60)
ON CONFLICT (nickname) DO NOTHING;
