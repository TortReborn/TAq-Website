-- Per-user inventory edit grants. A narwhal can hand the narwhal-tier
-- powers of the Inventory page (items, categories, reordering, Woealer)
-- to a named exec member without promoting them. See TAQ-62.
--
-- Scan profiles and this grant list itself stay narwhal-only, so a
-- grantee cannot escalate.

CREATE TABLE IF NOT EXISTS inventory_editors (
  discord_id     BIGINT      PRIMARY KEY,
  granted_by     BIGINT      NOT NULL,
  granted_by_ign TEXT        NOT NULL,
  note           TEXT        NOT NULL DEFAULT '',
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE inventory_editors IS
  'Discord ids granted narwhal-tier edit rights on the exec Inventory page. Grants are inert for anyone who cannot open /exec.';
COMMENT ON COLUMN inventory_editors.granted_by_ign IS
  'IGN of the granting narwhal at grant time, kept so the audit line survives renames and demotions.';
