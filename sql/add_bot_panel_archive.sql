-- TAQ-144: archived bot panels. An archived panel keeps its whole revision
-- history but drops to the Archive section of /exec/bot-panels and can't be
-- published until it is restored. Archiving doesn't touch Discord: the
-- panel's messages stay as they were last published.
--
-- Run once per database.

ALTER TABLE bot_panels ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE bot_panels ADD COLUMN IF NOT EXISTS archived_by VARCHAR(64);
