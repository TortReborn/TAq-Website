-- Cache system for API data with TTL
-- Run this SQL to set up the cache table

CREATE TABLE IF NOT EXISTS cache_entries (
    cache_key VARCHAR(50) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    fetch_count INTEGER DEFAULT 1,
    last_error TEXT NULL,
    error_count INTEGER DEFAULT 0
);

-- Index for efficient cleanup and status queries
CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache_entries (expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_created_at ON cache_entries (created_at);

-- Function to automatically clean up expired entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM cache_entries WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a function to get cache statistics
CREATE OR REPLACE VIEW cache_status AS
SELECT 
    cache_key,
    EXTRACT(EPOCH FROM created_at) * 1000 as timestamp,
    EXTRACT(EPOCH FROM expires_at) * 1000 as expires_at,
    expires_at > NOW() as is_fresh,
    fetch_count,
    error_count,
    last_error,
    created_at as last_updated,
    CASE 
        WHEN expires_at > NOW() THEN 'fresh'
        ELSE 'expired'
    END as status
FROM cache_entries
ORDER BY cache_key;
