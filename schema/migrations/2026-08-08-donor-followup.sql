-- Givebutter is the money system of record. This table is ATL's durable donor
-- journey ledger: one row per transaction, communication consent as received,
-- and the state of ATL's separate thank-you email.
CREATE TABLE IF NOT EXISTS donor_gifts (
  transaction_id       TEXT PRIMARY KEY,
  contact_id           TEXT,
  first_name           TEXT,
  last_name            TEXT,
  email                TEXT,
  amount               REAL NOT NULL,
  donated              REAL NOT NULL,
  campaign_id           TEXT,
  campaign_title        TEXT,
  communication_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (communication_opt_in IN (0,1)),
  recurring             INTEGER NOT NULL DEFAULT 0 CHECK (recurring IN (0,1)),
  transacted_at         TEXT NOT NULL,
  email_status          TEXT NOT NULL CHECK (email_status IN ('pending','sending','retry','sent','failed','no_email')),
  attempt_count         INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  email_attempted_at    TEXT,
  email_sent_at         TEXT,
  next_attempt_at       TEXT,
  last_error            TEXT,
  lease_token           TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS donor_gifts_email ON donor_gifts (email, transacted_at);
CREATE INDEX IF NOT EXISTS donor_gifts_opt_in ON donor_gifts (communication_opt_in, transacted_at);
CREATE INDEX IF NOT EXISTS donor_gifts_email_queue
  ON donor_gifts (email_status, next_attempt_at, email_attempted_at);
