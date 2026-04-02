-- Tracker: Bug Reports & Feature Requests
-- Two tables: tickets and comments

CREATE TABLE IF NOT EXISTS tracker_tickets (
  id            SERIAL        PRIMARY KEY,
  type          VARCHAR(20)   NOT NULL CHECK (type IN ('bug', 'feature')),
  system        TEXT[]        NOT NULL DEFAULT '{}',
  title         VARCHAR(200)  NOT NULL,
  description   TEXT          NOT NULL,
  status        VARCHAR(20)   NOT NULL DEFAULT 'untriaged'
                              CHECK (status IN ('untriaged', 'todo', 'in_progress', 'deployed', 'declined')),
  priority      VARCHAR(10)   NOT NULL DEFAULT 'medium'
                              CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  submitted_by  BIGINT        NOT NULL,
  assigned_to   BIGINT,
  due_date      DATE,
  position      INT           NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracker_comments (
  id            SERIAL        PRIMARY KEY,
  ticket_id     INT           NOT NULL REFERENCES tracker_tickets(id) ON DELETE CASCADE,
  author_id     BIGINT        NOT NULL,
  body          TEXT          NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracker_tickets_status ON tracker_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tracker_tickets_system ON tracker_tickets(system);
CREATE INDEX IF NOT EXISTS idx_tracker_comments_ticket ON tracker_comments(ticket_id);
