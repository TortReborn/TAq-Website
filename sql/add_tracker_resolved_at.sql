-- TAQ-78: order the deployed / declined columns of the exec tracker by when
-- the ticket was resolved, newest first. Active columns keep their manual
-- drag order (position); the terminal ones were sorting by position too,
-- which is just whatever order things happened to be dropped in.
--
-- resolved_at is set when a ticket enters deployed or declined, kept when it
-- is archived, and cleared if it is moved back to an active column.

ALTER TABLE tracker_tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Backfill: the last touch is the best available approximation for tickets
-- already sitting in a terminal column.
UPDATE tracker_tickets
   SET resolved_at = updated_at
 WHERE status IN ('deployed', 'declined', 'archived')
   AND resolved_at IS NULL;
