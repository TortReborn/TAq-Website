-- Add 'ready_for_deploy' to tracker_tickets: merged, but not in a release yet.
-- Sits between in_progress and deployed. Not a terminal status, so it keeps
-- its drag order, leaves resolved_at empty and is never auto-archived.

ALTER TABLE tracker_tickets
  DROP CONSTRAINT IF EXISTS tracker_tickets_status_check;

ALTER TABLE tracker_tickets
  ADD CONSTRAINT tracker_tickets_status_check
  CHECK (status IN ('untriaged', 'todo', 'blocked', 'in_progress', 'ready_for_deploy', 'deployed', 'declined', 'archived'));
