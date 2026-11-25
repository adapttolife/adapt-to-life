-- Before Nov 25 2026 only; nothing writes it now (newsletter_signups below took over). Delivery dedupe only; Resend owns consent and suppression (the contact's unsubscribed flag). publication_id holds the Resend segment id.
CREATE TABLE IF NOT EXISTS newsletter_delivery_claims (claim_key TEXT PRIMARY KEY,publication_id TEXT NOT NULL,subscription_id TEXT,state TEXT NOT NULL);

-- One row per brand and address that joined a list (src/newsletter.js), written
-- before Resend is called. contact_at, topic_at and welcome_at stamp each step;
-- the cron finishes any that did not complete. welcome_rendered is the welcome
-- exactly as first rendered, resent under the same Idempotency-Key, and
-- welcome_first_attempted_at starts its 23 hour retry window. unsubscribed_at is
-- set (and topic_at cleared) when they leave that brand's list. env is the
-- Worker that owns the row; staging and production share this database.
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
  PRIMARY KEY (brand, email)
);
CREATE INDEX IF NOT EXISTS newsletter_signups_due ON newsletter_signups(env, state, next_attempt_at);
