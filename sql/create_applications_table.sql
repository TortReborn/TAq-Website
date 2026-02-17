CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  application_type VARCHAR(20) NOT NULL CHECK (application_type IN ('guild', 'community')),
  discord_id VARCHAR(30) NOT NULL,
  discord_username VARCHAR(50) NOT NULL,
  discord_avatar VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'denied')),
  answers JSONB NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by VARCHAR(50),
  channel_id BIGINT,                              -- Set by bot when it creates the Discord channel
  thread_id BIGINT,                               -- Discussion thread ID in exec channel
  poll_message_id BIGINT,                          -- Poll message ID in exec channel
  guild_leave_pending BOOLEAN DEFAULT FALSE,       -- Accepted guild member waiting to leave current guild
  poll_status TEXT DEFAULT ':green_circle: Received' -- Current poll embed status string
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);
CREATE INDEX IF NOT EXISTS idx_applications_submitted_at ON applications (submitted_at);
-- Prevent duplicate pending apps from same Discord user per type
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_pending_discord
  ON applications (discord_id, application_type)
  WHERE status = 'pending';
