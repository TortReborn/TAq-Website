-- Auto-generated guild colors for guilds without API-sourced colors.
-- These are deterministic (hash-based) so they stay stable across restarts.
-- Kept separate from the real API colors in cache_entries so they never
-- overwrite authoritative data.

CREATE TABLE IF NOT EXISTS guild_generated_colors (
    guild_name   VARCHAR(100) PRIMARY KEY,
    color        VARCHAR(7) NOT NULL   -- e.g. '#A3C1D4'
);
