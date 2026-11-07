-- The newsletter welcome series (src/newsletter-series.js). Apply with:
--   cfrun npx wrangler d1 execute agent-mail --remote --file schema/migrations/2026-11-07-newsletter-welcome.sql
-- (agent-mail lives in the Adapt To Life Cloudflare account.)
--
-- One row per subscriber. step is the index of the NEXT email in the series,
-- next_at when it is due; claimed_until is a short lease so two cron runs
-- never send the same email. Resend stays the list of record; this table only
-- remembers where each person is in the series.
CREATE TABLE IF NOT EXISTS newsletter_journey (
  email TEXT PRIMARY KEY,
  contact_id TEXT,
  series TEXT NOT NULL DEFAULT 'welcome',
  step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL,
  next_at TEXT NOT NULL,
  claimed_until TEXT,
  last_sent_at TEXT,
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS newsletter_journey_due ON newsletter_journey (status, next_at);
