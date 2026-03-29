CREATE TABLE IF NOT EXISTS dashboard_notes (
  id         SERIAL       PRIMARY KEY,
  content    TEXT         NOT NULL,
  completed  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by_discord BIGINT NOT NULL
);
