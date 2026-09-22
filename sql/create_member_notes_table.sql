CREATE TABLE IF NOT EXISTS member_notes (
  uuid               UUID         PRIMARY KEY,
  note               TEXT         NOT NULL,
  updated_by_discord BIGINT       NOT NULL,
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
