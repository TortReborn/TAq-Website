-- Bot panels (website-edited persistent Discord messages)
-- Mirror of the block in Tort-Reborn/schema.sql; run once per database.

-- Bot panels: persistent Discord messages (guild info, role info, FAQ, shell
-- exchange, ...) edited on the website at /exec/bot-panels and published by
-- Tasks/publish_bot_panels.py. Every save is a revision, so the revision log
-- is the edit history and a revert is a new revision copying an old one.
-- content shape: Helpers/bot_panels.py (bot) and lib/bot-panels.ts (website).
CREATE TABLE IF NOT EXISTS bot_panels (
    id            SERIAL       PRIMARY KEY,
    slug          VARCHAR(48)  NOT NULL UNIQUE,
    name          VARCHAR(100) NOT NULL,
    channel_id    BIGINT,                          -- where the live messages are
    message_ids   BIGINT[]     NOT NULL DEFAULT '{}',  -- live bot messages, top to bottom
    published_rev INT,                             -- rev_number now live in Discord
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- status: pending (website wrote it) -> publishing (bot claimed it) ->
-- published | failed. An older pending revision is marked superseded when a
-- newer one for the same panel is claimed first.
CREATE TABLE IF NOT EXISTS bot_panel_revisions (
    id            SERIAL       PRIMARY KEY,
    panel_id      INT          NOT NULL REFERENCES bot_panels(id) ON DELETE CASCADE,
    rev_number    INT          NOT NULL,
    content       JSONB        NOT NULL,
    channel_id    BIGINT,                          -- NULL only on a seeded revision that was never placed
    adopt_message_ids BIGINT[],                    -- existing bot messages to take over instead of posting new ones
    note          VARCHAR(200) NOT NULL DEFAULT '',
    restored_from INT,                             -- rev_number this one reverted to
    author_id     BIGINT,
    author_name   VARCHAR(64),
    status        VARCHAR(12)  NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'publishing', 'published', 'failed', 'superseded')),
    error         TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    published_at  TIMESTAMPTZ,
    UNIQUE (panel_id, rev_number)
);

CREATE INDEX IF NOT EXISTS idx_bot_panel_revisions_pending
    ON bot_panel_revisions (created_at) WHERE status IN ('pending', 'publishing');
