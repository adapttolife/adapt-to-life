-- The newsletter signup ledger (src/newsletter.js; docs/EMAIL.md, "Contacts,
-- lists and unsubscribing"). Apply with:
--
--   cfrun npx wrangler d1 execute agent-mail --remote \
--     --file schema/migrations/2026-11-25-newsletter-signups.sql
-- (agent-mail lives in the Adapt To Life Cloudflare account.)
--
-- Additive only: one new table and its index, safe with the code on main and
-- on staging at once. Run BEFORE the code that writes it deploys (signups
-- answer "temporarily unavailable" without it); the release's schema gate
-- (`cfrun node scripts/check-d1-schema.mjs agent-mail`) refuses to release
-- until it is applied. Safe to run twice. newsletter_delivery_claims stays
-- until no live code writes it.
CREATE TABLE IF NOT EXISTS newsletter_signups (
  brand TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  source TEXT,
  env TEXT NOT NULL DEFAULT 'production',
  joined_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','done','review')),
  attempts INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  next_attempt_at TEXT,
  contact_at TEXT,
  topic_at TEXT,
  welcome_first_attempted_at TEXT,
  welcome_rendered TEXT,
  welcome_at TEXT,
  welcome_id TEXT,
  unsubscribed_at TEXT,
  note TEXT,
  error TEXT,
  PRIMARY KEY (env, brand, email)
);
CREATE INDEX IF NOT EXISTS newsletter_signups_due ON newsletter_signups(env, state, next_attempt_at);
