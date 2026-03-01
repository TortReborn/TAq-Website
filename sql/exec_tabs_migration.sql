-- Add optional reason column to aspect_blacklist
ALTER TABLE aspect_blacklist ADD COLUMN IF NOT EXISTS reason TEXT;

-- Create promotion queue table
CREATE TABLE IF NOT EXISTS promotion_queue (
  id SERIAL PRIMARY KEY,
  uuid UUID NOT NULL,
  ign VARCHAR(64) NOT NULL,
  current_rank VARCHAR(32) NOT NULL,
  new_rank VARCHAR(32),            -- NULL for 'remove' action
  action_type VARCHAR(10) NOT NULL CHECK (action_type IN ('promote', 'demote', 'remove')),
  queued_by_discord_id BIGINT NOT NULL,
  queued_by_ign VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_promo_queue_status ON promotion_queue(status);
