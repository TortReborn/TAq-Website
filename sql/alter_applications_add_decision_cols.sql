-- Add columns for website-initiated decisions with bot processing
ALTER TABLE applications ADD COLUMN IF NOT EXISTS invite_image TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS bot_processed BOOLEAN DEFAULT TRUE;
