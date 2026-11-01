-- Recruitment tracking (TAQ-140): exec members clock in and out of party
-- finder recruiting, and log the guild's shouts. Days are UTC, the days the
-- shout limit resets on.

CREATE TABLE IF NOT EXISTS recruitment_pfinder_sessions (
  id          SERIAL       PRIMARY KEY,
  discord_id  BIGINT       NOT NULL,
  ign         VARCHAR(64)  NOT NULL,
  started_at  TIMESTAMPTZ  NOT NULL,
  ended_at    TIMESTAMPTZ,                -- NULL while clocked in
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (ended_at IS NULL OR ended_at > started_at)
);

-- One open session per person
CREATE UNIQUE INDEX IF NOT EXISTS uq_recruitment_pfinder_open
  ON recruitment_pfinder_sessions (discord_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recruitment_pfinder_started
  ON recruitment_pfinder_sessions (started_at);

-- The guild shares 3 shouts a UTC day. Each shout takes a numbered slot on
-- its day, so the unique key is the limit: a 4th has no slot to take.
-- Deleting a mis-logged shout frees its slot.
CREATE TABLE IF NOT EXISTS recruitment_shouts (
  id          SERIAL       PRIMARY KEY,
  discord_id  BIGINT       NOT NULL,
  ign         VARCHAR(64)  NOT NULL,
  shouted_at  TIMESTAMPTZ  NOT NULL,
  shout_day   DATE         GENERATED ALWAYS AS ((shouted_at AT TIME ZONE 'UTC')::date) STORED,
  slot        SMALLINT     NOT NULL CHECK (slot BETWEEN 1 AND 3),
  note        TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (shout_day, slot)
);
