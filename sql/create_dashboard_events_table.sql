CREATE TABLE IF NOT EXISTS dashboard_events (
  id          SERIAL       PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  event_date  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by_discord BIGINT NOT NULL
);
