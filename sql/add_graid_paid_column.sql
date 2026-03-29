-- Add paid tracking column to graid_event_totals
ALTER TABLE graid_event_totals
  ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT FALSE;
