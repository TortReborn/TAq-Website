-- Analytics tables for tracking site usage
-- Only accessible to Thundderr (Discord ID: 170719819715313665)

-- Track every login event
CREATE TABLE IF NOT EXISTS analytics_logins (
  id         SERIAL       PRIMARY KEY,
  discord_id TEXT         NOT NULL,
  ign        VARCHAR(64),
  rank       VARCHAR(32),
  role       VARCHAR(10),
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_logins_discord ON analytics_logins(discord_id);
CREATE INDEX IF NOT EXISTS idx_analytics_logins_created ON analytics_logins(created_at);

-- Track page visits with time-on-page
CREATE TABLE IF NOT EXISTS analytics_page_views (
  id           SERIAL       PRIMARY KEY,
  discord_id   TEXT,
  ign          VARCHAR(64),
  page_path    VARCHAR(500)  NOT NULL,
  referrer     VARCHAR(500),
  duration_ms  INT,
  session_id   VARCHAR(64)   NOT NULL,
  created_at   TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_pv_discord ON analytics_page_views(discord_id);
CREATE INDEX IF NOT EXISTS idx_analytics_pv_path ON analytics_page_views(page_path);
CREATE INDEX IF NOT EXISTS idx_analytics_pv_created ON analytics_page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_pv_session ON analytics_page_views(session_id);

-- Track user actions (clicks, form submissions, CRUD operations)
CREATE TABLE IF NOT EXISTS analytics_actions (
  id           SERIAL       PRIMARY KEY,
  discord_id   TEXT,
  ign          VARCHAR(64),
  page_path    VARCHAR(500)  NOT NULL,
  action_type  VARCHAR(50)   NOT NULL,
  action_label VARCHAR(200)  NOT NULL,
  metadata     JSONB,
  session_id   VARCHAR(64),
  created_at   TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_actions_discord ON analytics_actions(discord_id);
CREATE INDEX IF NOT EXISTS idx_analytics_actions_type ON analytics_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_analytics_actions_path ON analytics_actions(page_path);
CREATE INDEX IF NOT EXISTS idx_analytics_actions_created ON analytics_actions(created_at);
