-- Resend delivery events (POST /api/resend-events, src/resend_events.js).
-- Fresh-database shape. Live: schema/migrations/2026-11-24-resend-events.sql.
--
-- One row per Svix delivery (svix_id), so a retried or replayed event is
-- recorded once. Only events tagged with a brand this Worker sends for
-- (adapttolife, bodyshop) and its own ENV_NAME are kept. email_id is Resend's
-- message id: the same id the form outbox stores in its receipt column.
-- Bounces, complaints and failures are also written to send_failures once.
CREATE TABLE IF NOT EXISTS resend_events (
  svix_id     TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  event_at    TEXT,
  type        TEXT NOT NULL,
  email_id    TEXT,
  brand       TEXT NOT NULL,
  kind        TEXT,
  env         TEXT NOT NULL,
  recipient   TEXT,
  detail      TEXT
);
CREATE INDEX IF NOT EXISTS resend_events_email ON resend_events(email_id);
CREATE INDEX IF NOT EXISTS resend_events_type ON resend_events(type,received_at);
