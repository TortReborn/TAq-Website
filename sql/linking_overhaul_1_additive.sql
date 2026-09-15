-- Linking overhaul, step 1 of 2: additive schema + backfill (TAQ-76).
--
-- Background: docs/specs/taq-76-linking-audit.md in Tort-Reborn. discord_links
-- becomes identity-only (one Discord account <-> one Minecraft account). What it
-- used to also mean moves out:
--
--   membership      -> guild_roster (now) + membership_stints (history)
--   rank            -> stays on discord_links, but nullable and FK-checked
--   honorifics      -> member_honorifics
--   application     -> applications (already there)
--
-- Safe to run against a live database with the OLD code still deployed: every
-- change here is additive or widens a constraint. Step 2 drops the retired
-- columns and must only run once the new bot + website are live.
--
-- Idempotent: re-running is a no-op.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. rank_definitions -- the one list of Discord ranks both codebases validate
--    against. 'member' ranks come from Tort-Reborn Helpers/variables.py
--    discord_ranks (in order); 'ally' ranks from Commands/register.py.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rank_definitions (
  name       VARCHAR(32) PRIMARY KEY,
  kind       VARCHAR(8)  NOT NULL CHECK (kind IN ('member', 'ally')),
  sort_order INT         NOT NULL UNIQUE
);

INSERT INTO rank_definitions (name, kind, sort_order) VALUES
  ('Starfish',   'member', 0),
  ('Manatee',    'member', 1),
  ('Piranha',    'member', 2),
  ('Angler',     'member', 3),
  ('Swordfish',  'member', 4),
  ('Hammerhead', 'member', 5),
  ('Sailfish',   'member', 6),
  ('Dolphin',    'member', 7),
  ('Narwhal',    'member', 8),
  ('Hydra',      'member', 9),
  ('Navigator',  'ally',   100)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. guild_roster -- who is in the in-game guild right now. Maintained by the
--    bot's update_member_data loop from the same API diff that posts the
--    join/leave embeds. Seeded here from the cached guildData blob.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guild_roster (
  uuid         UUID        PRIMARY KEY,
  ign          VARCHAR(64) NOT NULL,
  in_game_rank VARCHAR(16) NOT NULL,
  joined_at    TIMESTAMPTZ,                          -- API 'joined'
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO guild_roster (uuid, ign, in_game_rank, joined_at)
SELECT (m->>'uuid')::uuid, m->>'name', m->>'rank', NULLIF(m->>'joined', '')::timestamptz
  FROM cache_entries ce, jsonb_array_elements(ce.data->'members') m
 WHERE ce.cache_key = 'guildData'
   AND m->>'uuid' IS NOT NULL
ON CONFLICT (uuid) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. membership_stints -- one row per stint in the guild. Opened on join,
--    closed on leave. Backfilled from player_activity daily snapshots.
--    A member whose API fetch fails gets no row that day, and the loop has
--    had multi-day outages, so gaps of up to 14 days do not split a stint;
--    real re-joins in the data cluster at 16+ days. For current members the
--    API join date wins over the snapshots, and any island after it is
--    folded into the open stint.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS membership_stints (
  id            SERIAL      PRIMARY KEY,
  uuid          UUID        NOT NULL,
  discord_id    BIGINT,                                -- identity at the time, if linked
  joined_at     TIMESTAMPTZ NOT NULL,
  left_at       TIMESTAMPTZ,                           -- NULL = current stint
  wars_on_join  INT,
  rank_at_leave VARCHAR(32),
  left_via      VARCHAR(16),                           -- 'api_diff' | 'website_queue' | 'command' | 'button' | 'backfill'
  source        VARCHAR(16) NOT NULL DEFAULT 'live'    -- 'live' | 'backfill'
);
CREATE UNIQUE INDEX IF NOT EXISTS membership_stints_open_uq ON membership_stints (uuid) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS membership_stints_uuid_idx ON membership_stints (uuid, joined_at DESC);
CREATE INDEX IF NOT EXISTS membership_stints_discord_idx ON membership_stints (discord_id);

DO $$
DECLARE
  latest_day DATE;
BEGIN
  IF EXISTS (SELECT 1 FROM membership_stints) THEN
    RETURN;  -- already backfilled
  END IF;

  SELECT MAX(snapshot_date) INTO latest_day FROM player_activity;

  WITH ordered AS (
    SELECT uuid, snapshot_date, wars,
           CASE WHEN snapshot_date - LAG(snapshot_date) OVER (PARTITION BY uuid ORDER BY snapshot_date) > 14
                THEN 1 ELSE 0 END AS brk
      FROM player_activity
  ), grouped AS (
    SELECT uuid, snapshot_date, wars,
           SUM(brk) OVER (PARTITION BY uuid ORDER BY snapshot_date) AS g
      FROM ordered
  ), raw_islands AS (
    SELECT uuid, g,
           MIN(snapshot_date) AS first_day,
           MAX(snapshot_date) AS last_day,
           (ARRAY_AGG(wars ORDER BY snapshot_date))[1] AS wars_first
      FROM grouped
     GROUP BY uuid, g
  ), islands AS (
    -- For current members, everything from the API join date onward is one
    -- stint: keep the earlier islands as closed stints, collapse the rest.
    SELECT ri.uuid, ri.first_day, ri.last_day, ri.wars_first, FALSE AS is_open
      FROM raw_islands ri
      LEFT JOIN guild_roster gr ON gr.uuid = ri.uuid
     WHERE gr.uuid IS NULL
        OR ri.last_day::timestamptz < COALESCE(gr.joined_at, (SELECT MAX(first_day) FROM raw_islands r2 WHERE r2.uuid = ri.uuid)::timestamptz)
    UNION ALL
    SELECT ri.uuid,
           MIN(ri.first_day), MAX(ri.last_day),
           (ARRAY_AGG(ri.wars_first ORDER BY ri.first_day))[1],
           TRUE
      FROM raw_islands ri
      JOIN guild_roster gr ON gr.uuid = ri.uuid
     WHERE ri.last_day::timestamptz >= COALESCE(gr.joined_at, (SELECT MAX(first_day) FROM raw_islands r2 WHERE r2.uuid = ri.uuid)::timestamptz)
     GROUP BY ri.uuid
  )
  INSERT INTO membership_stints (uuid, discord_id, joined_at, left_at, wars_on_join, rank_at_leave, left_via, source)
  SELECT i.uuid,
         dl.discord_id,
         -- The open stint takes the API join date when the roster has one;
         -- a closed stint's first snapshot is the best we have.
         CASE WHEN i.is_open THEN COALESCE(gr.joined_at, i.first_day::timestamptz)
              ELSE i.first_day::timestamptz END,
         CASE WHEN i.is_open THEN NULL ELSE (i.last_day + 1)::timestamptz END,
         CASE WHEN i.is_open THEN COALESCE(dl.wars_on_join, i.wars_first) ELSE i.wars_first END,
         -- Only the most recent closed stint of someone no longer on the
         -- roster inherits the rank still sitting on their discord_links row.
         CASE WHEN gr.uuid IS NULL
               AND i.last_day = (SELECT MAX(last_day) FROM islands i2 WHERE i2.uuid = i.uuid)
               AND dl.rank IN (SELECT name FROM rank_definitions WHERE kind = 'member')
              THEN dl.rank END,
         CASE WHEN i.is_open THEN NULL ELSE 'backfill' END,
         'backfill'
    FROM islands i
    LEFT JOIN guild_roster gr ON gr.uuid = i.uuid
    LEFT JOIN discord_links dl ON dl.uuid = i.uuid;

  -- Roster members that never appeared in player_activity still get an open stint.
  INSERT INTO membership_stints (uuid, discord_id, joined_at, wars_on_join, source)
  SELECT gr.uuid, dl.discord_id, COALESCE(gr.joined_at, gr.first_seen), dl.wars_on_join, 'backfill'
    FROM guild_roster gr
    LEFT JOIN discord_links dl ON dl.uuid = gr.uuid
   WHERE NOT EXISTS (SELECT 1 FROM membership_stints ms WHERE ms.uuid = gr.uuid AND ms.left_at IS NULL);

  -- A roster member whose latest island closed before latest_day (missed
  -- snapshots) would otherwise have no open stint: reopen the latest one.
  UPDATE membership_stints ms
     SET left_at = NULL, left_via = NULL
    FROM guild_roster gr
   WHERE ms.uuid = gr.uuid
     AND ms.id = (SELECT id FROM membership_stints m2 WHERE m2.uuid = ms.uuid ORDER BY joined_at DESC LIMIT 1)
     AND NOT EXISTS (SELECT 1 FROM membership_stints m3 WHERE m3.uuid = ms.uuid AND m3.left_at IS NULL);
END $$;

-- ---------------------------------------------------------------------------
-- 4. member_honorifics -- Honored Fish / Retired Chief as a ledger keyed by the
--    player (TAQ-76). Backfilled from the discord_links snapshot flags; the
--    bot's scripts/backfill_honorifics.py adds current role holders.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS member_honorifics (
  id          SERIAL       PRIMARY KEY,
  uuid        UUID,                                -- NULL only for holders never linked (see CHECK)
  discord_id  BIGINT,
  ign         VARCHAR(64)  NOT NULL,
  honorific   VARCHAR(16)  NOT NULL CHECK (honorific IN ('honored_fish', 'retired_chief')),
  granted_by  BIGINT       NOT NULL,          -- Discord id; 0 for backfills
  granted_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  revoked_by  BIGINT,
  revoked_at  TIMESTAMPTZ,
  note        TEXT,
  CHECK (uuid IS NOT NULL OR discord_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS member_honorifics_active_uq ON member_honorifics (uuid, honorific) WHERE revoked_at IS NULL AND uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS member_honorifics_active_discord_uq ON member_honorifics (discord_id, honorific) WHERE revoked_at IS NULL AND uuid IS NULL;
CREATE INDEX IF NOT EXISTS member_honorifics_discord_idx ON member_honorifics (discord_id) WHERE revoked_at IS NULL;

INSERT INTO member_honorifics (uuid, discord_id, ign, honorific, granted_by, note)
SELECT dl.uuid, dl.discord_id, dl.ign, h.honorific, 0, 'backfill: discord_links flag'
  FROM discord_links dl
  CROSS JOIN LATERAL (
    SELECT 'honored_fish'::text AS honorific WHERE dl.was_honored_fish
    UNION ALL
    SELECT 'retired_chief' WHERE dl.was_retired_chief
  ) h
 WHERE dl.uuid IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM member_honorifics mh
      WHERE mh.uuid = dl.uuid AND mh.honorific = h.honorific AND mh.revoked_at IS NULL
   );

-- ---------------------------------------------------------------------------
-- 5. member_leave_prompts -- the per-leaver guild-log message with the
--    reset / honorific buttons (TAQ-76). Doubles as the audit of who pressed what.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS member_leave_prompts (
  message_id  BIGINT       PRIMARY KEY,
  uuid        UUID         NOT NULL,
  ign         VARCHAR(64)  NOT NULL,
  discord_id  BIGINT,
  last_rank   VARCHAR(32),
  posted_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_by BIGINT,
  resolved_at TIMESTAMPTZ,
  resolution  VARCHAR(16)  CHECK (resolution IN ('reset', 'honored_fish', 'retired_chief', 'noop'))
);

-- ---------------------------------------------------------------------------
-- 6. promotion_queue -- website removals may carry an honorific grant.
-- ---------------------------------------------------------------------------
ALTER TABLE promotion_queue ADD COLUMN IF NOT EXISTS grant_honorific VARCHAR(16);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promotion_queue_grant_honorific_check') THEN
    ALTER TABLE promotion_queue ADD CONSTRAINT promotion_queue_grant_honorific_check
      CHECK (grant_honorific IS NULL OR grant_honorific IN ('honored_fish', 'retired_chief'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. discord_links -- tighten identity, loosen rank.
-- ---------------------------------------------------------------------------
ALTER TABLE discord_links ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE discord_links ADD COLUMN IF NOT EXISTS linked_by BIGINT;

-- Every row has a uuid today (verified 2026-09-14). A row without one is not
-- an identity and must not exist; the only writer that created them
-- (/manage shells) no longer does.
DELETE FROM discord_links WHERE uuid IS NULL;
ALTER TABLE discord_links ALTER COLUMN uuid SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS discord_links_uuid_uq ON discord_links (uuid);

-- rank: '' -> NULL, retired names mapped, unknowns dropped, then FK.
ALTER TABLE discord_links ALTER COLUMN rank DROP NOT NULL;
UPDATE discord_links SET rank = NULL     WHERE rank = '';
UPDATE discord_links SET rank = 'Piranha' WHERE rank = 'Barracuda';
UPDATE discord_links SET rank = NULL
 WHERE rank IS NOT NULL AND rank NOT IN (SELECT name FROM rank_definitions);

-- A member rank on someone who is not on the roster is a leftover from a
-- removal that never cleared it. Their rank at leave is preserved on the
-- stint (step 3 ran first); ally ranks are not membership and stay.
UPDATE discord_links dl
   SET rank = NULL
 WHERE dl.rank IN (SELECT name FROM rank_definitions WHERE kind = 'member')
   AND NOT EXISTS (SELECT 1 FROM guild_roster gr WHERE gr.uuid = dl.uuid);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discord_links_rank_fk') THEN
    ALTER TABLE discord_links ADD CONSTRAINT discord_links_rank_fk
      FOREIGN KEY (rank) REFERENCES rank_definitions (name);
  END IF;
END $$;

-- Carry the stint-scoped facts across before step 2 drops the columns.
UPDATE membership_stints ms
   SET discord_id = dl.discord_id
  FROM discord_links dl
 WHERE ms.uuid = dl.uuid AND ms.discord_id IS NULL;

UPDATE membership_stints ms
   SET wars_on_join = dl.wars_on_join
  FROM discord_links dl
 WHERE ms.uuid = dl.uuid AND ms.left_at IS NULL AND ms.wars_on_join IS NULL;

-- ---------------------------------------------------------------------------
-- 8. current_members -- the question every auth check and roster page asks.
--    LEFT JOIN so roster members without a Discord link still appear.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW current_members AS
SELECT gr.uuid,
       gr.ign          AS guild_ign,
       gr.in_game_rank,
       gr.joined_at,
       gr.first_seen,
       gr.last_seen,
       dl.discord_id,
       dl.ign,
       dl.rank,
       dl.color_primary,
       dl.color_secondary,
       dl.color_tertiary,
       dl.color_role_name
  FROM guild_roster gr
  LEFT JOIN discord_links dl ON dl.uuid = gr.uuid;

COMMIT;

-- Sanity checks (run after commit):
-- SELECT COUNT(*) FROM guild_roster;                                  -- = roster size
-- SELECT COUNT(*) FROM membership_stints WHERE left_at IS NULL;       -- = roster size
-- SELECT COUNT(*) FROM discord_links WHERE rank IS NOT NULL
--    AND NOT EXISTS (SELECT 1 FROM current_members cm WHERE cm.discord_id = discord_links.discord_id)
--    AND rank IN (SELECT name FROM rank_definitions WHERE kind = 'member');  -- = 0
-- SELECT COUNT(*) FROM member_honorifics WHERE revoked_at IS NULL;
