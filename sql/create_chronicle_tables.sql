-- Map Chronicle: community-maintained alliances and historical events shown
-- on the map. Proposals flow through chronicle_submissions (pending →
-- approved/rejected by an exec); approved payloads materialize into the
-- alliance/event tables. The submissions table doubles as the audit log.
--
-- Reference copy — the website creates these lazily on first use
-- (lib/chronicle-db.ts ensureChronicleTables).

CREATE TABLE IF NOT EXISTS chronicle_alliances (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(60)   NOT NULL,
  tag         VARCHAR(8)    NOT NULL DEFAULT '',
  color       VARCHAR(7)    NOT NULL,          -- hex color, validated app-side
  kind        VARCHAR(12)   NOT NULL DEFAULT 'war', -- 'war' | 'community'
  description VARCHAR(1000) NOT NULL DEFAULT '',
  created_by  VARCHAR(30)   NOT NULL,          -- discord id of original submitter
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chronicle_memberships (
  id          SERIAL PRIMARY KEY,
  alliance_id INTEGER     NOT NULL REFERENCES chronicle_alliances(id) ON DELETE CASCADE,
  guild_name  VARCHAR(60) NOT NULL,
  joined_at   TIMESTAMPTZ NOT NULL,
  left_at     TIMESTAMPTZ NULL                 -- null while still a member
);

CREATE INDEX IF NOT EXISTS idx_chronicle_memberships_alliance
  ON chronicle_memberships(alliance_id);

CREATE TABLE IF NOT EXISTS chronicle_events (
  id          SERIAL PRIMARY KEY,
  event_type  VARCHAR(20)   NOT NULL,          -- war | treaty | founding | disband | other
  title       VARCHAR(80)   NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  starts_at   TIMESTAMPTZ   NOT NULL,
  ends_at     TIMESTAMPTZ   NULL,
  guilds      JSONB         NOT NULL DEFAULT '[]',
  alliances   JSONB         NOT NULL DEFAULT '[]', -- alliance names involved
  created_by  VARCHAR(30)   NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chronicle_submissions (
  id             SERIAL PRIMARY KEY,
  kind           VARCHAR(20)  NOT NULL,        -- alliance | event
  target_id      INTEGER      NULL,            -- null = new entity, else edit of existing
  payload        JSONB        NOT NULL,        -- proposed full entity state
  note           VARCHAR(300) NOT NULL DEFAULT '',
  status         VARCHAR(10)  NOT NULL DEFAULT 'pending',
  submitted_by   VARCHAR(30)  NOT NULL,
  submitted_name VARCHAR(60)  NOT NULL DEFAULT '',
  submitted_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_by    VARCHAR(60)  NULL,
  review_note    VARCHAR(300) NULL,
  reviewed_at    TIMESTAMPTZ  NULL
);

CREATE INDEX IF NOT EXISTS idx_chronicle_submissions_status
  ON chronicle_submissions(status);
