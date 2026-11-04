-- TAQ-142: template panels. A panel with `template` set is never posted;
-- the bot sends its published revision each time that event happens, filling
-- in the member (welcome_dm: the DM a new guild member gets on registration,
-- welcome_post: the "Welcome Aboard!" post in the welcome channel).
--
-- Run once per database, then seed the two templates with Tort-Reborn's
-- scripts/seed_bot_panels.py (it leaves existing panels alone). Until they
-- are seeded the bot sends its built-in welcome, as before.

ALTER TABLE bot_panels ADD COLUMN IF NOT EXISTS template VARCHAR(32) UNIQUE;
