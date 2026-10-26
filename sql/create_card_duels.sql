-- Tank Duels: card battles on the website, played with the bot's card
-- collection (card_collection / card_members, owned by Tort-Reborn). The
-- website only reads the bot's tables; these two are the website's own.
-- Design and rules: lib/duel/README.md.

CREATE TABLE IF NOT EXISTS duel_decks (
  id         BIGSERIAL   PRIMARY KEY,
  "user"     BIGINT      NOT NULL,
  name       VARCHAR(40) NOT NULL,
  cards      TEXT[]      NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_duel_decks_user ON duel_decks ("user");

CREATE TABLE IF NOT EXISTS duel_matches (
  id          BIGSERIAL   PRIMARY KEY,
  mode        VARCHAR(10) NOT NULL CHECK (mode IN ('practice', 'friendly')),
  status      VARCHAR(10) NOT NULL CHECK (status IN ('open', 'active', 'finished', 'cancelled')),
  p0          BIGINT      NOT NULL,
  p1          BIGINT,
  invitee     BIGINT,
  p0_deck     TEXT[]      NOT NULL,
  p1_deck     TEXT[],
  state       JSONB,
  version     INT         NOT NULL DEFAULT 0,
  deadline    TIMESTAMPTZ,
  winner      SMALLINT,
  end_reason  VARCHAR(12),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- Three-Front War (lib/duel/war) shares this table; the ruleset says which
-- engine the state belongs to. Idempotent, so the file can be re-run.
ALTER TABLE duel_matches ADD COLUMN IF NOT EXISTS ruleset VARCHAR(8) NOT NULL DEFAULT 'duel'
  CHECK (ruleset IN ('duel', 'war'));

-- Warfront (lib/duel/grid) widens the ruleset check. Dropped and re-added
-- under the name Postgres gave the original, so the file stays re-runnable.
ALTER TABLE duel_matches DROP CONSTRAINT IF EXISTS duel_matches_ruleset_check;
ALTER TABLE duel_matches ADD CONSTRAINT duel_matches_ruleset_check CHECK (ruleset IN ('duel', 'war', 'grid'));

CREATE INDEX IF NOT EXISTS idx_duel_matches_p0 ON duel_matches (p0, status);
CREATE INDEX IF NOT EXISTS idx_duel_matches_p1 ON duel_matches (p1, status);
CREATE INDEX IF NOT EXISTS idx_duel_matches_open ON duel_matches (invitee, created_at DESC) WHERE status = 'open';

COMMENT ON TABLE duel_decks IS
  'Saved decks. "user" is the Discord id, the same key as the bot''s card_collection. Ownership is checked when a deck is taken into a friendly match, not when it is saved.';
COMMENT ON TABLE duel_matches IS
  'One duel. state holds the full engine GameState (both hands and deck orders, RNG); it never leaves the server, players get a redacted view.';
COMMENT ON COLUMN duel_matches.ruleset IS
  'duel: state is a GameState (lib/duel/engine.ts). war: state is a WarState (lib/duel/war/engine.ts); pending round plans live in it and are never sent to the opponent. grid: state is a GridState (lib/duel/grid/engine.ts), Warfront.';
COMMENT ON COLUMN duel_matches.p1 IS
  'Seat 1. NULL while a challenge is open, and for practice games against the bot.';
COMMENT ON COLUMN duel_matches.invitee IS
  'A direct challenge names who may accept it; NULL means any member may.';
COMMENT ON COLUMN duel_matches.version IS
  'Bumped on every state change. Clients poll with it and send it with each action, so a stale or doubled action is refused instead of applied twice.';
COMMENT ON COLUMN duel_matches.deadline IS
  'When the active player''s clock runs out. Enforced lazily: the next request that sees it passed applies the timeout.';
