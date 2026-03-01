CREATE TABLE IF NOT EXISTS application_votes (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  voter_discord_id VARCHAR(30) NOT NULL,
  voter_username VARCHAR(50) NOT NULL,
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('accept', 'deny', 'abstain')),
  source VARCHAR(10) NOT NULL CHECK (source IN ('website', 'discord')),
  voted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(application_id, voter_discord_id)
);

CREATE INDEX IF NOT EXISTS idx_app_votes_app_id ON application_votes(application_id);
