-- Linking overhaul, step 2 of 2: drop the retired discord_links columns.
--
-- Run ONLY after linking_overhaul_1_additive.sql has been applied AND the new
-- Tort-Reborn + TAq-Website builds are live -- the old code reads every one
-- of these columns.
--
--   linked            -> membership is guild_roster / membership_stints
--   app_channel       -> applications.channel_id
--   wars_on_join      -> membership_stints.wars_on_join
--   was_honored_fish  -> member_honorifics
--   was_retired_chief -> member_honorifics
--
-- Dropping `linked` also drops the partial index discord_links_linked_uuid_uq;
-- discord_links_uuid_uq (step 1) is its replacement.

BEGIN;

ALTER TABLE discord_links
  DROP COLUMN IF EXISTS linked,
  DROP COLUMN IF EXISTS app_channel,
  DROP COLUMN IF EXISTS wars_on_join,
  DROP COLUMN IF EXISTS was_honored_fish,
  DROP COLUMN IF EXISTS was_retired_chief;

COMMIT;
