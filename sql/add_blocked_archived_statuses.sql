-- TAQ-26: Add 'blocked' and 'archived' statuses to tracker_tickets.
-- Also relies on updated_at to age out deployed/declined tickets into
-- archived after 7 days (handled in-app on list fetch).

ALTER TABLE tracker_tickets
  DROP CONSTRAINT IF EXISTS tracker_tickets_status_check;

ALTER TABLE tracker_tickets
  ADD CONSTRAINT tracker_tickets_status_check
  CHECK (status IN ('untriaged', 'todo', 'blocked', 'in_progress', 'deployed', 'declined', 'archived'));
