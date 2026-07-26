-- Narwhal-only documentation for account/rank exceptions and guild alliances.

CREATE TABLE IF NOT EXISTS management_exceptions (
  id              BIGSERIAL   PRIMARY KEY,
  discord_user    TEXT,
  discord_id      BIGINT,
  ign             TEXT        NOT NULL,
  minecraft_uuid  UUID,
  exception_type  TEXT        NOT NULL DEFAULT 'other'
                              CHECK (exception_type IN ('alt', 'rank_exception', 'role_exception', 'other')),
  linked_main     TEXT,
  account_owner   TEXT,
  in_game_rank    TEXT,
  taq_role        TEXT,
  access_notes    TEXT,
  notes           TEXT,
  created_by      TEXT,
  updated_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_management_exceptions_ign
  ON management_exceptions(LOWER(ign));

CREATE TABLE IF NOT EXISTS guild_alliances (
  id              BIGSERIAL   PRIMARY KEY,
  guild_name      TEXT        NOT NULL UNIQUE,
  guild_prefix    TEXT        NOT NULL,
  discord_role_id BIGINT      NOT NULL,
  display_rank    TEXT        NOT NULL DEFAULT 'Navigator',
  notes           TEXT,
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by      TEXT,
  updated_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO management_exceptions (
  ign, exception_type, linked_main, account_owner, in_game_rank, taq_role, access_notes, notes
)
SELECT *
FROM (VALUES
  ('Woealer', 'alt', 'Gonner', 'Gonner', 'Chief', 'Chief', '@Woealer Access', 'Consumable and ingredient storage account.'),
  ('GordLonner', 'alt', 'Gonner', 'Gonner', 'Chief', 'Chief', 'Kenji, Rippi, Gonner', NULL),
  ('Sunveil', 'role_exception', 'Sunveil', 'Sunveil', 'Chief', 'Narwhal', 'Kio, Kenji, Sunveil', NULL),
  ('CuzImTimer', 'role_exception', 'Timer', 'Timer', 'Chief', 'Narwhal', 'Kenji, Wood, Tex, Timer', NULL),
  ('_SlyGuy_', 'rank_exception', 'Lava', 'Gonner', 'Strategist', 'Manatee', 'Lava', 'Discord username: lava286.')
) AS seed(ign, exception_type, linked_main, account_owner, in_game_rank, taq_role, access_notes, notes)
WHERE NOT EXISTS (SELECT 1 FROM management_exceptions);

INSERT INTO guild_alliances (
  guild_name, guild_prefix, discord_role_id, display_rank, notes, enabled
)
VALUES ('Nerfuria', 'NIA', 1414022229435482163, 'Navigator', 'Friendly terms.', TRUE)
ON CONFLICT (guild_name) DO NOTHING;
