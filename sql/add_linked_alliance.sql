ALTER TABLE discord_links
  ADD COLUMN IF NOT EXISTS alliance_id BIGINT
  REFERENCES guild_alliances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS discord_links_alliance_idx
  ON discord_links(alliance_id) WHERE alliance_id IS NOT NULL;
