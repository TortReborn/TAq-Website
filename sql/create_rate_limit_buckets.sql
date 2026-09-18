-- Shared rate-limit counters (TAQ-94).
--
-- lib/rate-limit.ts keeps its counters in process memory, which on Vercel
-- means one independent bucket per serverless instance: a caller who fans
-- requests across instances is never limited. For the public write endpoints
-- that matters (analytics), lib/shared-rate-limit.ts keeps a fixed-window
-- counter here instead, so every instance sees the same count.
--
-- Keys are a salted hash of the client identifier, never the raw IP. Rows
-- are only meaningful inside their window; old ones are swept opportunistically.
-- lib/shared-rate-limit.ts also creates this table on first use.

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    bucket_key    VARCHAR(80)  NOT NULL,
    window_start  TIMESTAMPTZ  NOT NULL,
    count         INTEGER      NOT NULL DEFAULT 1,
    PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_window ON rate_limit_buckets (window_start);
