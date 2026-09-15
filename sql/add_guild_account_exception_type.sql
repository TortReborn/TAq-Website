-- TAQ-88: guild-owned in-game accounts (Woealer = ingredient stock,
-- GordLonner = guild LE) are exceptions of their own kind, not personal alts.
-- Applied to prod 2026-09-15 together with the two row updates below.

ALTER TABLE management_exceptions DROP CONSTRAINT IF EXISTS management_exceptions_exception_type_check;
ALTER TABLE management_exceptions ADD CONSTRAINT management_exceptions_exception_type_check
  CHECK (exception_type IN ('alt', 'rank_exception', 'role_exception', 'guild_account', 'other'));

UPDATE management_exceptions me
   SET exception_type = 'guild_account',
       account_owner  = 'The Aquarium',
       linked_main    = NULL,
       minecraft_uuid = COALESCE(me.minecraft_uuid, gr.uuid),
       updated_at     = NOW()
  FROM guild_roster gr
 WHERE gr.ign = me.ign
   AND me.ign IN ('Woealer', 'GordLonner')
   AND me.exception_type = 'alt';
