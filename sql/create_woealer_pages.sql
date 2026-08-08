-- Woealer storage reference pages, maintained by hand. Not linked to
-- inventory_items: nothing scans this. See TAQ-59.

CREATE TABLE IF NOT EXISTS woealer_pages (
  id         BIGSERIAL   PRIMARY KEY,
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  shared     BOOLEAN     NOT NULL DEFAULT FALSE,
  notes      TEXT        NOT NULL DEFAULT '',
  sort_order INT         NOT NULL DEFAULT 0,
  archived   BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS woealer_slots (
  id         BIGSERIAL   PRIMARY KEY,
  page_id    BIGINT      NOT NULL REFERENCES woealer_pages(id) ON DELETE CASCADE,
  label      TEXT        NOT NULL,
  contents   TEXT        NOT NULL DEFAULT '',
  sort_order INT         NOT NULL DEFAULT 0,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_woealer_slots_page ON woealer_slots(page_id, sort_order);

COMMENT ON TABLE woealer_pages IS
  'One Woealer storage area: the account-wide bank (shared = TRUE) or a character slot.';
COMMENT ON COLUMN woealer_pages.shared IS
  'TRUE = account-wide bank, reachable from any character; FALSE = a single character slot''s own bank.';
COMMENT ON COLUMN woealer_pages.notes IS
  'Freeform manual documentation for this page. Never auto-generated.';
COMMENT ON COLUMN woealer_slots.label IS
  'Bank page marker as exec writes it — "1", "12", "D4". Free text, not an integer.';
