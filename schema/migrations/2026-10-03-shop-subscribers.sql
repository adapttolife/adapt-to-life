-- Adapt Body Shop newsletter sign-ups (the footer form on adaptbodyshop.com).
--
-- Capture first, mirror second. The storefront is told "subscribed" only after
-- this row exists; the CRM tab and (later, Spec 197 P3) the Shopify customer
-- with email marketing consent are both copies made after the fact.
--
-- One row per address: email is the primary key and the handler inserts with
-- ON CONFLICT DO NOTHING, so signing up twice is a success that writes nothing.
-- The first sign-up's source and time are kept, because that is when consent
-- was given.
--
-- crm_row is the Sheets idempotency key, same contract as shop_messages:
-- NULL = not yet mirrored to the "Shop Newsletter" tab.
CREATE TABLE IF NOT EXISTS shop_subscribers (
  email       TEXT PRIMARY KEY,             -- lowercased
  created_at  TEXT NOT NULL,                -- ISO-8601 UTC, first sign-up
  source      TEXT NOT NULL DEFAULT '',     -- page the footer form was on
  ref         TEXT NOT NULL DEFAULT '',     -- affiliate code, app/lib/attribution.ts
  ip          TEXT NOT NULL DEFAULT '',
  country     TEXT NOT NULL DEFAULT '',
  user_agent  TEXT NOT NULL DEFAULT '',
  crm_row     TEXT                          -- A1 range written by the CRM cron; NULL = pending
);

CREATE INDEX IF NOT EXISTS shop_subscribers_pending ON shop_subscribers (crm_row, created_at);
