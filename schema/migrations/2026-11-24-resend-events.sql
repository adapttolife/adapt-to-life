-- Resend delivery events table (src/resend_events.js). Apply with:
--   cfrun npx wrangler d1 execute agent-mail --remote \
--     --file schema/migrations/2026-11-24-resend-events.sql
-- (agent-mail lives in the Adapt To Life Cloudflare account; it already holds
-- send_failures, which this route writes bounces and complaints to.)
--
-- A new table only: safe with the code on main and staging at once, and safe to
-- run twice. Then `cfrun node scripts/check-d1-schema.mjs agent-mail` must
-- report ok. Same shape as schema/resend_events.sql.
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
