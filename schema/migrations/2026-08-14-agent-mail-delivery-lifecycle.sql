-- Agent-mail closes only after Cloudflare Email Sending reports delivery.
ALTER TABLE messages ADD COLUMN delivery_status TEXT;
ALTER TABLE messages ADD COLUMN delivery_event_id TEXT;
ALTER TABLE messages ADD COLUMN delivery_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_delivery_id ON messages(message_id) WHERE direction = 'out';

CREATE TABLE IF NOT EXISTS email_delivery_events (
  event_id     TEXT PRIMARY KEY,
  message_id   TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  terminal     INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  occurred_at  TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_delivery_message ON email_delivery_events(message_id, processed_at);
