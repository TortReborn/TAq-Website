-- Warning tracker (TAQ-79)
-- One profile per player (by Minecraft uuid), many entries per profile.
-- The website writes; the bot mirrors profiles into a TE forum channel and
-- owns the Dishonored Fish role in the main Discord.
-- Spec: docs/specs/taq-79-warning-tracker.md

CREATE TABLE IF NOT EXISTS warning_profiles (
  uuid                UUID          PRIMARY KEY,
  ign                 VARCHAR(64)   NOT NULL,       -- display cache, refreshed on each new entry
  discord_id          BIGINT,                       -- the player's own Discord account, if known
  forum_thread_id     BIGINT,                       -- forum post = thread; its starter message id is the same id
  needs_sync          BOOLEAN       NOT NULL DEFAULT TRUE,
  legacy_threads      JSONB         NOT NULL DEFAULT '[]',  -- [{url, title}] discussion threads from the old channels
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_warnings (
  id                  SERIAL        PRIMARY KEY,
  uuid                UUID          NOT NULL REFERENCES warning_profiles(uuid),
  ign                 VARCHAR(64)   NOT NULL,       -- name at the time of the entry
  kind                VARCHAR(20)   NOT NULL CHECK (kind IN
                        ('note', 'soft', 'written', 'formal', 'dishonored_fish',
                         'timeout', 'mute', 'demotion', 'kick', 'ban', 'blacklist')),
  rule                TEXT          NOT NULL,       -- free text; may name several rules
  notes               TEXT,
  issued_by           BIGINT        NOT NULL,       -- Discord id
  issued_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),   -- backfill sets the original time
  revoked_at          TIMESTAMPTZ,
  revoked_by          BIGINT,
  revoke_reason       TEXT,
  source              VARCHAR(10)   NOT NULL DEFAULT 'website' CHECK (source IN ('website', 'discord', 'backfill')),
  source_message_id   BIGINT,                       -- backfill idempotency key, unique per player
  source_url          TEXT,                         -- backfill: link to the original Discord message
  discord_message_id  BIGINT,                       -- NULL = not yet posted; -1 = claimed by the bot; 0 = backfill, never mirrored
  discord_synced_at   TIMESTAMPTZ,                  -- bot re-renders the message when updated_at is newer
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_player_warnings_source ON player_warnings(source_message_id, uuid);
CREATE INDEX IF NOT EXISTS idx_player_warnings_uuid ON player_warnings(uuid, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_warnings_unposted ON player_warnings(id) WHERE discord_message_id IS NULL;

CREATE TABLE IF NOT EXISTS player_warning_attachments (
  id            SERIAL        PRIMARY KEY,
  warning_id    INT           NOT NULL REFERENCES player_warnings(id) ON DELETE CASCADE,
  s3_key        TEXT          NOT NULL,
  filename      VARCHAR(255)  NOT NULL,
  content_type  VARCHAR(50)   NOT NULL,
  size_bytes    INT           NOT NULL,
  uploaded_by   BIGINT        NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_warning_attachments_warning ON player_warning_attachments(warning_id);
