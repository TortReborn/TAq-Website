-- TAQ-77: accepted guild applications whose ticket was closed without the
-- player ever joining stayed 'accepted' forever and inflated the pending-join
-- count on the kick list / activity pages. Add a terminal 'expired' status
-- (set by the bot when it closes such a ticket) and retire the existing
-- stale rows.

ALTER TABLE applications DROP CONSTRAINT applications_status_check;
ALTER TABLE applications ADD CONSTRAINT applications_status_check
  CHECK (status IN ('pending', 'accepted', 'denied', 'expired'));

-- Backfill: accepted guild applications whose ticket is already closed and
-- whose applicant never got a live discord link (i.e. never joined).
UPDATE applications a
SET status = 'expired'
WHERE a.status = 'accepted'
  AND a.application_type = 'guild'
  AND a.poll_status = ':red_circle: Closed'
  AND NOT EXISTS (
    SELECT 1 FROM discord_links dl
    WHERE dl.discord_id = CAST(a.discord_id AS BIGINT)
      AND dl.linked = TRUE
  );
