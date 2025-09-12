-- Cache table for external bot managed data
-- This table stores cached API data populated by an external bot
-- Web application only reads from this cache

CREATE TABLE IF NOT EXISTS cache_entries (
    cache_key VARCHAR(50) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    fetch_count INTEGER DEFAULT 1,
    last_error TEXT NULL,
    error_count INTEGER DEFAULT 0
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache_entries (expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_created_at ON cache_entries (created_at);

-- Expected cache keys populated by external bot:
-- 'territories'   - Territory data from Wynncraft API
-- 'guildData'     - Guild member data from Wynncraft API  
-- 'aspectData'    - Aspect data from Athena/Nori.fish API
-- 'lootpoolData'  - Lootpool data from Athena/Nori.fish API
